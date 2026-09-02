"""Settings endpoints for Telegram, n8n, and custom integrations.

These endpoints use the existing Credential model with Fernet encryption
to securely store and manage integration credentials.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import httpx
import ipaddress
import logging
from urllib.parse import urlsplit

from app.api import deps
from app.api.deps import get_current_admin, require_permission
from app.core.audit import create_audit_log
from app.core.permissions import KEY_EDIT_SYSTEM_SETTINGS
from app.db.session import get_db
from app.models.user import User
from app.models.credential import Credential, Provider
from app.services.credential_service import credential_service

logger = logging.getLogger(__name__)

router = APIRouter()

# NOTE (M9 minimal): blocks non-http(s) schemes and private/loopback/link-local
# IP literals (incl. 169.254.169.254 cloud metadata). Decimal/octal IP host
# encodings (e.g. http://2130706433/) are NOT caught here — ip_address() raises
# on those hostnames; accepted under DEFER-L1 (full host allowlist needs an
# owner-approved allowed-host policy). DNS-level resolution gaps likewise.
_BLOCKED_HOSTNAMES = {"localhost"}


def _assert_safe_url(url: str) -> None:
    """Reject URLs the server-side test fetch must not touch.

    Raises ValueError for non-http(s) schemes, localhost-style hostnames, and
    IP literals in private/loopback/link-local ranges (read-SSRF guard).
    """
    parts = urlsplit(url or "")
    if parts.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parts.scheme!r}")
    host = (parts.hostname or "").lower()
    if not host:
        raise ValueError("URL has no hostname")
    if host in _BLOCKED_HOSTNAMES or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError(f"Blocked hostname: {host}")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return  # regular DNS name — scheme/host checks above passed
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        raise ValueError(f"Blocked IP range: {host}")


# ── Pydantic Schemas ────────────────────────────────────────────────

class TelegramConfigIn(BaseModel):
    bot_token: str = Field(..., min_length=1)
    chat_id: str = Field(..., min_length=1)

class TelegramConfigOut(BaseModel):
    bot_token_masked: str = ""
    chat_id: str = ""
    is_connected: bool = False
    credential_id: Optional[int] = None

class N8nConfigIn(BaseModel):
    webhook_url: str = Field(..., min_length=1)
    api_key: Optional[str] = None

class N8nConfigOut(BaseModel):
    webhook_url: str = ""
    api_key_masked: str = ""
    is_connected: bool = False
    credential_id: Optional[int] = None

class IntegrationIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    integration_type: str = Field(..., description="webhook or api")
    url: str = Field(..., min_length=1)
    api_key: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

class IntegrationOut(BaseModel):
    id: int
    name: str
    integration_type: str = ""
    url: str = ""
    api_key_masked: str = ""
    headers: Optional[Dict[str, str]] = None
    is_connected: bool = False

class TestResult(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


# ── Helpers ─────────────────────────────────────────────────────────

def _mask(value: str) -> str:
    if not value or len(value) <= 6:
        return "****"
    return f"{value[:3]}****{value[-3:]}"


async def _get_or_none(provider: str, db: AsyncSession) -> Optional[Credential]:
    """Get the default active credential for a provider, or first one."""
    result = await db.execute(
        select(Credential)
        .where(Credential.provider == provider)
        .where(Credential.is_active == True)
        .order_by(Credential.is_default.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _finish_integration_test(
    db: AsyncSession,
    admin_id: Optional[int],
    provider_label: str,
    credential_id: Optional[int],
    result: "TestResult",
) -> "TestResult":
    """Write the audit row for a connection-test endpoint and commit it.

    These endpoints perform no other DB mutation, so per PRD FR1 the audit
    row IS the mutation -- always write it (success or failure), never the
    decrypted secret used to run the test.
    """
    await create_audit_log(
        db=db,
        admin_id=admin_id,
        action="test_integration",
        resource_type="integration",
        resource_id=str(credential_id) if credential_id is not None else None,
        details={"provider": provider_label, "result": "ok" if result.success else "fail"},
    )
    await db.commit()
    return result


async def _upsert_credential(
    provider: str,
    name: str,
    creds_dict: dict,
    metadata: Optional[dict],
    db: AsyncSession,
    admin_id: Optional[int],
    action: str,
    audit_details: Optional[Dict[str, Any]] = None,
) -> Credential:
    """Create or update the default credential for a given provider.

    Writes the audit row on this SAME session, before the commit below, so
    the audit entry and the credential write share one transaction (a
    rollback drops both). This helper lives in this endpoint file, so it
    stays in scope for the shared-transaction pattern (unlike
    credential_service.py, a separate service module).
    """
    existing = await _get_or_none(provider, db)
    encrypted = credential_service.encrypt_credentials(creds_dict)

    if existing:
        existing.credentials = encrypted
        existing.metadata_json = metadata
        existing.is_active = True
        existing.is_default = True
        obj = existing
    else:
        obj = Credential(
            name=name,
            provider=provider,
            credentials=encrypted,
            metadata_json=metadata,
            is_active=True,
            is_default=True,
        )
        db.add(obj)
        await db.flush()  # assign obj.id so the audit row can reference it

    await create_audit_log(
        db=db,
        admin_id=admin_id,
        action=action,
        resource_type="integration",
        resource_id=str(obj.id),
        details=audit_details or {},
    )
    await db.commit()
    await db.refresh(obj)
    return obj


# ── Telegram ────────────────────────────────────────────────────────

@router.get("/telegram", response_model=TelegramConfigOut)
async def get_telegram_config(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    cred = await _get_or_none(Provider.TELEGRAM, db)
    if not cred:
        return TelegramConfigOut()

    try:
        decrypted = credential_service.decrypt_credentials(cred.credentials)
    except Exception as exc:
        logger.error("Failed to decrypt Telegram credentials (id=%s): %s", cred.id, exc, exc_info=True)
        return TelegramConfigOut(credential_id=cred.id)

    return TelegramConfigOut(
        bot_token_masked=_mask(decrypted.get("bot_token", "")),
        chat_id=decrypted.get("chat_id", ""),
        is_connected=cred.is_active,
        credential_id=cred.id,
    )


@router.put("/telegram", response_model=TelegramConfigOut)
async def save_telegram_config(
    body: TelegramConfigIn,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
) -> Any:
    cred = await _upsert_credential(
        provider=Provider.TELEGRAM,
        name="Telegram Bot",
        creds_dict={"bot_token": body.bot_token, "chat_id": body.chat_id},
        metadata={"admin_chat_id": body.chat_id},
        db=db,
        admin_id=current_admin.id,
        action="update_telegram_config",
        audit_details={"enabled": True, "fields": ["bot_token", "chat_id"]},
    )
    return TelegramConfigOut(
        bot_token_masked=_mask(body.bot_token),
        chat_id=body.chat_id,
        is_connected=True,
        credential_id=cred.id,
    )


@router.post("/telegram/test", response_model=TestResult)
async def test_telegram(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    cred = await _get_or_none(Provider.TELEGRAM, db)
    if not cred:
        return await _finish_integration_test(
            db, current_admin.id, "telegram", None,
            TestResult(success=False, message="Telegram not configured"),
        )

    try:
        decrypted = credential_service.decrypt_credentials(cred.credentials)
        bot_token = decrypted.get("bot_token", "")
        chat_id = decrypted.get("chat_id", "")

        async with httpx.AsyncClient(timeout=10) as client:
            # Verify bot
            me_resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
            if me_resp.status_code != 200:
                return await _finish_integration_test(
                    db, current_admin.id, "telegram", cred.id,
                    TestResult(success=False, message=f"Invalid bot token: {me_resp.text}"),
                )

            bot_info = me_resp.json().get("result", {})

            # Send test message
            send_resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": "SKN Admin: Test connection successful!",
                },
            )
            if send_resp.status_code != 200:
                return await _finish_integration_test(
                    db, current_admin.id, "telegram", cred.id,
                    TestResult(
                        success=False,
                        message=f"Bot verified but failed to send message to chat {chat_id}: {send_resp.text}",
                        data={"bot": bot_info},
                    ),
                )

            return await _finish_integration_test(
                db, current_admin.id, "telegram", cred.id,
                TestResult(
                    success=True,
                    message="Connected and test message sent!",
                    data={"bot": bot_info},
                ),
            )
    except Exception as exc:
        logger.error("Integration test failed for Telegram: %s", exc, exc_info=True)
        return await _finish_integration_test(
            db, current_admin.id, "telegram", cred.id if cred else None,
            TestResult(success=False, message=str(exc)[:120]),
        )


# ── n8n ─────────────────────────────────────────────────────────────

@router.get("/n8n", response_model=N8nConfigOut)
async def get_n8n_config(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    cred = await _get_or_none(Provider.N8N, db)
    if not cred:
        return N8nConfigOut()

    try:
        decrypted = credential_service.decrypt_credentials(cred.credentials)
    except Exception as exc:
        logger.error("Failed to decrypt n8n credentials (id=%s): %s", cred.id, exc, exc_info=True)
        return N8nConfigOut(credential_id=cred.id)

    return N8nConfigOut(
        webhook_url=decrypted.get("webhook_url", ""),
        api_key_masked=_mask(decrypted.get("api_key", "")),
        is_connected=cred.is_active,
        credential_id=cred.id,
    )


@router.put("/n8n", response_model=N8nConfigOut)
async def save_n8n_config(
    body: N8nConfigIn,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
) -> Any:
    creds_dict: Dict[str, Any] = {"webhook_url": body.webhook_url}
    if body.api_key:
        creds_dict["api_key"] = body.api_key

    cred = await _upsert_credential(
        provider=Provider.N8N,
        name="n8n Webhook",
        creds_dict=creds_dict,
        metadata=None,
        db=db,
        admin_id=current_admin.id,
        action="update_n8n_config",
        audit_details={
            "enabled": True,
            "fields": ["webhook_url"] + (["api_key"] if body.api_key else []),
        },
    )
    return N8nConfigOut(
        webhook_url=body.webhook_url,
        api_key_masked=_mask(body.api_key or ""),
        is_connected=True,
        credential_id=cred.id,
    )


@router.post("/n8n/test", response_model=TestResult)
async def test_n8n(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    cred = await _get_or_none(Provider.N8N, db)
    if not cred:
        return await _finish_integration_test(
            db, current_admin.id, "n8n", None,
            TestResult(success=False, message="n8n not configured"),
        )

    try:
        decrypted = credential_service.decrypt_credentials(cred.credentials)
        webhook_url = decrypted.get("webhook_url", "")
        api_key = decrypted.get("api_key")
        _assert_safe_url(webhook_url)  # read-SSRF guard (M9)

        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                webhook_url,
                json={"source": "skn-admin", "event": "test", "message": "Connection test"},
                headers=headers,
            )
            if resp.status_code < 400:
                return await _finish_integration_test(
                    db, current_admin.id, "n8n", cred.id,
                    TestResult(
                        success=True,
                        message=f"Webhook responded with status {resp.status_code}",
                        data={"status_code": resp.status_code},
                    ),
                )
            return await _finish_integration_test(
                db, current_admin.id, "n8n", cred.id,
                TestResult(
                    success=False,
                    # status only — echoing the body could leak internal
                    # service responses to the caller (M9)
                    message=f"Webhook returned {resp.status_code}",
                ),
            )
    except Exception as exc:
        logger.error("Integration test failed for n8n: %s", exc, exc_info=True)
        return await _finish_integration_test(
            db, current_admin.id, "n8n", cred.id if cred else None,
            TestResult(success=False, message=str(exc)[:120]),
        )


# ── Custom Integrations ─────────────────────────────────────────────

@router.get("/integrations", response_model=List[IntegrationOut])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    result = await db.execute(
        select(Credential).where(Credential.provider == Provider.CUSTOM)
    )
    creds = list(result.scalars().all())
    items: List[IntegrationOut] = []
    for c in creds:
        try:
            decrypted = credential_service.decrypt_credentials(c.credentials)
        except Exception as exc:
            logger.error("Failed to decrypt custom integration (id=%s): %s", c.id, exc, exc_info=True)
            decrypted = {}
        items.append(
            IntegrationOut(
                id=c.id,
                name=c.name,
                integration_type=decrypted.get("integration_type", "webhook"),
                url=decrypted.get("url", ""),
                api_key_masked=_mask(decrypted.get("api_key", "")),
                headers=decrypted.get("headers"),
                is_connected=c.is_active,
            )
        )
    return items


@router.post("/integrations", response_model=IntegrationOut)
async def create_integration(
    body: IntegrationIn,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
) -> Any:
    creds_dict: Dict[str, Any] = {
        "integration_type": body.integration_type,
        "url": body.url,
    }
    if body.api_key:
        creds_dict["api_key"] = body.api_key
    if body.headers:
        creds_dict["headers"] = body.headers

    encrypted = credential_service.encrypt_credentials(creds_dict)
    obj = Credential(
        name=body.name,
        provider=Provider.CUSTOM,
        credentials=encrypted,
        is_active=True,
        is_default=False,
    )
    db.add(obj)
    await db.flush()  # assign obj.id before the audit row references it

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="create_integration",
        resource_type="integration",
        resource_id=str(obj.id),
        details={"name": obj.name, "integration_type": body.integration_type},
    )
    await db.commit()
    await db.refresh(obj)

    return IntegrationOut(
        id=obj.id,
        name=obj.name,
        integration_type=body.integration_type,
        url=body.url,
        api_key_masked=_mask(body.api_key or ""),
        headers=body.headers,
        is_connected=True,
    )


@router.put("/integrations/{integration_id}", response_model=IntegrationOut)
async def update_integration(
    integration_id: int,
    body: IntegrationIn,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
) -> Any:
    obj = await db.get(Credential, integration_id)
    if not obj or obj.provider != Provider.CUSTOM:
        raise HTTPException(status_code=404, detail="Integration not found")

    # Preserve existing credentials if not explicitly provided
    try:
        existing_creds = credential_service.decrypt_credentials(obj.credentials)
    except Exception:
        existing_creds = {}

    creds_dict: Dict[str, Any] = {
        "integration_type": body.integration_type,
        "url": body.url,
    }
    # Keep existing api_key if not provided in update
    if body.api_key:
        creds_dict["api_key"] = body.api_key
    elif existing_creds.get("api_key"):
        creds_dict["api_key"] = existing_creds["api_key"]
    if body.headers:
        creds_dict["headers"] = body.headers
    elif existing_creds.get("headers"):
        creds_dict["headers"] = existing_creds["headers"]

    # Changed field NAMES only -- never log api_key/headers values.
    changed_fields = []
    if obj.name != body.name:
        changed_fields.append("name")
    if existing_creds.get("integration_type") != body.integration_type:
        changed_fields.append("integration_type")
    if existing_creds.get("url") != body.url:
        changed_fields.append("url")
    if body.api_key and body.api_key != existing_creds.get("api_key"):
        changed_fields.append("api_key")
    if body.headers and body.headers != existing_creds.get("headers"):
        changed_fields.append("headers")

    obj.name = body.name
    obj.credentials = credential_service.encrypt_credentials(creds_dict)

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="update_integration",
        resource_type="integration",
        resource_id=str(integration_id),
        details={"changed_fields": changed_fields},
    )
    await db.commit()
    await db.refresh(obj)

    return IntegrationOut(
        id=obj.id,
        name=obj.name,
        integration_type=body.integration_type,
        url=body.url,
        api_key_masked=_mask(body.api_key or ""),
        headers=body.headers,
        is_connected=obj.is_active,
    )


@router.delete("/integrations/{integration_id}")
async def delete_integration(
    integration_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
) -> Any:
    obj = await db.get(Credential, integration_id)
    if not obj or obj.provider != Provider.CUSTOM:
        raise HTTPException(status_code=404, detail="Integration not found")

    name = obj.name
    try:
        integration_type = credential_service.decrypt_credentials(obj.credentials).get("integration_type", "webhook")
    except Exception:
        integration_type = "unknown"

    await db.delete(obj)
    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="delete_integration",
        resource_type="integration",
        resource_id=str(integration_id),
        details={"name": name, "integration_type": integration_type},
    )
    await db.commit()
    return {"success": True}


@router.post("/integrations/{integration_id}/test", response_model=TestResult)
async def test_integration(
    integration_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    obj = await db.get(Credential, integration_id)
    if not obj or obj.provider != Provider.CUSTOM:
        raise HTTPException(status_code=404, detail="Integration not found")

    try:
        decrypted = credential_service.decrypt_credentials(obj.credentials)
        url = decrypted.get("url", "")
        api_key = decrypted.get("api_key")
        custom_headers = decrypted.get("headers") or {}
        integration_type = decrypted.get("integration_type", "webhook")
        _assert_safe_url(url)  # read-SSRF guard (M9)

        headers: Dict[str, str] = {"Content-Type": "application/json"}
        headers.update(custom_headers)
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=10) as client:
            if integration_type == "webhook":
                resp = await client.post(
                    url,
                    json={"source": "skn-admin", "event": "test"},
                    headers=headers,
                )
            else:
                resp = await client.get(url, headers=headers)

            if resp.status_code < 400:
                return await _finish_integration_test(
                    db, current_admin.id, "custom", obj.id,
                    TestResult(
                        success=True,
                        message=f"Connection successful (HTTP {resp.status_code})",
                        data={"status_code": resp.status_code},
                    ),
                )
            return await _finish_integration_test(
                db, current_admin.id, "custom", obj.id,
                TestResult(
                    success=False,
                    # status only — echoing the body could leak internal
                    # service responses to the caller (M9)
                    message=f"HTTP {resp.status_code}",
                ),
            )
    except Exception as exc:
        logger.error("Integration test failed for custom integration %d: %s", integration_id, exc, exc_info=True)
        return await _finish_integration_test(
            db, current_admin.id, "custom", obj.id,
            TestResult(success=False, message=str(exc)[:120]),
        )


# ── Overview (all providers) ────────────────────────────────────────

class ProviderStatus(BaseModel):
    provider: str
    name: str
    is_connected: bool = False
    credential_id: Optional[int] = None

@router.get("/overview", response_model=List[ProviderStatus])
async def settings_overview(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """Return connection status for each known provider."""
    providers_to_check = [
        (Provider.LINE, "LINE"),
        (Provider.TELEGRAM, "Telegram"),
        (Provider.N8N, "n8n"),
    ]
    statuses: List[ProviderStatus] = []
    for prov, label in providers_to_check:
        cred = await _get_or_none(prov, db)
        statuses.append(
            ProviderStatus(
                provider=prov,
                name=label,
                is_connected=bool(cred and cred.is_active),
                credential_id=cred.id if cred else None,
            )
        )

    # Count custom integrations
    result = await db.execute(
        select(Credential).where(Credential.provider == Provider.CUSTOM)
    )
    customs = list(result.scalars().all())
    connected_count = sum(1 for c in customs if c.is_active)
    statuses.append(
        ProviderStatus(
            provider="CUSTOM",
            name=f"Custom Integrations ({connected_count}/{len(customs)})",
            is_connected=connected_count > 0,
        )
    )

    return statuses
