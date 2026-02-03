"""
Decision API endpoints for AI Service.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse

from loguru import logger

from ...core.security import get_current_account, RateLimiter
from ...core.exceptions import handle_ai_error
from ...models.schemas import (
    DecisionRequest,
    DecisionResponse,
    DecisionResult,
    HealthResponse,
    ErrorResponse,
)
from ...services.decision_service import DecisionService
from ...utils.cache import cache_manager
from ...utils.logger import get_logger

router = APIRouter(prefix="/decision", tags=["decision"])
api_logger = get_logger("api.decision")


@router.post(
    "/generate",
    response_model=DecisionResponse,
    summary="Generate trading decision",
    description="Generate AI-powered trading decision based on account, positions, and stock data.",
)
async def generate_decision(
    request: DecisionRequest,
    account_id: str = Depends(get_current_account),
    use_cache: bool = Query(True, description="Use cached results if available"),
    rate_limiter: RateLimiter = Depends(lambda: RateLimiter(cache_manager)),
):
    """Generate a trading decision."""
    api_logger.info(f"Decision request from account: {account_id}")

    # Verify account ID matches request
    if request.account_info.account_id != account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account ID mismatch",
        )

    # Check rate limit
    rate_limit_key = f"decision:{account_id}"
    if not await rate_limiter.check_rate_limit(
        key=rate_limit_key,
        limit=settings.RATE_LIMIT_REQUESTS,
        period=settings.RATE_LIMIT_PERIOD,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={
                "X-RateLimit-Limit": str(settings.RATE_LIMIT_REQUESTS),
                "X-RateLimit-Period": str(settings.RATE_LIMIT_PERIOD),
                "X-RateLimit-Key": rate_limit_key,
            },
        )

    try:
        # Initialize decision service
        decision_service = DecisionService(cache_manager)

        # Validate request
        warnings = await decision_service.validate_decision_request(request)

        # Generate decision
        decision = await decision_service.generate_decision(
            request,
            use_cache=use_cache,
        )

        # Prepare response
        response = DecisionResponse(
            success=True,
            decision=decision,
            warnings=warnings,
            metadata={
                "account_id": account_id,
                "ai_provider": request.ai_provider.value,
                "model_name": request.model_name or "default",
                "use_cache": use_cache,
            },
        )

        api_logger.info(f"Decision generated successfully: {decision.decision_id}")
        return response

    except Exception as e:
        api_logger.error(f"Failed to generate decision: {e}", exc_info=True)
        return DecisionResponse(
            success=False,
            error=str(e),
            warnings=[],
            metadata={
                "account_id": account_id,
                "ai_provider": request.ai_provider.value,
            },
        )


@router.post(
    "/batch-generate",
    response_model=List[DecisionResponse],
    summary="Generate multiple trading decisions",
    description="Generate AI-powered trading decisions for multiple requests in batch.",
)
async def batch_generate_decisions(
    requests: List[DecisionRequest],
    account_id: str = Depends(get_current_account),
    use_cache: bool = Query(True, description="Use cached results if available"),
    rate_limiter: RateLimiter = Depends(lambda: RateLimiter(cache_manager)),
):
    """Generate multiple trading decisions in batch."""
    api_logger.info(f"Batch decision request from account: {account_id}")

    # Verify all requests belong to the same account
    for request in requests:
        if request.account_info.account_id != account_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account ID mismatch in request for account: {request.account_info.account_id}",
            )

    # Check rate limit (more lenient for batch)
    rate_limit_key = f"batch_decision:{account_id}"
    batch_limit = settings.RATE_LIMIT_REQUESTS * 3  # Allow more for batch
    if not await rate_limiter.check_rate_limit(
        key=rate_limit_key,
        limit=batch_limit,
        period=settings.RATE_LIMIT_PERIOD,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Batch rate limit exceeded",
            headers={
                "X-RateLimit-Limit": str(batch_limit),
                "X-RateLimit-Period": str(settings.RATE_LIMIT_PERIOD),
                "X-RateLimit-Key": rate_limit_key,
            },
        )

    responses = []
    decision_service = DecisionService(cache_manager)

    for request in requests:
        try:
            # Validate request
            warnings = await decision_service.validate_decision_request(request)

            # Generate decision
            decision = await decision_service.generate_decision(
                request,
                use_cache=use_cache,
            )

            response = DecisionResponse(
                success=True,
                decision=decision,
                warnings=warnings,
                metadata={
                    "account_id": account_id,
                    "ai_provider": request.ai_provider.value,
                    "model_name": request.model_name or "default",
                    "use_cache": use_cache,
                },
            )

        except Exception as e:
            api_logger.error(f"Failed to generate decision in batch: {e}")
            response = DecisionResponse(
                success=False,
                error=str(e),
                warnings=[],
                metadata={
                    "account_id": account_id,
                    "ai_provider": request.ai_provider.value,
                },
            )

        responses.append(response)

    api_logger.info(f"Batch decision generation completed: {len(responses)} responses")
    return responses


@router.get(
    "/history",
    response_model=List[DecisionResult],
    summary="Get decision history",
    description="Get historical trading decisions for the account.",
)
async def get_decision_history(
    account_id: str = Depends(get_current_account),
    limit: int = Query(10, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """Get decision history for an account."""
    api_logger.info(f"Decision history request from account: {account_id}")

    try:
        decision_service = DecisionService(cache_manager)
        history = await decision_service.get_decision_history(
            account_id=account_id,
            limit=limit,
            offset=offset,
        )

        return history

    except Exception as e:
        api_logger.error(f"Failed to get decision history: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get decision history: {str(e)}",
        )


@router.get(
    "/providers",
    summary="List available AI providers",
    description="Get list of available AI providers and their models.",
)
async def list_ai_providers():
    """List available AI providers and models."""
    api_logger.info("AI providers list request")

    providers = [
        {
            "provider": "openai",
            "name": "OpenAI",
            "models": [
                "gpt-4-turbo-preview",
                "gpt-4",
                "gpt-4-32k",
                "gpt-3.5-turbo",
                "gpt-3.5-turbo-16k",
            ],
            "enabled": bool(settings.OPENAI_API_KEY),
        },
        {
            "provider": "deepseek",
            "name": "DeepSeek",
            "models": [
                "deepseek-chat",
                "deepseek-coder",
            ],
            "enabled": bool(settings.DEEPSEEK_API_KEY),
        },
        {
            "provider": "claude",
            "name": "Claude (Anthropic)",
            "models": [
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307",
                "claude-2.1",
                "claude-2.0",
                "claude-instant-1.2",
            ],
            "enabled": bool(settings.ANTHROPIC_API_KEY),
        },
        {
            "provider": "qwen",
            "name": "Qwen (Alibaba)",
            "models": [
                "qwen-turbo",
                "qwen-plus",
                "qwen-max",
            ],
            "enabled": bool(settings.QWEN_API_KEY),
        },
        {
            "provider": "wenxin",
            "name": "文心一言 (Baidu)",
            "models": [
                "ernie-bot",
                "ernie-bot-turbo",
                "ernie-bot-4",
            ],
            "enabled": False,  # Placeholder
        },
    ]

    return {
        "providers": providers,
        "default_provider": settings.DEFAULT_MODEL.split("-")[0],  # Extract provider from model
        "default_model": settings.DEFAULT_MODEL,
    }


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Decision service health check",
    description="Check the health status of the decision service.",
)
async def decision_health_check():
    """Health check for decision service."""
    api_logger.info("Decision health check request")

    # Check cache connection
    cache_healthy = cache_manager.is_connected

    # Check database connection (if implemented)
    db_healthy = True  # Placeholder

    # Check AI providers
    providers_status = {}
    if settings.OPENAI_API_KEY:
        providers_status["openai"] = "configured"
    if settings.DEEPSEEK_API_KEY:
        providers_status["deepseek"] = "configured"
    if settings.ANTHROPIC_API_KEY:
        providers_status["claude"] = "configured"

    overall_status = "healthy" if cache_healthy and db_healthy else "degraded"

    return HealthResponse(
        status=overall_status,
        service="ai-decision-service",
        version="0.1.0",
        dependencies={
            "cache": "healthy" if cache_healthy else "unavailable",
            "database": "healthy" if db_healthy else "unavailable",
            "ai_providers": ", ".join(providers_status.keys()) if providers_status else "none",
        },
    )


# Error handlers
@router.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    api_logger.warning(f"HTTP Exception: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            detail=exc.detail,
            error_code=getattr(exc, 'error_code', None),
        ).dict(),
    )


# Import settings after router definition
from ...core.config import settings