"""Meta-guard: every auth gate in deps.py must be referenced by at least one test.

Recurring failure mode (2026-10 viewer role): a new gate
(get_current_*_or_viewer) was wired into endpoints while the endpoint
suites still overrode only the old gates. Dependency overrides are keyed
by object identity, so the new gate silently fell through to the real
auth and the suites 401'd. This test fails loudly the next time a gate
is added without test coverage.
"""

import inspect
from pathlib import Path

import app.api.deps as deps


def _gate_names():
    names = [
        name
        for name, obj in inspect.getmembers(deps, predicate=inspect.isfunction)
        if name.startswith("get_current_")
    ]
    names.append("require_permission")
    return sorted(names)


def _test_sources():
    tests_dir = Path(__file__).parent
    return {
        path.name: path.read_text(encoding="utf-8")
        for path in tests_dir.glob("test_*.py")
    }


def test_every_gate_is_referenced_by_tests():
    sources = _test_sources()
    missing = [
        name
        for name in _gate_names()
        if not any(name in src for src in sources.values())
    ]
    assert not missing, (
        "Auth gates with zero test references (add overrides/mocks): "
        + ", ".join(missing)
    )
