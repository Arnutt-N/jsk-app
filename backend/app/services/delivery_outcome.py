"""Shared result type for outbound delivery attempts."""
from enum import Enum


class DeliveryOutcome(Enum):
    """SENT = accepted, NOT_SENT = definite refusal, UNKNOWN = maybe delivered.

    SENT/NOT_SENT use legacy bool values so old boolean callers keep working;
    UNKNOWN is the new third state for ambiguous provider errors.
    """

    SENT = True
    NOT_SENT = False
    UNKNOWN = "UNKNOWN"

    # Legacy aggregate aliases.
    CONFIRMED = True
    FAILED = False


def as_outcome(value) -> DeliveryOutcome:
    """Coerce legacy boolean providers to the shared outcome enum."""
    if isinstance(value, DeliveryOutcome):
        return value
    if value == "UNKNOWN":
        return DeliveryOutcome.UNKNOWN
    return DeliveryOutcome.SENT if value else DeliveryOutcome.NOT_SENT


def aggregate_outcomes(outcomes) -> DeliveryOutcome:
    """Fold channel results: any SENT wins, then UNKNOWN, else NOT_SENT."""
    values = {as_outcome(value) for value in outcomes}
    if DeliveryOutcome.SENT in values:
        return DeliveryOutcome.SENT
    if DeliveryOutcome.UNKNOWN in values:
        return DeliveryOutcome.UNKNOWN
    return DeliveryOutcome.NOT_SENT
