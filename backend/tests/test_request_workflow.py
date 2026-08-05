"""Unit tests for the service-request state machine.

The transition map used to live only in
`frontend/lib/constants/request-status.ts`, so the backend accepted any
status jump a caller sent (PENDING -> COMPLETED skipped approval
entirely). These tests pin the backend copy and, critically, assert it
stays byte-for-byte in step with the frontend file -- the two are a
single rule expressed twice, and a silent drift re-opens the hole.
"""
import re
from pathlib import Path

import pytest

from app.core.request_workflow import (
    STATUS_TRANSITIONS,
    InvalidStatusTransition,
    can_transition,
    describe_invalid_transition,
    requires_override,
    validate_transition,
)
from app.models.service_request import RequestStatus


# ---------------------------------------------------------------------------
# Map shape
# ---------------------------------------------------------------------------

def test_every_status_has_an_entry():
    """A status missing from the map would make can_transition() deny
    everything from it, freezing rows in that state."""
    assert set(STATUS_TRANSITIONS) == set(RequestStatus)


def test_no_status_can_transition_to_itself_via_the_map():
    """Self-transitions are handled as an explicit no-op by the caller,
    not by the map -- keeping them out keeps the map a pure 'what moves
    are legal' statement."""
    for status, allowed in STATUS_TRANSITIONS.items():
        assert status not in allowed


def test_all_targets_are_real_statuses():
    for allowed in STATUS_TRANSITIONS.values():
        for target in allowed:
            assert isinstance(target, RequestStatus)


# ---------------------------------------------------------------------------
# The workflow the map is supposed to encode
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("from_status,to_status", [
    (RequestStatus.PENDING, RequestStatus.ACKNOWLEDGED),
    (RequestStatus.PENDING, RequestStatus.REJECTED),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.IN_PROGRESS),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.REJECTED),
    (RequestStatus.IN_PROGRESS, RequestStatus.AWAITING_APPROVAL),
    (RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED),
    (RequestStatus.IN_PROGRESS, RequestStatus.REJECTED),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.COMPLETED),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.REJECTED),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.IN_PROGRESS),
    # PRD B revert-from-COMPLETED (supervisor only, permission-gated
    # separately in the endpoint)
    (RequestStatus.COMPLETED, RequestStatus.AWAITING_APPROVAL),
    (RequestStatus.COMPLETED, RequestStatus.IN_PROGRESS),
    (RequestStatus.REJECTED, RequestStatus.PENDING),
])
def test_allowed_transitions(from_status, to_status):
    assert can_transition(from_status, to_status) is True


@pytest.mark.parametrize("from_status,to_status", [
    # The defect that motivated this module: skipping the whole approval
    # chain in one PATCH.
    (RequestStatus.PENDING, RequestStatus.COMPLETED),
    (RequestStatus.PENDING, RequestStatus.IN_PROGRESS),
    (RequestStatus.PENDING, RequestStatus.AWAITING_APPROVAL),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.COMPLETED),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.AWAITING_APPROVAL),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.PENDING),
    (RequestStatus.IN_PROGRESS, RequestStatus.PENDING),
    (RequestStatus.COMPLETED, RequestStatus.REJECTED),
    (RequestStatus.COMPLETED, RequestStatus.PENDING),
    (RequestStatus.REJECTED, RequestStatus.COMPLETED),
    (RequestStatus.REJECTED, RequestStatus.IN_PROGRESS),
    (RequestStatus.REJECTED, RequestStatus.ACKNOWLEDGED),
])
def test_forbidden_transitions(from_status, to_status):
    assert can_transition(from_status, to_status) is False


# ---------------------------------------------------------------------------
# Legacy rows: status is NULL in the DB for pre-enum records
# ---------------------------------------------------------------------------

def test_null_status_may_only_become_pending():
    """Mirrors the frontend `if (!from) return to === 'PENDING'` branch."""
    assert can_transition(None, RequestStatus.PENDING) is True
    for status in RequestStatus:
        if status is not RequestStatus.PENDING:
            assert can_transition(None, status) is False


def test_self_transition_is_allowed():
    """A PATCH that carries the unchanged status alongside an edit to some
    other field must not be rejected."""
    for status in RequestStatus:
        assert can_transition(status, status) is True


# ---------------------------------------------------------------------------
# validate_transition() -- the raising wrapper the endpoint uses
# ---------------------------------------------------------------------------

def test_validate_transition_passes_silently_when_allowed():
    assert validate_transition(RequestStatus.PENDING, RequestStatus.ACKNOWLEDGED) is None


def test_validate_transition_raises_with_both_states_named():
    with pytest.raises(InvalidStatusTransition) as exc:
        validate_transition(RequestStatus.PENDING, RequestStatus.COMPLETED)

    message = str(exc.value)
    assert "PENDING" in message
    assert "COMPLETED" in message


