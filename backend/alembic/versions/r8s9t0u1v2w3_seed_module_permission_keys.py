"""seed module permission keys

Phase 3 (Permissions v2): seed the 11 new module-based permission keys
into the permission_settings table with their default allowed roles and
Thai descriptions. These mirror app.core.permissions.DEFAULT_POLICY and
_SEED_DESCRIPTIONS exactly, so the Settings UI looks identical whether
the rows were populated by this migration or by the startup self-heal
hook (app.core.permissions.ensure_seed_rows).

All 11 keys default to ["SUPER_ADMIN","ADMIN"] EXCEPT view_reports,
which also grants the two manager tiers (DIRECTOR/HEAD) read access.

Idempotent via ON CONFLICT (key) DO NOTHING so re-running (or running
after the self-heal hook already inserted the rows) is harmless.

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-06-15 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Seed the 11 Phase 3 module keys. Roles and descriptions match
    # app.core.permissions.DEFAULT_POLICY / _SEED_DESCRIPTIONS exactly.
    op.execute(
        """
        INSERT INTO permission_settings (key, allowed_roles, description)
        VALUES
            (
                'manage_broadcast',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการ Broadcast (สร้าง/แก้/ส่ง/ตั้งเวลา)'
            ),
            (
                'manage_auto_replies',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการข้อความตอบกลับอัตโนมัติ (intents/keywords/responses)'
            ),
            (
                'manage_rich_menus',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการ Rich Menu'
            ),
            (
                'manage_reply_objects',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการ Reply Objects'
            ),
            (
                'export_chat',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'ส่งออกประวัติแชต (CSV/PDF)'
            ),
            (
                'manage_users',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการผู้ใช้ (สร้าง/แก้/ลบ/รีเซ็ตรหัสผ่าน)'
            ),
            (
                'manage_files',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'จัดการไฟล์ (อัปโหลด/ลบ/ลิงก์สาธารณะ)'
            ),
            (
                'view_reports',
                '["SUPER_ADMIN","ADMIN","DIRECTOR","HEAD"]'::jsonb,
                'ดูรายงานและสถิติ'
            ),
            (
                'view_audit_log',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'ดู Audit Log'
            ),
            (
                'edit_settings',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'แก้ไขการตั้งค่าระบบ (credentials/integrations)'
            ),
            (
                'image_resize',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'ใช้เครื่องมือ Image Resize'
            )
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM permission_settings
        WHERE key IN (
            'manage_broadcast',
            'manage_auto_replies',
            'manage_rich_menus',
            'manage_reply_objects',
            'export_chat',
            'manage_users',
            'manage_files',
            'view_reports',
            'view_audit_log',
            'edit_settings',
            'image_resize'
        );
        """
    )
