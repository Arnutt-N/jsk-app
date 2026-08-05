"""Service-request lifecycle state machine.

This is the backend half of a rule that previously existed only in
`frontend/lib/constants/request-status.ts`. Because the frontend merely
*disabled buttons*, any caller talking to the API directly could jump
`PENDING -> COMPLETED` and skip `AWAITING_APPROVAL` — the approval step
was decoration, not a control.

Keep this map and the frontend map identical. `tests/test_request_workflow.py`
parses the TypeScript file and asserts equality, so drift fails CI rather
than reaching production.
"""
from typing import Iterable, Optional

from app.models.service_request import RequestStatus

# Which target states are reachable from each state.
#
# A status is deliberately NOT listed as a target of itself: a PATCH that
# repeats the current status is an idempotent no-op, handled in
# `can_transition`, not a "move".
STATUS_TRANSITIONS: dict[RequestStatus, frozenset[RequestStatus]] = {
    RequestStatus.PENDING: frozenset({
        RequestStatus.ACKNOWLEDGED,
        RequestStatus.REJECTED,
    }),
    RequestStatus.ACKNOWLEDGED: frozenset({
        RequestStatus.IN_PROGRESS,
        RequestStatus.REJECTED,
    }),
    RequestStatus.IN_PROGRESS: frozenset({
        RequestStatus.AWAITING_APPROVAL,
        RequestStatus.REJECTED,
        RequestStatus.COMPLETED,
    }),
    RequestStatus.AWAITING_APPROVAL: frozenset({
        RequestStatus.COMPLETED,
        RequestStatus.REJECTED,
        RequestStatus.IN_PROGRESS,
    }),
    # PRD B: revert-from-COMPLETED via the kebab "การจัดการพิเศษ" menu.
    # Reachability is asserted here; *who* may do it is a separate
    # permission check (can_revert_approval) in the endpoint.
    RequestStatus.COMPLETED: frozenset({
        RequestStatus.AWAITING_APPROVAL,
        RequestStatus.IN_PROGRESS,
    }),
    RequestStatus.REJECTED: frozenset({
        RequestStatus.PENDING,
    }),
}


class InvalidStatusTransition(ValueError):
    """Raised when a caller asks for a move the workflow does not allow.

    Carries the raw states so the endpoint can build a 422 body that names
    what was attempted and what would have been legal, instead of a bare
    string the client has to parse.
    """

    def __init__(
        self,
        from_status: Optional[RequestStatus],
        to_status: RequestStatus,
        allowed: Iterable[RequestStatus],
    ) -> None:
        self.from_status = from_status
        self.to_status = to_status
        self.allowed = tuple(allowed)

        from_label = from_status.value if from_status else "NULL"
        allowed_label = ", ".join(sorted(s.value for s in self.allowed)) or "none"
        super().__init__(
            f"Invalid status transition {from_label} -> {to_status.value}. "
            f"Allowed from {from_label}: {allowed_label}"
        )


def allowed_transitions(
    from_status: Optional[RequestStatus],
) -> frozenset[RequestStatus]:
    """Target states reachable from `from_status`.

    A NULL status means a legacy row written before the enum existed; the
    only sane move is to bring it onto the workflow at its entry point.
    Mirrors the frontend `if (!from) return to === 'PENDING'` branch.
    """
    if from_status is None:
        return frozenset({RequestStatus.PENDING})
    return STATUS_TRANSITIONS.get(from_status, frozenset())


def can_transition(
    from_status: Optional[RequestStatus],
    to_status: RequestStatus,
) -> bool:
    """True when moving `from_status` -> `to_status` is legal.

    Restating the current status is always allowed: PATCH payloads carry
    the whole form, so an edit to `priority` alone often re-sends the
    unchanged status.
    """
    if from_status is not None and from_status == to_status:
        return True
    return to_status in allowed_transitions(from_status)


def validate_transition(
    from_status: Optional[RequestStatus],
    to_status: RequestStatus,
) -> None:
    """Raise `InvalidStatusTransition` unless the move is legal."""
    if not can_transition(from_status, to_status):
        raise InvalidStatusTransition(
            from_status, to_status, allowed_transitions(from_status)
        )


def requires_override(
    from_status: Optional[RequestStatus],
    to_status: RequestStatus,
) -> bool:
    """True when the move sits outside the normal workflow.

    The admin UI deliberately offers two supervisor shortcuts that skip
    steps — "บังคับเสร็จสิ้น" (force-complete from any state) and
    "ย้อนกลับ รอรับเรื่อง" (send back to the start) — both gated on the
    `assign_request` permission. So an out-of-map move is not necessarily
    an attack: it is either an authorized override or a caller with no
    business making it.

    The endpoint decides which, using the caller's permissions. This
    function only answers "is this off the happy path?".
    """
    return not can_transition(from_status, to_status)


def describe_invalid_transition(
    from_status: Optional[RequestStatus],
    to_status: RequestStatus,
) -> str:
    """Human-readable rejection message naming both states and the legal moves."""
    return str(
        InvalidStatusTransition(
            from_status, to_status, allowed_transitions(from_status)
        )
    )
