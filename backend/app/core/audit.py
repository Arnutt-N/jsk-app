"""Audit logging utilities for tracking admin actions."""
import functools
import logging
import inspect
from typing import Callable, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def audit_action(action: str, resource_type: str):
    """
    Decorator to automatically log admin actions.
    
    Args:
        action: The action being performed (e.g., 'claim_session', 'close_session')
        resource_type: The type of resource being acted upon (e.g., 'chat_session')
    
    Usage:
        @audit_action("claim_session", "chat_session")
        async def claim_session(self, line_user_id: str, operator_id: int, db: AsyncSession):
            # ... implementation
            return session
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            # Extract db and operator_id from kwargs or args
            db: Optional[AsyncSession] = kwargs.get('db')
            operator_id: Optional[int] = kwargs.get('operator_id') or kwargs.get('admin_id') or kwargs.get('closed_by')

            # Try to extract from positional args if not in kwargs
            if not db and len(args) >= 3:
                # Assuming db is the last positional argument (common pattern)
                potential_db = args[-1]
                if isinstance(potential_db, AsyncSession):
                    db = potential_db

            # If operator_id not found in kwargs, check positional args via signature
            if not operator_id and args:
                try:
                    sig = inspect.signature(func)
                    params = list(sig.parameters.keys())
                    for name in ('operator_id', 'admin_id', 'closed_by'):
                        if name in params:
                            idx = params.index(name)
                            if idx < len(args):
                                operator_id = args[idx]
                                break
                except (ValueError, TypeError):
                    pass
            
            # Execute the function
            result = await func(*args, **kwargs)
            
            # Log the action if we have db and operator_id
            if db and operator_id:
                try:
                    # Extract resource_id from result or kwargs
                    resource_id = None
                    if result and hasattr(result, 'id'):
                        resource_id = str(result.id)
                    elif 'line_user_id' in kwargs:
                        resource_id = kwargs['line_user_id']
                    elif len(args) >= 2:
                        resource_id = str(args[1])  # Often the first arg after self

                    # Create audit log
                    log = AuditLog(
                        admin_id=int(operator_id) if isinstance(operator_id, (int, str)) else None,
                        action=action,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        details={
                            "function": func.__name__,
                            "kwargs_keys": list(kwargs.keys())
                        }
                    )
                    maybe_add = db.add(log)
                    if inspect.isawaitable(maybe_add):
                        await maybe_add
                    # Note: We don't commit here - let the caller handle transaction

                except Exception as e:
                    # Don't let audit logging break the main functionality
                    logger.error(f"Failed to create audit log: {e}")
            else:
                logger.warning("audit_action skipped for %s: missing db=%s or operator_id=%s (kwargs: %s)", func.__name__, db is not None, operator_id, list(kwargs.keys()))

            return result
        
        return async_wrapper
    return decorator


async def create_audit_log(
    db: AsyncSession,
    admin_id: Optional[int],
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> AuditLog:
    """
    Manually create an audit log entry.
    
    Args:
        db: Database session
        admin_id: ID of admin performing the action
        action: Action performed
        resource_type: Type of resource
        resource_id: ID of resource
        details: Additional details
        ip_address: Client IP address
        user_agent: Client user agent
    
    Returns:
        Created AuditLog instance
    """
    log = AuditLog(
        admin_id=admin_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
        ip_address=ip_address,
        user_agent=user_agent
    )
    maybe_add = db.add(log)
    if inspect.isawaitable(maybe_add):
        await maybe_add
    await db.flush()  # Flush to get the ID without committing
    return log
