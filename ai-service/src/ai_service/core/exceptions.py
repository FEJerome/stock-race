"""
Custom exceptions for AI Service.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class AIError(Exception):
    """Base exception for AI service errors."""
    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class ModelError(AIError):
    """Exception for model-related errors."""
    pass


class ProviderError(AIError):
    """Exception for AI provider errors."""
    pass


class RateLimitError(AIError):
    """Exception for rate limiting errors."""
    pass


class ValidationError(AIError):
    """Exception for data validation errors."""
    pass


class CacheError(AIError):
    """Exception for cache-related errors."""
    pass


class DecisionError(AIError):
    """Exception for decision generation errors."""
    pass


class AuthenticationError(AIError):
    """Exception for authentication errors."""
    pass


class AuthorizationError(AIError):
    """Exception for authorization errors."""
    pass


def handle_ai_error(error: AIError) -> HTTPException:
    """Convert AIError to HTTPException."""
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_type = "internal_error"

    if isinstance(error, ModelError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        error_type = "model_error"
    elif isinstance(error, ProviderError):
        status_code = status.HTTP_502_BAD_GATEWAY
        error_type = "provider_error"
    elif isinstance(error, RateLimitError):
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
        error_type = "rate_limit_exceeded"
    elif isinstance(error, ValidationError):
        status_code = status.HTTP_400_BAD_REQUEST
        error_type = "validation_error"
    elif isinstance(error, CacheError):
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        error_type = "cache_error"
    elif isinstance(error, DecisionError):
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        error_type = "decision_error"
    elif isinstance(error, AuthenticationError):
        status_code = status.HTTP_401_UNAUTHORIZED
        error_type = "authentication_error"
    elif isinstance(error, AuthorizationError):
        status_code = status.HTTP_403_FORBIDDEN
        error_type = "authorization_error"

    return HTTPException(
        status_code=status_code,
        detail={
            "error": error_type,
            "message": error.message,
            "error_code": error.error_code,
            "details": error.details,
        },
    )


async def global_exception_handler(request, exc):
    """Global exception handler."""
    from ..utils.logger import logger

    if isinstance(exc, AIError):
        logger.error(f"AI Error: {exc.message}", exc_info=True)
        return handle_ai_error(exc)

    if isinstance(exc, HTTPException):
        logger.warning(f"HTTP Exception: {exc.detail}")
        return exc

    # Log unexpected errors
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={
            "error": "internal_server_error",
            "message": "An unexpected error occurred",
            "error_code": "UNEXPECTED_ERROR",
        },
    )