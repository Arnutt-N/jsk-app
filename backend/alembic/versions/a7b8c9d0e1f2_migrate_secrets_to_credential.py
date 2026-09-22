"""one-shot: move secret SystemSetting rows into encrypted Credential rows.

Payload contract (source-faithful to credential_service.py:74-82):
- CredentialService.encrypt_credentials(dict) -> json.dumps(dict) -> Fernet.
- decrypt_credentials(str) -> dict. Bare-string rows would break normal reads.
- Per-key dict shape:
  LINE_CHANNEL_ACCESS_TOKEN -> provider LINE, {"channel_access_token": value}
  LINE_CHANNEL_SECRET -> provider LINE, {"channel_secret": value}
  TELEGRAM_BOT_TOKEN -> provider TELEGRAM, {"bot_token": value}
  TELEGRAM_CHAT_ID -> provider TELEGRAM, {"chat_id": value}
  N8N_API_KEY -> provider CUSTOM, {"value": value}
  N8N_WEBHOOK_SECRET -> provider CUSTOM, {"value": value}
- Root keys ENCRYPTION_KEY / LINE_ID_HMAC_KEY are NEVER migrated here:
  they stay env-only, are deleted from SystemSetting if present, and are
  documented in the plan notes. Do not encrypt a root key with itself.
Backup contract (long-lived but locked):
- Table _secret_migration_backup stores the Fernet-encrypted blob (never
  plaintext) + key name + setting id + migrated_by revision + created_at.
- Access requires KEY_MANAGE_CREDENTIALS (created in D7 — Wave D, after
  Wave B; until D7 lands, backup-table access is manual/DB-admin only,
  every read/purge writes audit log).
- Purge is explicit only: `DELETE FROM _secret_migration_backup WHERE ...`
  after operator confirmation. No auto-DROP on upgrade. Downgrade keeps the
  backup (does not DROP) so upgrade -> downgrade -> upgrade is repeatable.
Rollback ownership:
- Each Credential row created here sets metadata {"migrated_by": revision}.
- Downgrade deletes ONLY rows with that marker, then restores SystemSetting
  plaintext from the decrypted backup. Pre-existing Credentials are preserved.
"""
import os
from alembic import op
import sqlalchemy as sa
from cryptography.fernet import Fernet

revision = "a7b8c9d0e1f2"
down_revision = "t1u2v3w4x5y6"  # verified head 2026-09-22 (alembic heads)

_DENY_MIGRATE = (
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET",
)
# Root keys: never encrypted with themselves, never inserted into credentials.
# They stay env-only; if present in SystemSetting they are deleted (value is
# NOT backed up — operator must confirm env already holds them).
_ROOT_KEYS = ("ENCRYPTION_KEY", "LINE_ID_HMAC_KEY")
_MIGRATED_BY = revision


def _payload_for(key: str, value: str) -> tuple[str, dict]:
    if key == "LINE_CHANNEL_ACCESS_TOKEN":
        return ("LINE", {"channel_access_token": value})
    if key == "LINE_CHANNEL_SECRET":
        return ("LINE", {"channel_secret": value})
    if key == "TELEGRAM_BOT_TOKEN":
        return ("TELEGRAM", {"bot_token": value})
    if key == "TELEGRAM_CHAT_ID":
        return ("TELEGRAM", {"chat_id": value})
    return ("CUSTOM", {"value": value})


