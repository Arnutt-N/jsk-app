from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSIONS = ROOT / "backend" / "alembic" / "versions"
RUNBOOK = ROOT / "docs" / "DB_MIGRATION_RUNBOOK_TH.md"


LEGACY_MANUAL_COMMITS = {
    "c1d2e3f4a5b6_broadcast_send_recovery.py",
    "d5e6f7a8b9c0_add_viewer_role.py",
    "m3n4o5p6q7r8_add_acknowledged_status_and_director_head_roles.py",
}


def test_only_legacy_enum_migrations_commit_manually():
    offenders = []
    for path in VERSIONS.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if 'op.execute("COMMIT")' in text and path.name not in LEGACY_MANUAL_COMMITS:
            offenders.append(path.name)
    assert offenders == []


def test_runbook_documents_partial_recovery_and_enum_downgrade():
    text = RUNBOOK.read_text(encoding="utf-8")
    assert "c1d2e3f4a5b6" in text
    assert "alembic current" in text
    assert "stamp c1d2e3f4a5b6" in text
    assert "ลบ label enum ไม่ได้" in text
