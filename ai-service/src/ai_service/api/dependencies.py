"""
Dependency injection for AI Service API.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from loguru import logger

from ..core.security import (
    get_current_user,
    get_current_account,
    get_current_user_id,
    require_api_key,
    RateLimiter,
)
from ..services.decision_service import DecisionService
from ..utils.cache import cache_manager
from ..utils.logger import get_logger

security = HTTPBearer()
api_logger = get_logger("api.dependencies")


def get_cache_manager():
    """Get cache manager dependency."""
    return cache_manager


def get_rate_limiter(
    cache_manager=Depends(get_cache_manager),
) -> RateLimiter:
    """Get rate limiter dependency."""
    return RateLimiter(cache_manager)


def get_decision_service(
    cache_manager=Depends(get_cache_manager),
) -> DecisionService:
    """Get decision service dependency."""
    return DecisionService(cache_manager)


# Role-based authorization dependencies
async def require_admin(
    current_user=Depends(get_current_user),
) -> dict:
    """Require admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def require_premium_user(
    current_user=Depends(get_current_user),
) -> dict:
    """Require premium user role."""
    user_tier = current_user.get("tier", "free")
    if user_tier not in ["premium", "enterprise", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required",
        )
    return current_user


# Feature flag dependencies
async def require_feature_flag(
    feature_name: str,
    current_user=Depends(get_current_user),
) -> bool:
    """Check if a feature is enabled for the user."""
    # In a real implementation, this would check a feature flag service
    # or database for the user's feature access

    # Default feature flags (for MVP)
    feature_flags = {
        "batch_decisions": current_user.get("tier") in ["premium", "enterprise", "admin"],
        "advanced_analysis": current_user.get("tier") in ["enterprise", "admin"],
        "custom_models": current_user.get("tier") == "admin",
    }

    if feature_name not in feature_flags:
        api_logger.warning(f"Unknown feature flag: {feature_name}")
        return False

    if not feature_flags[feature_name]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Feature '{feature_name}' not available for your account tier",
        )

    return True


# Rate limiting with tier-based limits
async def get_tier_rate_limits(
    current_user=Depends(get_current_user),
) -> dict:
    """Get rate limits based on user tier."""
    tier = current_user.get("tier", "free")

    # Tier-based rate limits (requests per minute)
    tier_limits = {
        "free": {"requests": 10, "period": 60},
        "basic": {"requests": 30, "period": 60},
        "premium": {"requests": 100, "period": 60},
        "enterprise": {"requests": 500, "period": 60},
        "admin": {"requests": 1000, "period": 60},
    }

    return tier_limits.get(tier, tier_limits["free"])


# Validation dependencies
async def validate_symbol(
    symbol: str,
) -> str:
    """Validate stock symbol format."""
    # Basic validation - in production, this would check against a list of valid symbols
    if not symbol or len(symbol) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid stock symbol format",
        )

    # Convert to uppercase
    return symbol.upper()


async def validate_quantity(
    quantity: int,
    min_quantity: int = 1,
    max_quantity: int = 1000000,
) -> int:
    """Validate trade quantity."""
    if quantity < min_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quantity must be at least {min_quantity}",
        )

    if quantity > max_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quantity cannot exceed {max_quantity}",
        )

    return quantity


async def validate_price(
    price: float,
    min_price: float = 0.01,
    max_price: float = 1000000.00,
) -> float:
    """Validate price."""
    if price < min_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Price must be at least {min_price:.2f}",
        )

    if price > max_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Price cannot exceed {max_price:.2f}",
        )

    return round(price, 2)


# Service health dependencies
async def check_service_health(
    service_name: str,
    cache_manager=Depends(get_cache_manager),
) -> bool:
    """Check if a service is healthy."""
    # Basic health checks
    if service_name == "cache":
        return cache_manager.is_connected

    elif service_name == "ai":
        # Check if any AI provider is configured
        from ..core.config import settings
        return any([
            settings.OPENAI_API_KEY,
            settings.DEEPSEEK_API_KEY,
            settings.ANTHROPIC_API_KEY,
            settings.QWEN_API_KEY,
        ])

    elif service_name == "database":
        # Placeholder - would check database connection
        return True

    else:
        api_logger.warning(f"Unknown service health check: {service_name}")
        return False