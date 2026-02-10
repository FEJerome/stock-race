"""
Unit tests for DecisionService.
"""

import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

from ai_service.services.decision_service import DecisionService
from ai_service.models.schemas import (
    DecisionRequest,
    DecisionAction,
    RiskLevel,
    AIProvider,
    StockData,
    Position,
    AccountInfo,
)
from ai_service.core.exceptions import DecisionError, ValidationError


class TestDecisionService:
    """Test DecisionService class."""

    @pytest.mark.asyncio
    async def test_generate_decision_success(
        self,
        mock_cache_manager,
        sample_decision_request,
        sample_ai_response,
    ):
        """Test successful decision generation."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter factory
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content=sample_ai_response,
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=150,
            processing_time_ms=1250,
            cost_usd=0.0025,
            raw_response={"test": "data"},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create request
            request = DecisionRequest(**sample_decision_request)

            # Generate decision
            result = await service.generate_decision(request, use_cache=False)

            # Verify result
            assert result.decision_id is not None
            assert result.action == DecisionAction.BUY
            assert result.symbol == "AAPL"
            assert result.quantity == 50
            assert result.confidence_score == 0.75
            assert result.risk_level == RiskLevel.MEDIUM
            assert result.ai_provider == AIProvider.OPENAI
            assert result.model_name == "gpt-3.5-turbo"
            assert result.processing_time_ms is not None
            assert result.cost_usd == 0.0025

    @pytest.mark.asyncio
    async def test_generate_decision_with_cache(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test decision generation with cache."""
        # Mock cached result
        cached_result = {
            "decision_id": "cached_123",
            "action": "buy",
            "symbol": "AAPL",
            "reasoning": "Cached analysis",
            "confidence_score": 0.8,
            "risk_level": "medium",
            "ai_provider": "openai",
            "model_name": "gpt-3.5-turbo",
            "timestamp": datetime.now().isoformat(),
        }

        mock_cache_manager.get = AsyncMock(return_value=cached_result)

        # Create service
        service = DecisionService(mock_cache_manager)

        # Create request
        request = DecisionRequest(**sample_decision_request)

        # Generate decision (should use cache)
        result = await service.generate_decision(request, use_cache=True)

        # Verify cached result was used
        assert result.decision_id == "cached_123"
        assert result.action == DecisionAction.BUY
        assert result.symbol == "AAPL"
        assert result.confidence_score == 0.8

        # Adapter should not be called
        mock_cache_manager.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_decision_cache_miss(
        self,
        mock_cache_manager,
        sample_decision_request,
        sample_ai_response,
    ):
        """Test decision generation with cache miss."""
        # Mock cache miss
        mock_cache_manager.get = AsyncMock(return_value=None)

        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content=sample_ai_response,
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=150,
            processing_time_ms=1250,
            cost_usd=0.0025,
            raw_response={},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create request
            request = DecisionRequest(**sample_decision_request)

            # Generate decision
            result = await service.generate_decision(request, use_cache=True)

            # Verify result
            assert result.decision_id is not None
            assert result.action == DecisionAction.BUY

            # Cache should be set
            mock_cache_manager.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_decision_invalid_json_response(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test decision generation with invalid JSON response."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter with invalid JSON response
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content="This is not JSON",
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=50,
            processing_time_ms=500,
            cost_usd=0.001,
            raw_response={},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create request
            request = DecisionRequest(**sample_decision_request)

            # Should raise ValidationError
            with pytest.raises(ValidationError):
                await service.generate_decision(request, use_cache=False)

    @pytest.mark.asyncio
    async def test_generate_decision_missing_required_field(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test decision generation with missing required field in response."""
        # Create invalid response missing required fields
        invalid_response = json.dumps({
            "action": "buy",
            "symbol": "AAPL",
            # Missing "reasoning" field
            "confidence_score": 0.75,
            "risk_level": "medium",
        })

        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content=invalid_response,
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=50,
            processing_time_ms=500,
            cost_usd=0.001,
            raw_response={},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create request
            request = DecisionRequest(**sample_decision_request)

            # Should raise ValidationError
            with pytest.raises(ValidationError):
                await service.generate_decision(request, use_cache=False)

    @pytest.mark.asyncio
    async def test_generate_decision_invalid_symbol(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test decision generation with invalid symbol in response."""
        # Create response with symbol not in request
        invalid_response = json.dumps({
            "action": "buy",
            "symbol": "GOOGL",  # Not in request (only AAPL)
            "reasoning": "Test reasoning",
            "confidence_score": 0.75,
            "risk_level": "medium",
        })

        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content=invalid_response,
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=50,
            processing_time_ms=500,
            cost_usd=0.001,
            raw_response={},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create request
            request = DecisionRequest(**sample_decision_request)

            # Should raise ValidationError
            with pytest.raises(ValidationError):
                await service.generate_decision(request, use_cache=False)

    @pytest.mark.asyncio
    async def test_validate_decision_request_valid(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test validation of valid decision request."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Create request
        request = DecisionRequest(**sample_decision_request)

        # Validate request
        warnings = await service.validate_decision_request(request)

        # Should have no warnings for valid request
        assert len(warnings) == 0

    @pytest.mark.asyncio
    async def test_validate_decision_request_low_cash(
        self,
        mock_cache_manager,
    ):
        """Test validation of decision request with low cash."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Create request with low cash
        request = DecisionRequest(
            account_info=AccountInfo(
                account_id="acc_123",
                user_id="user_456",
                total_balance=50000.00,
                available_cash=500.00,  # Below MIN_TRADE_AMOUNT (1000)
                total_market_value=49500.00,
                total_unrealized_pnl=0.00,
                total_unrealized_pnl_percent=0.00,
            ),
            positions=[],
            stock_data=[StockData(symbol="AAPL", current_price=175.25)],
            ai_provider=AIProvider.OPENAI,
        )

        # Validate request
        warnings = await service.validate_decision_request(request)

        # Should have warning about low cash
        assert len(warnings) == 1
        assert "below minimum trade amount" in warnings[0]

    @pytest.mark.asyncio
    async def test_validate_decision_request_large_position(
        self,
        mock_cache_manager,
    ):
        """Test validation of decision request with large position."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Create request with large position
        request = DecisionRequest(
            account_info=AccountInfo(
                account_id="acc_123",
                user_id="user_456",
                total_balance=200000.00,
                available_cash=100000.00,
                total_market_value=100000.00,
                total_unrealized_pnl=0.00,
                total_unrealized_pnl_percent=0.00,
            ),
            positions=[
                Position(
                    symbol="AAPL",
                    quantity=1000,
                    avg_cost=150.00,
                    current_price=175.25,
                )
            ],
            stock_data=[StockData(symbol="AAPL", current_price=175.25)],
            ai_provider=AIProvider.OPENAI,
        )

        # Position value: 1000 * 175.25 = 175,250 > MAX_POSITION_SIZE (100,000)

        # Validate request
        warnings = await service.validate_decision_request(request)

        # Should have warning about large position
        assert len(warnings) == 1
        assert "exceeds maximum position size" in warnings[0]

    @pytest.mark.asyncio
    async def test_validate_decision_request_missing_api_key(
        self,
        mock_cache_manager,
        sample_decision_request,
    ):
        """Test validation of decision request with missing API key."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Create request with provider that requires API key
        request_data = sample_decision_request.copy()
        request_data["ai_provider"] = "deepseek"
        request = DecisionRequest(**request_data)

        # Validate request (DeepSeek API key not configured in test)
        warnings = await service.validate_decision_request(request)

        # Should have warning about missing API key
        assert len(warnings) == 1
        assert "API key not configured" in warnings[0]

    @pytest.mark.asyncio
    async def test_batch_generate_decisions(
        self,
        mock_cache_manager,
        sample_decision_request,
        sample_ai_response,
    ):
        """Test batch decision generation."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(return_value=MagicMock(
            content=sample_ai_response,
            model="gpt-3.5-turbo",
            provider=AIProvider.OPENAI,
            tokens_used=150,
            processing_time_ms=1250,
            cost_usd=0.0025,
            raw_response={},
        ))

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create multiple requests
            request1 = DecisionRequest(**sample_decision_request)
            request2 = DecisionRequest(**sample_decision_request)
            request2.account_info.account_id = "acc_789"  # Different account

            requests = [request1, request2]

            # Generate decisions in batch
            results = await service.batch_generate_decisions(requests, use_cache=False)

            # Verify results
            assert len(results) == 2
            for result in results:
                assert result.decision_id is not None
                assert result.action == DecisionAction.BUY
                assert result.symbol == "AAPL"

    @pytest.mark.asyncio
    async def test_batch_generate_decisions_partial_failure(
        self,
        mock_cache_manager,
        sample_decision_request,
        sample_ai_response,
    ):
        """Test batch decision generation with partial failure."""
        # Create service
        service = DecisionService(mock_cache_manager)

        # Mock adapter that fails on second call
        mock_adapter = AsyncMock()
        mock_adapter.default_model = "gpt-3.5-turbo"
        mock_adapter.generate = AsyncMock(side_effect=[
            MagicMock(
                content=sample_ai_response,
                model="gpt-3.5-turbo",
                provider=AIProvider.OPENAI,
                tokens_used=150,
                processing_time_ms=1250,
                cost_usd=0.0025,
                raw_response={},
            ),
            Exception("API error"),
        ])

        with patch('ai_service.services.decision_service.AdapterFactory.get_adapter',
                   return_value=mock_adapter):
            # Create multiple requests
            request1 = DecisionRequest(**sample_decision_request)
            request2 = DecisionRequest(**sample_decision_request)

            requests = [request1, request2]

            # Generate decisions in batch (should not raise exception)
            results = await service.batch_generate_decisions(requests, use_cache=False)

            # Should have one successful result
            assert len(results) == 1
            assert results[0].decision_id is not None