"""Meta-guard: every auth gate in deps.py must be CONCRETELY used by a test.

Recurring failure mode (2026-10 viewer role): a new gate
(get_current_*_or_viewer) was wired into endpoints while the endpoint
suites still overrode only the old gates. Dependency overrides are keyed
by object identity, so the new gate silently fell through to the real
auth and the suites 401'd. This test fails loudly the next time a gate
is added without test coverage.

"Used" means an AST reference, not a substring (F-019): a gate named only in
a comment or docstring used to satisfy the old text search, so an unwired gate
passed its own guard. We accept the three shapes a real override takes:

    app.dependency_overrides[deps.get_current_x] = ...   (subscript key)
    monkeypatch.setattr(deps, "get_current_x", ...)      (string target)
    monkeypatch.setattr("app.api.deps.get_current_x", ...)  (dotted target)

plus a bare `deps.get_current_x` reference passed as a call argument, which is
how a test injects a gate into `app.dependency_overrides` via a helper.
"""

import ast
import inspect
from pathlib import Path

import pytest

import app.api.deps as deps


def _gate_names():
    names = [
        name
        for name, obj in inspect.getmembers(deps, predicate=inspect.isfunction)
        if name.startswith("get_current_")
    ]
    names.append("require_permission")
    return sorted(names)


def _test_paths():
    return sorted(Path(__file__).parent.glob("test_*.py"))


def _docstring_nodes(tree: ast.AST) -> set[int]:
    """Ids of Constant nodes that are docstrings (prose, not wiring)."""
    found: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(
            node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            continue
        body = getattr(node, "body", None) or []
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            found.add(id(body[0].value))
    return found


def _concrete_references(source: str, name: str) -> bool:
    """Whether `name` appears in an AST position that actually wires a gate.

    Comments never reach the tree, and docstrings are skipped explicitly, so
    prose can never satisfy this — which is the whole point (F-019).
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:  # a test file mid-edit must not mask the real answer
        return False

    docstrings = _docstring_nodes(tree)

    for node in ast.walk(tree):
        # deps.<name> — covers override subscripts and plain injection.
        if isinstance(node, ast.Attribute) and node.attr == name:
            return True

        # monkeypatch.setattr(deps, "<name>", ...) / setattr(target, "deps.<name>", ...)
        if (
            isinstance(node, ast.Constant)
            and id(node) not in docstrings
            and isinstance(node.value, str)
        ):
            value = node.value
            if value == name or value.endswith(f".{name}"):
                return True

        # A bare imported name (e.g. `from app.api.deps import get_current_x`).
        if isinstance(node, ast.Name) and node.id == name:
            return True

        # ...or the import alias itself, which carries the name as a string.
        if isinstance(node, ast.alias) and (
            node.name == name or node.asname == name
        ):
            return True

    return False


def test_every_gate_is_concretely_referenced_by_tests():
    sources = {path.name: path.read_text(encoding="utf-8") for path in _test_paths()}
    missing = [
        name
        for name in _gate_names()
        if not any(_concrete_references(src, name) for src in sources.values())
    ]
    assert not missing, (
        "Auth gates with no concrete test usage (add overrides/mocks): "
        + ", ".join(missing)
    )


# Regression guards for F-019 itself: prose must not count, every real
# override shape must.
PROSE_SOURCES = [
    "# we should override get_current_fake_gate here someday\n"
    "def test_x():\n    assert True\n",
    '"""Prose mentioning get_current_fake_gate."""\ndef test_x():\n    assert True\n',
    'def test_x():\n    """get_current_fake_gate is checked elsewhere."""\n    assert True\n',
]

WIRING_SOURCES = [
    "app.dependency_overrides[deps.get_current_fake_gate] = f\n",
    'monkeypatch.setattr(deps, "get_current_fake_gate", f)\n',
    'monkeypatch.setattr("app.api.deps.get_current_fake_gate", f)\n',
    "from app.api.deps import get_current_fake_gate\n",
]


@pytest.mark.parametrize("source", PROSE_SOURCES)
def test_prose_does_not_count_as_gate_coverage(source: str):
    assert not _concrete_references(source, "get_current_fake_gate"), (
        "a comment or docstring mention must not satisfy the guard — that is "
        "exactly the false pass F-019 is about"
    )


@pytest.mark.parametrize("source", WIRING_SOURCES)
def test_real_wiring_counts_as_gate_coverage(source: str):
    assert _concrete_references(source, "get_current_fake_gate"), (
        "every shape a real dependency override takes must satisfy the guard"
    )