def upgrade() -> None:
    import json

    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY must be set before running this migration")
    cipher = Fernet(key.encode())
    conn = op.get_bind()

    # 1) backup table แบบเก็บยาวแต่ล็อกแน่น: เก็บเฉพาะ blob เข้ารหัสแล้ว
    # ห้ามเก็บ plaintext. เข้าดูต้องมี KEY_MANAGE_CREDENTIALS + audit log
    # (key สร้างใน D7 Wave D — ก่อนหน้านั้นใช้ manual/DB-admin + audit log).
    # ลบแบบ explicit เท่านั้น (ห้าม auto-DROP). downgrade ไม่ DROP เพื่อให้
    # upgrade -> downgrade -> upgrade ทำซ้ำได้.
    # `"key"`/`"value"` ต้อง quote เสมอ — `key` เป็น reserved word ของ Postgres
    conn.execute(sa.text(
        'CREATE TABLE IF NOT EXISTS _secret_migration_backup ('
        'setting_id INTEGER PRIMARY KEY, '
        '"key" TEXT NOT NULL, '
        'enc_value TEXT NOT NULL, '
        'migrated_by TEXT NOT NULL, '
        'created_at TIMESTAMPTZ DEFAULT now())'
    ))

    # 1b) root keys อยู่ env-only: ถ้าหลงใน SystemSetting ให้ลบทิ้ง
    # (ไม่ backup — operator ต้องยืนยันว่า env มีค่าแล้วก่อนรัน)
    conn.execute(sa.text(
        'DELETE FROM system_settings WHERE "key" = ANY(:keys)'
    ), {"keys": list(_ROOT_KEYS)})

    # 2) อ่านค่า secret 6 ตัวที่ต้องย้าย (idempotent: รันซ้ำไม่สร้างซ้ำ)
    rows = conn.execute(sa.text(
        'SELECT id, "key", "value" FROM system_settings WHERE "key" = ANY(:keys)'
    ), {"keys": list(_DENY_MIGRATE)}).mappings().all()
    for row in rows:
        provider, payload = _payload_for(row["key"], str(row["value"] or ""))
        # verify Fernet(JSON(dict)) roundtrip ก่อน insert (source-faithful)
        raw_json = json.dumps(payload)
        enc = cipher.encrypt(raw_json.encode()).decode()
        if json.loads(cipher.decrypt(enc.encode()).decode()) != payload:
            raise RuntimeError(f"roundtrip verify failed for {row['key']}")
        # backup: เก็บ blob เข้ารหัสของ {"value": plaintext} (ไม่ใช่ plaintext)
        backup_enc = cipher.encrypt(
            json.dumps({"value": str(row["value"] or "")}).encode()
        ).decode()
        conn.execute(sa.text(
            'INSERT INTO _secret_migration_backup (setting_id, "key", enc_value, migrated_by) '
            'VALUES (:sid, :key, :enc, :by) '
            'ON CONFLICT (setting_id) DO UPDATE SET enc_value = EXCLUDED.enc_value, '
            '"key" = EXCLUDED."key", migrated_by = EXCLUDED.migrated_by'
        ), {"sid": row["id"], "key": row["key"], "enc": backup_enc, "by": _MIGRATED_BY})
        # insert Credential แบบ idempotent: ข้ามถ้ามี marker ของ revision นี้แล้ว
        exists = conn.execute(sa.text(
            "SELECT id FROM credentials WHERE name = :name "
            "AND metadata->>'migrated_by' = :by LIMIT 1"
        ), {"name": row["key"], "by": _MIGRATED_BY}).scalar_one_or_none()
        if exists is None:
            conn.execute(sa.text(
                'INSERT INTO credentials (name, provider, credentials, metadata, is_active, is_default) '
                "VALUES (:name, :provider, :credentials, "
                "jsonb_build_object('migrated_by', CAST(:by AS TEXT)), true, false)"
            ), {"name": row["key"], "provider": provider,
                "credentials": enc, "by": _MIGRATED_BY})
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = \'***MIGRATED***\' WHERE id = :id'
        ), {"id": row["id"]})


def downgrade() -> None:
    import json

    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY must be set before running this downgrade")
    cipher = Fernet(key.encode())
    conn = op.get_bind()
    # restore จาก backup ที่ถอดรหัสแล้วเท่านั้น — ไม่ถอด Credential กลับอัตโนมัติ.
    # ลบเฉพาะ Credential ที่มี marker migrated_by ของ revision นี้เท่านั้น
    # ของเก่าที่มีก่อน migration ต้องอยู่ครบ. ไม่ DROP backup (เก็บยาว).
    rows = conn.execute(sa.text(
        'SELECT setting_id, "key", enc_value FROM _secret_migration_backup '
        'WHERE migrated_by = :by'
    ), {"by": _MIGRATED_BY}).mappings().all()
    for row in rows:
        plain = json.loads(cipher.decrypt(row["enc_value"].encode()).decode())["value"]
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = :value WHERE id = :id'
        ), {"value": plain, "id": row["setting_id"]})
    conn.execute(sa.text(
        "DELETE FROM credentials WHERE metadata->>'migrated_by' = :by"
    ), {"by": _MIGRATED_BY})
    # NOTE: ตั้งใจไม่ DROP _secret_migration_backup — purge แบบ explicit เท่านั้น:
    #   DELETE FROM _secret_migration_backup WHERE migrated_by = 'a7b8c9d0e1f2';
    #   (ต้องมี KEY_MANAGE_CREDENTIALS + audit log + operator confirm;
    #    key สร้างใน D7 — ก่อนหน้านั้น manual/DB-admin + audit log)
