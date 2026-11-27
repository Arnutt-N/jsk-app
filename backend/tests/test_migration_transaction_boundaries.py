import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSIONS = ROOT / "backend" / "alembic" / "versions"
RUNBOOK = ROOT / "docs" / "DB_MIGRATION_RUNBOOK_TH.md"

LEGACY_MANUAL_COMMIT_REVISIONS = {
    "c1d2e3f4a5b6",
    "d5e6f7a8b9c0",
    "m3n4o5p6q7r8",
}


def _revision(tree: ast.AST) -> str | None:
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if not any(isinstance(t, ast.Name) and t.id == "revision" for t in targets):
            continue
        value = node.value
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            return value.value
    return None


def _is_commit_literal(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.strip().strip("'\"").rstrip(";").strip().upper() == "COMMIT"
    if isinstance(node, ast.Call) and node.args:
        return _is_commit_literal(node.args[0])
    return False


def _has_manual_commit(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "execute":
            if any(_is_commit_literal(arg) for arg in node.args):
                return True
        if isinstance(func, ast.Attribute) and func.attr == "commit":
            inner = func.value
            if (
                isinstance(inner, ast.Call)
                and isinstance(inner.func, ast.Attribute)
                and inner.func.attr == "get_bind"
            ):
                return True
        if isinstance(func, ast.Attribute) and func.attr == "autocommit_block":
            return True
    return False


def test_only_legacy_enum_migrations_commit_manually():
    offenders = []
    for path in VERSIONS.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        if _has_manual_commit(tree) and _revision(tree) not in LEGACY_MANUAL_COMMIT_REVISIONS:
            offenders.append(path.name)
    assert offenders == []


def test_runbook_documents_partial_recovery_and_enum_downgrade():
    text = RUNBOOK.read_text(encoding="utf-8")
    assert "c1d2e3f4a5b6" in text
    assert "alembic current" in text
    assert "stamp c1d2e3f4a5b6" in text
    assert "ix_broadcast_send_attempts_broadcast_id" in text
    assert 'psql "$PG_URL"' in text
    assert "dotenv_values('.env')" in text
    assert "รันคำสั่งในบล็อกนี้จาก `backend/`" in text
    assert "ลบ label enum ไม่ได้" in text
