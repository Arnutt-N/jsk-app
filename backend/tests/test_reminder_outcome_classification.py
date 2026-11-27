from app.services.booking_notifications import _classify_provider_error
from app.services.delivery_outcome import DeliveryOutcome


class ApiError(Exception):
    def __init__(self, status, headers=None):
        super().__init__(f"LINE API error {status}")
        self.status = status
        self.headers = headers or {}


def test_classifier_uses_structured_status_not_digits_in_text():
    assert _classify_provider_error(ApiError(400)) is DeliveryOutcome.NOT_SENT
    assert _classify_provider_error(ApiError(429)) is DeliveryOutcome.NOT_SENT
    assert _classify_provider_error(ApiError(503)) is DeliveryOutcome.UNKNOWN
    assert _classify_provider_error(RuntimeError("timeout with 503 in text")) is DeliveryOutcome.UNKNOWN
    assert _classify_provider_error(TimeoutError()) is DeliveryOutcome.UNKNOWN


def test_accepted_409_is_confirmed_delivery():
    exc = ApiError(409, {"x-line-accepted-request-id": "original"})
    assert _classify_provider_error(exc) is DeliveryOutcome.SENT
