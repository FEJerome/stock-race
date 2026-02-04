"""
Security utilities for AI Service.
"""

from jose import jwt
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from loguru import logger

from .config import settings


# JWT configuration
JWT_ALGORITHM = "HS256"
JWT_SECRET_KEY = "stock-race-ai-service-secret-key-change-in-production"  # Should be in environment variables
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer()


class AuthError(Exception):
    """Authentication error."""
    pass


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Dict[str, Any]:
    """Verify JWT token and return payload."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise AuthError(f"Invalid token: {str(e)}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    """Get current user from JWT token."""
    token = credentials.credentials

    try:
        payload = verify_token(token)

        # Check token type
        if payload.get("type") != "access":
            raise AuthError("Invalid token type")

        # Check if token is expired
        exp = payload.get("exp")
        if exp and exp < time.time():
            raise AuthError("Token has expired")

        return payload
    except AuthError as e:
        logger.warning(f"Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_account(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> str:
    """Get current account ID from user payload."""
    account_id = current_user.get("account_id")
    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account ID not found in token",
        )
    return account_id


async def get_current_user_id(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> str:
    """Get current user ID from user payload."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token",
        )
    return user_id


def validate_api_key(api_key: str) -> bool:
    """Validate API key."""
    # In production, this should check against a database or key management service
    # For now, we'll use a simple check
    valid_keys = ["stock-race-api-key-123", "test-api-key"]
    return api_key in valid_keys


async def require_api_key(api_key: Optional[str] = None) -> bool:
    """Require API key for service-to-service communication."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
        )

    if not validate_api_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    return True


# Rate limiting utilities
class RateLimiter:
    """Simple rate limiter using Redis."""

    def __init__(self, cache_manager):
        self.cache_manager = cache_manager

    async def check_rate_limit(
        self,
        key: str,
        limit: int,
        period: int,
    ) -> bool:
        """Check if request is within rate limit."""
        current = await self.cache_manager.get(f"rate_limit:{key}")

        if current is None:
            # First request in period
            await self.cache_manager.set(
                f"rate_limit:{key}",
                1,
                ttl=period,
            )
            return True

        if int(current) >= limit:
            return False

        # Increment counter
        await self.cache_manager.set(
            f"rate_limit:{key}",
            int(current) + 1,
            ttl=period,
        )
        return True

    async def get_remaining_requests(
        self,
        key: str,
        limit: int,
    ) -> int:
        """Get remaining requests in current period."""
        current = await self.cache_manager.get(f"rate_limit:{key}")
        if current is None:
            return limit
        return max(0, limit - int(current))