"""
Decision service for AI Service.
"""

import json
import time
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
import re

from loguru import logger

from ..core.config import settings
from ..core.exceptions import (
    DecisionError,
    ModelError,
    ValidationError,
    CacheError,
)
from ..models.schemas import (
    DecisionRequest,
    DecisionResult,
    DecisionResponse,
    DecisionAction,
    RiskLevel,
    AIProvider,
)
from ..adapters.base import AdapterFactory, ModelRequest
from ..prompts.trading_prompts import TradingPrompts
from ..utils.cache import cache_result, generate_cache_key
from ..utils.logger import log_decision_request, log_decision_result


class DecisionService:
    """Service for generating AI trading decisions."""

    def __init__(self, cache_manager):
        self.cache_manager = cache_manager

    async def generate_decision(
        self,
        request: DecisionRequest,
        use_cache: bool = True,
    ) -> DecisionResult:
        """Generate a trading decision based on the request."""
        # Generate decision ID
        decision_id = str(uuid.uuid4())

        # Log the request
        log_decision_request(
            request_id=decision_id,
            account_id=request.account_info.account_id,
            ai_provider=request.ai_provider.value,
            model_name=request.model_name or "default",
            stock_count=len(request.stock_data),
            position_count=len(request.positions),
        )

        start_time = time.time()

        try:
            # Check cache if enabled
            if use_cache:
                cached_result = await self._get_cached_decision(request)
                if cached_result:
                    cached_result.decision_id = decision_id
                    cached_result.timestamp = datetime.now()
                    logger.info(f"Using cached decision for request: {decision_id}")
                    return cached_result

            # Get AI adapter
            adapter = await AdapterFactory.get_adapter(request.ai_provider)

            # Create prompt
            prompt = TradingPrompts.create_decision_prompt(request)
            system_prompt = TradingPrompts.get_system_prompt()

            # Prepare model request
            model_request = ModelRequest(
                prompt=prompt,
                model=request.model_name or adapter.default_model,
                temperature=request.temperature or settings.DEFAULT_TEMPERATURE,
                max_tokens=request.max_tokens or settings.DEFAULT_MAX_TOKENS,
                system_prompt=system_prompt,
            )

            # Generate response
            model_response = await adapter.generate(model_request)

            # Parse and validate response
            decision_data = self._parse_decision_response(
                model_response.content,
                request,
                model_response,
            )

            # Create decision result
            decision_result = DecisionResult(
                decision_id=decision_id,
                **decision_data,
            )

            processing_time_ms = int((time.time() - start_time) * 1000)
            decision_result.processing_time_ms = processing_time_ms

            # Log the result
            log_decision_result(
                request_id=decision_id,
                action=decision_result.action.value,
                symbol=decision_result.symbol,
                confidence=decision_result.confidence_score,
                risk_level=decision_result.risk_level.value,
                processing_time_ms=processing_time_ms,
                cost_usd=decision_result.cost_usd,
            )

            # Cache the result
            if use_cache:
                await self._cache_decision(request, decision_result)

            return decision_result

        except Exception as e:
            processing_time_ms = int((time.time() - start_time) * 1000)
            logger.error(
                f"Failed to generate decision {decision_id}: {str(e)}",
                exc_info=True,
            )
            raise DecisionError(
                message=f"Failed to generate decision: {str(e)}",
                error_code="DECISION_GENERATION_FAILED",
                details={
                    "decision_id": decision_id,
                    "processing_time_ms": processing_time_ms,
                },
            )

    async def _get_cached_decision(
        self,
        request: DecisionRequest,
    ) -> Optional[DecisionResult]:
        """Get cached decision for the request."""
        try:
            cache_key = generate_cache_key(
                prefix="decision",
                data=request.dict(),
                exclude_fields=["custom_prompt"],  # Exclude custom prompt from cache key
            )

            cached_data = await self.cache_manager.get(cache_key)
            if cached_data:
                # Convert dict back to DecisionResult
                return DecisionResult(**cached_data)
        except Exception as e:
            logger.warning(f"Failed to get cached decision: {e}")
            raise CacheError(
                message="Failed to retrieve cached decision",
                error_code="CACHE_RETRIEVAL_FAILED",
            )

        return None

    async def _cache_decision(
        self,
        request: DecisionRequest,
        decision: DecisionResult,
    ) -> None:
        """Cache the decision result."""
        try:
            cache_key = generate_cache_key(
                prefix="decision",
                data=request.dict(),
                exclude_fields=["custom_prompt"],
            )

            # Cache for 5 minutes
            await self.cache_manager.set(
                cache_key,
                decision.dict(),
                ttl=300,  # 5 minutes
            )
            logger.debug(f"Cached decision with key: {cache_key}")
        except Exception as e:
            logger.warning(f"Failed to cache decision: {e}")
            # Don't raise error, caching is optional

    def _parse_decision_response(
        self,
        response_text: str,
        request: DecisionRequest,
        model_response: Any,
    ) -> Dict[str, Any]:
        """Parse and validate the AI response."""
        try:
            # Try to extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if not json_match:
                raise ValidationError(
                    message="No JSON found in AI response",
                    error_code="INVALID_RESPONSE_FORMAT",
                )

            json_str = json_match.group()
            decision_data = json.loads(json_str)

            # Validate required fields
            required_fields = [
                "action",
                "symbol",
                "reasoning",
                "confidence_score",
                "risk_level",
            ]

            for field in required_fields:
                if field not in decision_data:
                    raise ValidationError(
                        message=f"Missing required field: {field}",
                        error_code="MISSING_REQUIRED_FIELD",
                    )

            # Validate action
            action = decision_data["action"].lower()
            if action not in [a.value for a in DecisionAction]:
                raise ValidationError(
                    message=f"Invalid action: {action}",
                    error_code="INVALID_ACTION",
                )

            # Validate symbol exists in request
            symbol = decision_data["symbol"].upper()
            valid_symbols = [s.symbol.upper() for s in request.stock_data]
            if symbol not in valid_symbols:
                raise ValidationError(
                    message=f"Symbol {symbol} not in requested stocks",
                    error_code="INVALID_SYMBOL",
                )

            # Validate confidence score
            confidence = float(decision_data["confidence_score"])
            if not 0 <= confidence <= 1:
                raise ValidationError(
                    message=f"Confidence score must be between 0 and 1, got {confidence}",
                    error_code="INVALID_CONFIDENCE_SCORE",
                )

            # Validate risk level
            risk_level = decision_data["risk_level"].lower()
            if risk_level not in [r.value for r in RiskLevel]:
                raise ValidationError(
                    message=f"Invalid risk level: {risk_level}",
                    error_code="INVALID_RISK_LEVEL",
                )

            # Validate quantity if provided
            if "quantity" in decision_data and decision_data["quantity"] is not None:
                quantity = int(decision_data["quantity"])
                if quantity <= 0:
                    raise ValidationError(
                        message=f"Quantity must be positive, got {quantity}",
                        error_code="INVALID_QUANTITY",
                    )

            # Validate prices if provided
            price_fields = ["price_target", "stop_loss", "take_profit"]
            for field in price_fields:
                if field in decision_data and decision_data[field] is not None:
                    price = float(decision_data[field])
                    if price <= 0:
                        raise ValidationError(
                            message=f"{field} must be positive, got {price}",
                            error_code=f"INVALID_{field.upper()}",
                        )

            # Prepare result data
            result_data = {
                "action": DecisionAction(action),
                "symbol": symbol,
                "reasoning": decision_data["reasoning"],
                "confidence_score": confidence,
                "risk_level": RiskLevel(risk_level),
                "ai_provider": request.ai_provider,
                "model_name": request.model_name or model_response.model,
                "cost_usd": model_response.cost_usd,
                "raw_response": model_response.raw_response,
            }

            # Add optional fields
            optional_fields = [
                "quantity",
                "price_target",
                "stop_loss",
                "take_profit",
                "technical_analysis",
                "fundamental_analysis",
                "risk_assessment",
                "expected_return",
                "time_horizon",
            ]

            for field in optional_fields:
                if field in decision_data and decision_data[field] is not None:
                    result_data[field] = decision_data[field]

            return result_data

        except json.JSONDecodeError as e:
            raise ValidationError(
                message=f"Failed to parse JSON response: {str(e)}",
                error_code="JSON_PARSE_ERROR",
                details={"response_text": response_text[:500]},  # First 500 chars
            )
        except ValueError as e:
            raise ValidationError(
                message=f"Value error in response parsing: {str(e)}",
                error_code="VALUE_ERROR",
            )
        except Exception as e:
            raise ValidationError(
                message=f"Unexpected error parsing response: {str(e)}",
                error_code="PARSE_ERROR",
            )

    async def validate_decision_request(
        self,
        request: DecisionRequest,
    ) -> List[str]:
        """Validate a decision request and return any warnings."""
        warnings = []

        # Check account balance
        if request.account_info.available_cash < settings.MIN_TRADE_AMOUNT:
            warnings.append(
                f"Available cash (¥{request.account_info.available_cash:,.2f}) "
                f"is below minimum trade amount (¥{settings.MIN_TRADE_AMOUNT:,.2f})"
            )

        # Check position sizes
        for position in request.positions:
            if position.market_value > settings.MAX_POSITION_SIZE:
                warnings.append(
                    f"Position in {position.symbol} (¥{position.market_value:,.2f}) "
                    f"exceeds maximum position size (¥{settings.MAX_POSITION_SIZE:,.2f})"
                )

        # Check stock data completeness
        for stock in request.stock_data:
            if not stock.current_price:
                warnings.append(f"Stock {stock.symbol} missing current price")
            if not stock.volume:
                warnings.append(f"Stock {stock.symbol} missing volume data")

        # Check AI provider configuration
        if request.ai_provider == AIProvider.OPENAI and not settings.OPENAI_API_KEY:
            warnings.append("OpenAI API key not configured")
        elif request.ai_provider == AIProvider.DEEPSEEK and not settings.DEEPSEEK_API_KEY:
            warnings.append("DeepSeek API key not configured")

        return warnings

    async def batch_generate_decisions(
        self,
        requests: List[DecisionRequest],
        use_cache: bool = True,
    ) -> List[DecisionResult]:
        """Generate multiple decisions in batch."""
        results = []

        for request in requests:
            try:
                decision = await self.generate_decision(request, use_cache=use_cache)
                results.append(decision)
            except Exception as e:
                logger.error(f"Failed to generate decision in batch: {e}")
                # Continue with other requests

        return results

    async def get_decision_history(
        self,
        account_id: str,
        limit: int = 10,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Get decision history for an account."""
        # This would typically query a database
        # For now, return empty list
        return []

    async def analyze_decision_quality(
        self,
        decision: DecisionResult,
        actual_outcome: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Analyze the quality of a decision."""
        analysis = {
            "decision_id": decision.decision_id,
            "timestamp": decision.timestamp.isoformat(),
            "action": decision.action.value,
            "symbol": decision.symbol,
            "confidence_score": decision.confidence_score,
            "risk_level": decision.risk_level.value,
            "processing_time_ms": decision.processing_time_ms,
            "cost_usd": decision.cost_usd,
        }

        if actual_outcome:
            # Compare with actual outcome
            analysis["actual_outcome"] = actual_outcome
            # Add performance metrics here

        return analysis