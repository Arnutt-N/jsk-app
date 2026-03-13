from cryptography.fernet import Fernet
import json
import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.credential import Credential, Provider
from app.schemas.credential import CredentialCreate, CredentialUpdate, CredentialResponse
from app.core.config import settings
import httpx

logger = logging.getLogger(__name__)

class CredentialService:
    def __init__(self):
        self.cipher: Optional[Fernet] = None

    def _get_cipher(self) -> Fernet:
        """Lazily build the cipher to avoid import-time startup failures."""
        if self.cipher is not None:
            return self.cipher

        key = getattr(settings, 'ENCRYPTION_KEY', '')
        if key:
            try:
                self.cipher = Fernet(key.encode())
                return self.cipher
            except Exception as e:
                logger.critical("Invalid ENCRYPTION_KEY: %s", e)
                raise

        if getattr(settings, 'ENVIRONMENT', 'production') == 'development':
            logger.warning("ENCRYPTION_KEY not set — using insecure dev key. DO NOT use in production.")
            import base64
            fake_key = base64.urlsafe_b64encode(b"dev_encryption_key_32_bytes_long")
            self.cipher = Fernet(fake_key)
            return self.cipher

        raise RuntimeError("ENCRYPTION_KEY must be set in production. Add it to your .env file.")

    def encrypt_credentials(self, data: dict) -> str:
        """Encrypt credentials dict to string"""
        json_str = json.dumps(data)
        return self._get_cipher().encrypt(json_str.encode()).decode()

    def decrypt_credentials(self, encrypted: str) -> dict:
        """Decrypt credentials string to dict"""
        decrypted = self._get_cipher().decrypt(encrypted.encode())
        return json.loads(decrypted.decode())

    async def get_default_credential(
        self,
        provider: Provider,
        db: AsyncSession
    ) -> Optional[Credential]:
        """Get default active credential for a provider"""
        result = await db.execute(
            select(Credential)
            .where(Credential.provider == provider)
            .where(Credential.is_active == True)
            .where(Credential.is_default == True)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_credentials(
        self,
        provider: Optional[str],
        db: AsyncSession
    ) -> List[Credential]:
        """List all credentials"""
        query = select(Credential)
        if provider:
            query = query.where(Credential.provider == provider)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def create_credential(
        self,
        obj_in: CredentialCreate,
        db: AsyncSession
    ) -> Credential:
        """Create new credential"""
        encrypted = self.encrypt_credentials(obj_in.credentials)
        db_obj = Credential(
            name=obj_in.name,
            provider=obj_in.provider,
            credentials=encrypted,
            metadata_json=obj_in.metadata,
            is_active=obj_in.is_active,
            is_default=obj_in.is_default
        )
        
        # If set as default, unset others for this provider
        if obj_in.is_default:
            await db.execute(
                update(Credential)
                .where(Credential.provider == obj_in.provider)
                .values(is_default=False)
            )
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update_credential(
        self,
        id: int,
        obj_in: CredentialUpdate,
        db: AsyncSession
    ) -> Optional[Credential]:
        """Update credential"""
        db_obj = await db.get(Credential, id)
        if not db_obj:
            return None
            
        update_data = obj_in.model_dump(exclude_unset=True)
        if "credentials" in update_data:
            update_data["credentials"] = self.encrypt_credentials(update_data["credentials"])
        
        if "metadata" in update_data:
            update_data["metadata_json"] = update_data.pop("metadata")
            
        # If set as default, unset others for this provider
        if update_data.get("is_default"):
            await db.execute(
                update(Credential)
                .where(Credential.provider == db_obj.provider)
                .where(Credential.id != id)
                .values(is_default=False)
            )
            
        for field, value in update_data.items():
            setattr(db_obj, field, value)
            
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete_credential(self, id: int, db: AsyncSession) -> bool:
        """Delete credential"""
        db_obj = await db.get(Credential, id)
        if not db_obj:
            return False
        await db.delete(db_obj)
        await db.commit()
        return True

    async def set_default(self, id: int, db: AsyncSession) -> Optional[Credential]:
        """Set credential as default for its provider"""
        db_obj = await db.get(Credential, id)
        if not db_obj:
            return None

        # Unset other defaults for this provider
        await db.execute(
            update(Credential)
            .where(Credential.provider == db_obj.provider)
            .where(Credential.id != id)
            .values(is_default=False)
        )

        db_obj.is_default = True
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def verify_credential(self, id: int, db: AsyncSession) -> Dict[str, Any]:
        """Test connection for credential"""
        db_obj = await db.get(Credential, id)
        if not db_obj:
            return {"success": False, "message": "Credential not found"}
            
        creds = self.decrypt_credentials(db_obj.credentials)
        
        if db_obj.provider == Provider.LINE:
            token = creds.get("channel_access_token")
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.line.me/v2/bot/info",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if response.status_code == 200:
                    return {"success": True, "message": "LINE connection verified", "data": response.json()}
                return {"success": False, "message": f"LINE error: {response.text}"}
                
        elif db_obj.provider == Provider.TELEGRAM:
            token = creds.get("bot_token")
            async with httpx.AsyncClient() as client:
                response = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                if response.status_code == 200:
                    return {"success": True, "message": "Telegram connection verified", "data": response.json()}
                return {"success": False, "message": f"Telegram error: {response.text}"}
                
        return {"success": False, "message": f"Verification not implemented for {db_obj.provider}"}

    def mask_credentials(self, encrypted_str: str) -> str:
        """Helper to mask sensitive values"""
        # Just show last 4 chars of the encrypted string as a unique-ish identifier
        return f"****{encrypted_str[-4:]}"

credential_service = CredentialService()
