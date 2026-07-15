from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, List
from app.api import deps
from app.api.deps import get_current_admin, require_permission
from app.core.audit import create_audit_log, changed_field_names
from app.core.permissions import KEY_EDIT_SYSTEM_SETTINGS
from app.models.user import User
from app.services.credential_service import credential_service
from app.models.credential import Credential, Provider
from app.schemas.credential import (
    CredentialCreate, CredentialUpdate,
    CredentialResponse, CredentialListResponse
)


def _provider_value(provider: Any) -> str:
    """Coerce a Credential.provider (enum or plain str) to a plain string."""
    return provider.value if hasattr(provider, "value") else str(provider)

router = APIRouter()


@router.get("", response_model=CredentialListResponse)
async def list_credentials(
    provider: str = None,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin)
) -> Any:
    """List all credentials (secrets masked)"""
    credentials = await credential_service.list_credentials(provider, db)

    # Transform to response schema with masked credentials
    response_items = []
    for c in credentials:
        item = CredentialResponse.model_validate(c)
        item.credentials_masked = credential_service.mask_credentials(c.credentials)
        response_items.append(item)

    return {"credentials": response_items}


@router.post("", response_model=CredentialResponse)
async def create_credential(
    request: CredentialCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))
) -> Any:
    """Create new credential"""
    # NOTE: credential_service.create_credential() commits internally (it is
    # a shared service, out of this PRD's touch scope), so the audit row
    # below is a second, immediately-following commit rather than a single
    # shared transaction with the credential insert. Not-found/validation
    # failures never reach this line, so "zero audit rows on failure" still
    # holds; see p0.3-audit-coverage.prd.md for the accepted deviation.
    credential = await credential_service.create_credential(request, db)

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="create_credential",
        resource_type="credential",
        resource_id=str(credential.id),
        details={"provider": _provider_value(credential.provider), "name": credential.name},
    )
    await db.commit()

    response = CredentialResponse.model_validate(credential)
    response.credentials_masked = credential_service.mask_credentials(credential.credentials)
    return response


# Static routes MUST come before dynamic {id} routes in FastAPI
@router.get("/line/status")
async def get_line_bot_status(
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """Check LINE Bot connection status"""
    try:
        credential = await credential_service.get_default_credential(Provider.LINE, db)
        if not credential:
            return {"success": False, "message": "No LINE credential configured", "bot_info": None}

        result = await credential_service.verify_credential(credential.id, db)
        return {
            "success": result.get("success", False),
            "message": result.get("message", ""),
            "bot_info": result.get("data", {})
        }
    except Exception as e:
        return {"success": False, "message": str(e), "bot_info": None}


@router.get("/{id}", response_model=CredentialResponse)
async def get_credential(
    id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin)
) -> Any:
    """Get single credential (secrets masked)"""
    credential = await db.get(Credential, id)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    response = CredentialResponse.model_validate(credential)
    response.credentials_masked = credential_service.mask_credentials(credential.credentials)
    return response


@router.put("/{id}", response_model=CredentialResponse)
async def update_credential(
    id: int,
    request: CredentialUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))
) -> Any:
    """Update credential"""
    # Field NAMES only -- request.credentials may contain secret values.
    changed_fields = changed_field_names(request.model_dump(exclude_unset=True))

    credential = await credential_service.update_credential(id, request, db)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="update_credential",
        resource_type="credential",
        resource_id=str(id),
        details={"changed_fields": changed_fields},
    )
    await db.commit()

    response = CredentialResponse.model_validate(credential)
    response.credentials_masked = credential_service.mask_credentials(credential.credentials)
    return response


@router.delete("/{id}")
async def delete_credential(
    id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))
) -> Any:
    """Delete credential"""
    # Capture provider/name BEFORE delete -- the row is gone afterwards.
    existing = await db.get(Credential, id)
    if not existing:
        raise HTTPException(status_code=404, detail="Credential not found")
    provider = _provider_value(existing.provider)
    name = existing.name

    success = await credential_service.delete_credential(id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Credential not found")

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="delete_credential",
        resource_type="credential",
        resource_id=str(id),
        details={"provider": provider, "name": name},
    )
    await db.commit()
    return {"success": True}


@router.post("/{id}/verify")
async def verify_credential(
    id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin)
) -> Any:
    """Test connection for credential"""
    # No DB mutation happens here -- the audit row IS the mutation for this
    # test/verify endpoint (PRD FR1 notes).
    existing = await db.get(Credential, id)
    result = await credential_service.verify_credential(id, db)

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="verify_credential",
        resource_type="credential",
        resource_id=str(id),
        details={
            "provider": _provider_value(existing.provider) if existing else None,
            "result": "ok" if result.get("success") else "fail",
        },
    )
    await db.commit()
    return result


@router.post("/{id}/set-default", response_model=CredentialResponse)
async def set_default_credential(
    id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))
) -> Any:
    """Set as default for provider"""
    credential = await credential_service.set_default(id, db)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="set_default_credential",
        resource_type="credential",
        resource_id=str(id),
        details={"provider": _provider_value(credential.provider)},
    )
    await db.commit()

    response = CredentialResponse.model_validate(credential)
    response.credentials_masked = credential_service.mask_credentials(credential.credentials)
    return response
