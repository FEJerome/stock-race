"""
Authentication and authorization module.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError

from .config import settings


class TokenData(BaseModel):
    """Token data model."""
    user_id: str
    username: str
    email: Optional[str] = None
    is_admin: bool = False
    exp: Optional[datetime] = None


class AuthHandler:
    """Authentication handler."""

    def __init__(self):
        self.security = HTTPBearer()
        # In production, use a secure secret key from environment
        self.secret_key = settings.SECRET_KEY if hasattr(settings, 'SECRET_KEY') else "dev-secret-key"
        self.algorithm = "HS256"

    async def create_access_token(
        self,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create JWT access token.

        Args:
            data: Token data
            expires_delta: Token expiration delta

        Returns:
            JWT token string
        """
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=24)

        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    async def decode_token(self, token: str) -> Optional[TokenData]:
        """
        Decode and validate JWT token.

        Args:
            token: JWT token string

        Returns:
            TokenData object or None if invalid
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id = payload.get("sub") or payload.get("user_id")
            username = payload.get("username")
            email = payload.get("email")
            is_admin = payload.get("is_admin", False)
            exp = payload.get("exp")

            if exp:
                exp = datetime.fromtimestamp(exp)

            if user_id is None or username is None:
                return None

            return TokenData(
                user_id=user_id,
                username=username,
                email=email,
                is_admin=is_admin,
                exp=exp
            )
        except JWTError:
            return None

    async def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Security(HTTPBearer())
    ) -> TokenData:
        """
        Get current user from JWT token.

        Args:
            credentials: HTTP authorization credentials

        Returns:
            TokenData object

        Raises:
            HTTPException: If token is invalid
        """
        token = credentials.credentials
        token_data = await self.decode_token(token)

        if token_data is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check if token is expired
        if token_data.exp and token_data.exp < datetime.utcnow():
            raise HTTPException(
                status_code=401,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return token_data

    async def get_current_active_user(
        self,
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        """
        Get current active user.

        Args:
            current_user: Current user from token

        Returns:
            TokenData object

        Raises:
            HTTPException: If user is not active
        """
        # Add any additional user status checks here
        # For now, just return the user
        return current_user

    async def get_current_admin_user(
        self,
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        """
        Get current admin user.

        Args:
            current_user: Current user from token

        Returns:
            TokenData object

        Raises:
            HTTPException: If user is not admin
        """
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions"
            )
        return current_user


# Create auth handler instance
auth_handler = AuthHandler()

# Dependency functions
get_current_user = auth_handler.get_current_user
get_current_active_user = auth_handler.get_current_active_user
get_current_admin_user = auth_handler.get_current_admin_user


# Mock user database for development
# In production, this would connect to a real user database
class MockUserDB:
    """Mock user database for development."""

    users = {
        "admin": {
            "user_id": "1",
            "username": "admin",
            "email": "admin@stockrace.com",
            "password": "admin123",  # In production, use hashed passwords
            "is_admin": True,
            "is_active": True
        },
        "user1": {
            "user_id": "2",
            "username": "user1",
            "email": "user1@stockrace.com",
            "password": "user123",
            "is_admin": False,
            "is_active": True
        }
    }

    @classmethod
    async def authenticate_user(cls, username: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate user.

        Args:
            username: Username
            password: Password

        Returns:
            User dictionary or None if authentication fails
        """
        user = cls.users.get(username)
        if not user:
            return None

        # In production, use proper password hashing
        if user["password"] != password:
            return None

        if not user["is_active"]:
            return None

        # Return user data without password
        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "email": user["email"],
            "is_admin": user["is_admin"]
        }


async def login_for_access_token(username: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Login user and return access token.

    Args:
        username: Username
        password: Password

    Returns:
        Dictionary with access token and user info or None if login fails
    """
    user = await MockUserDB.authenticate_user(username, password)
    if not user:
        return None

    # Create access token
    access_token = await auth_handler.create_access_token(
        data={
            "sub": user["user_id"],
            "username": user["username"],
            "email": user["email"],
            "is_admin": user["is_admin"]
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }