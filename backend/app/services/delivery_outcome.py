"""Shared result type for outbound delivery attempts."""
from enum import Enum


class DeliveryOutcome(Enum):
    """SENT = accepted, NOT_SENT = definite refusal, UNKNOWN = maybe delivered.

    SENT/NOT_SENT keep the old aggregate values ("CONFIRMED"/"FAILED") so
    persisted and injected legacy string outcomes remain valid.
    TEMPORARY_FAILURE = "TEMPORARY_FAILURE" marks a definite, retryable refusal.
    """

    SENT = "CONFIRMED"
    NOT_SENT = "FAILED"
    UNKNOWN = "UNKNOWN"
    TEMPORARY_FAILURE = "TEMPORARY_FAILURE"

    # Legacy aggregate names.
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"


def as_outcome(value) -> DeliveryOutcome:
    """Coerce legacy boolean or string outcomes to the shared enum."""
    if isinstance(value, DeliveryOutcome):
        return value
    if isinstance(value, str):
        try:
            return DeliveryOutcome(value)
        except ValueError:
            return DeliveryOutcome.NOT_SENT
    return DeliveryOutcome.SENT if value else DeliveryOutcome.NOT_SENT


def aggregate_outcomes(outcomes) -> DeliveryOutcome:
    """Fold channel results: any SENT wins, then UNKNOWN, then temporary failures."""
    values = {as_outcome(value) for value in outcomes}
    if DeliveryOutcome.SENT in values:
        return DeliveryOutcome.SENT
    if DeliveryOutcome.UNKNOWN in values:
        return DeliveryOutcome.UNKNOWN
    if DeliveryOutcome.TEMPORARY_FAILURE in values:
        return DeliveryOutcome.TEMPORARY_FAILURE
    return DeliveryOutcome.NOT_SENT
