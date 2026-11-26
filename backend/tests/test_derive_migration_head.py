from pathlib import Path

import pytest

from alembic.config import Config
from alembic.script import ScriptDirectory
from scripts.derive_migration_head import find_head, revision_graph


def _write(path: Path, revision: str, down_revision: str | None) -> None:
    down = "None" if down_revision is None else repr(down_revision)
    path.write_text(
        f'revision = "{revision}"\ndown_revision = {down}\n', encoding="utf-8"
    )


def test_deploy_workflow_derives_head_instead_of_hardcoding_it():
    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "cd.yml"
    ).read_text(encoding="utf-8")
    assert 'revision="$(python scripts/derive_migration_head.py)"' in workflow
    assert 'echo "revision=$revision" >> "$GITHUB_OUTPUT"' in workflow
    assert "EXPECTED_REVISION: ${{ steps.revision.outputs.revision }}" in workflow
    assert "Expected revision: ${{ steps.revision.outputs.revision }}" in workflow
    assert "EXPECTED_REVISION: f09a1b2c3d4" not in workflow


def test_find_head_matches_alembic_on_current_revisions():
    backend = Path(__file__).resolve().parents[1]
    versions = backend / "alembic" / "versions"
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    [expected] = ScriptDirectory.from_config(config).get_heads()
    assert find_head(revision_graph(versions.glob("*.py"))) == expected


def test_find_head_follows_a_synthetic_successor(tmp_path):
    _write(tmp_path / "base.py", "base123", None)
    _write(tmp_path / "next.py", "next456", "base123")
    assert find_head(revision_graph(tmp_path.glob("*.py"))) == "next456"


@pytest.mark.parametrize("heads", [0, 2])
def test_find_head_rejects_zero_or_multiple_heads(tmp_path, heads):
    if heads == 0:
        _write(tmp_path / "cycle_a.py", "cycle_a", "cycle_b")
        _write(tmp_path / "cycle_b.py", "cycle_b", "cycle_a")
    else:
        _write(tmp_path / "a.py", "aaa", None)
        _write(tmp_path / "b.py", "bbb", None)
    with pytest.raises(ValueError, match="expected one migration head"):
        find_head(revision_graph(tmp_path.glob("*.py")))
