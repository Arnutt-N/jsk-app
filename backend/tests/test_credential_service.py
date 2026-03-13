"""Unit tests for credential encryption service behavior."""
import pytest

from app.services.credential_service import CredentialService


@pytest.mark.asyncio
async def test_missing_encryption_key_in_production_raises_on_use():
    service = CredentialService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "production")
        mp.setattr("app.services.credential_service.settings.ENCRYPTION_KEY", "")

        with pytest.raises(RuntimeError, match="ENCRYPTION_KEY must be set"):
            service.encrypt_credentials({"token": "secret"})


def test_missing_encryption_key_in_development_uses_fallback_key():
    service = CredentialService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "development")
        mp.setattr("app.services.credential_service.settings.ENCRYPTION_KEY", "")

        encrypted = service.encrypt_credentials({"token": "secret"})
        decrypted = service.decrypt_credentials(encrypted)

    assert decrypted == {"token": "secret"}
