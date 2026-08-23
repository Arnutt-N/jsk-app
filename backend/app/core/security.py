"""Security utilities for JWT and authentication."""
from datetime import datetime, timedelta, timezone
import logging
from typing import Optional, Union

import asyncio
from functools import partial

import bcrypt
from jose import jwt, JWTError

from app.core.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


BCRYPT_ROUNDS = 10

# P1.1a: refresh-token lifetime, extracted from the previous inline
# `timedelta(days=7)` so auth_session_service.py can compute a matching
# `auth_sessions.expires_at` without duplicating the literal.
REFRESH_TOKEN_EXPIRE_DAYS = 7


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (TypeError, ValueError):
        logger.warning("Stored password hash has invalid bcrypt format.")
        return False


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """Verify password in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, partial(verify_password, plain_password, hashed_password)
    )


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS),
    ).decode("utf-8")


def create_access_token(
    subject: Union[str, int],
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[dict] = None
) -> str:
    """
    Create a JWT access token.
    
    Args:
        subject: User ID (usually)
        expires_delta: Token expiration time
        additional_claims: Additional claims to include in token
    
    Returns:
        Encoded JWT token
    """
    if expires_delta:
        expire = _utcnow() + expires_delta
    else:
        expire = _utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "iat": _utcnow(),
        "type": "access"
    }
    
    if additional_claims:
        to_encode.update(additional_claims)
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, int],
    jti: Optional[str] = None,
    family: Optional[str] = None,
) -> str:
    """
    Create a JWT refresh token with longer expiration.

    Args:
        subject: User ID
        jti: Optional unique token id (uuid4 string). When provided, the
            claim is included so the token can be matched to a server-side
            `auth_sessions` row (P1.1a — session-backed refresh tokens,
            now the only kind issued).
        family: Optional session family id (uuid4 string), included as the
            `family` claim alongside `jti`. Only meaningful when `jti` is
            also provided.

    Returns:
        Encoded JWT refresh token
    """
    expire = _utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "iat": _utcnow(),
        "type": "refresh"
    }
    if jti is not None:
        to_encode["jti"] = jti
    if family is not None:
        to_encode["family"] = family

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def verify_jwt_token(token: str) -> dict:
    """
    Verify and decode a JWT token. Raises exception on failure.
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload
    
    Raises:
        JWTError: If token is invalid or expired
    """
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM]
    )


def get_token_subject(token: str) -> Optional[str]:
    """
    Get the subject (user ID) from a token.
    
    Args:
        token: JWT token string
    
    Returns:
        User ID or None if invalid
    """
    payload = verify_token(token)
    if payload:
        return payload.get("sub")
    return None


def is_token_expired(token: str) -> bool:
    """
    Check if a token is expired without raising exception.
    
    Args:
        token: JWT token string
    
    Returns:
        True if expired, False otherwise
    """
    try:
        jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return False
    except jwt.ExpiredSignatureError:
        return True
    except JWTError:
        return True