def test_validate_transition_exposes_machine_readable_states():
    """The endpoint turns this into a 422 body; the caller needs the raw
    states, not just prose."""
    with pytest.raises(InvalidStatusTransition) as exc:
        validate_transition(RequestStatus.REJECTED, RequestStatus.COMPLETED)

    assert exc.value.from_status is RequestStatus.REJECTED
    assert exc.value.to_status is RequestStatus.COMPLETED
    assert set(exc.value.allowed) == {RequestStatus.PENDING}


# ---------------------------------------------------------------------------
# requires_override() -- the supervisor-shortcut boundary
#
# The admin UI's kebab menu offers two moves that deliberately skip steps,
# both gated on `can_assign`:
#   "บังคับเสร็จสิ้น"      -> COMPLETED from any state
#   "ย้อนกลับ รอรับเรื่อง" -> PENDING from any active state
# They must stay OFF the map: if someone folds them in, the endpoint stops
# labelling them `status_change_forced` and the audit trail silently loses
# the distinction between "approved" and "approval skipped".
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("from_status,to_status", [
    # "บังคับเสร็จสิ้น" from the states where it is genuinely a skip
    (RequestStatus.PENDING, RequestStatus.COMPLETED),
    (RequestStatus.ACKNOWLEDGED, RequestStatus.COMPLETED),
    (RequestStatus.REJECTED, RequestStatus.COMPLETED),
    # "ย้อนกลับ รอรับเรื่อง"
    (RequestStatus.ACKNOWLEDGED, RequestStatus.PENDING),
    (RequestStatus.IN_PROGRESS, RequestStatus.PENDING),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.PENDING),
])
def test_supervisor_shortcuts_require_override(from_status, to_status):
    assert requires_override(from_status, to_status) is True


@pytest.mark.parametrize("from_status,to_status", [
    # Force-complete from these two is already the normal next step, so it
    # must NOT be flagged as an override.
    (RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.COMPLETED),
    # Reject is on-map from every active state.
    (RequestStatus.PENDING, RequestStatus.REJECTED),
    (RequestStatus.AWAITING_APPROVAL, RequestStatus.REJECTED),
    # And the one legal route back to PENDING.
    (RequestStatus.REJECTED, RequestStatus.PENDING),
])
def test_on_map_moves_need_no_override(from_status, to_status):
    assert requires_override(from_status, to_status) is False


def test_describe_invalid_transition_matches_the_exception_text():
    """The endpoint sends this string as the 422 body; keep it identical to
    what validate_transition would have raised."""
    with pytest.raises(InvalidStatusTransition) as exc:
        validate_transition(RequestStatus.PENDING, RequestStatus.COMPLETED)

    assert describe_invalid_transition(
        RequestStatus.PENDING, RequestStatus.COMPLETED
    ) == str(exc.value)


# ---------------------------------------------------------------------------
# Cross-language parity -- the guard against silent drift
# ---------------------------------------------------------------------------

_FRONTEND_CONSTANTS = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "lib" / "constants" / "request-status.ts"
)


def _parse_frontend_transitions(source: str) -> dict[str, set[str]]:
    """Extract STATUS_TRANSITIONS from the TypeScript source.

    Deliberately a dumb regex parse rather than an import: the point is to
    read what the frontend file actually says today, with no build step and
    no Node dependency in the Python test run.
    """
    block = re.search(
        r"export const STATUS_TRANSITIONS[^=]*=\s*\{(.*?)\n\}",
        source,
        re.DOTALL,
    )
    assert block, "STATUS_TRANSITIONS not found in the frontend constants file"

    parsed: dict[str, set[str]] = {}
    for line in block.group(1).splitlines():
        line = line.split("//")[0].strip()
        entry = re.match(r"^([A-Z_]+)\s*:\s*\[(.*?)\]\s*,?$", line)
        if entry:
            targets = re.findall(r"'([A-Z_]+)'", entry.group(2))
            parsed[entry.group(1)] = set(targets)
    return parsed


@pytest.mark.skipif(
    not _FRONTEND_CONSTANTS.exists(),
    reason="frontend sources not present in this checkout",
)
def test_backend_map_matches_frontend_map():
    """If someone edits one side only, this fails loudly.

    Backend enforcement without frontend parity means buttons the UI offers
    get rejected by the API; frontend-only edits re-open the original hole.
    """
    frontend = _parse_frontend_transitions(_FRONTEND_CONSTANTS.read_text(encoding="utf-8"))
    backend = {
        status.value: {target.value for target in targets}
        for status, targets in STATUS_TRANSITIONS.items()
    }

    assert frontend == backend
