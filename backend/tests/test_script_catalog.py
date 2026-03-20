from __future__ import annotations

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import check_requests  # noqa: E402
import refresh_materialized_views  # noqa: E402
import test_liff_api  # noqa: E402
import test_webhook_logic  # noqa: E402


def test_check_requests_defaults_to_limit_five() -> None:
    args = check_requests.build_parser().parse_args([])

    assert args.limit == 5


def test_refresh_materialized_views_defaults_to_dry_run() -> None:
    args = refresh_materialized_views.build_parser().parse_args([])

    assert args.no_concurrently is False
    assert args.apply is False


def test_test_liff_api_defaults_to_dry_run() -> None:
    args = test_liff_api.build_parser().parse_args([])

    assert args.url == test_liff_api.DEFAULT_URL
    assert args.timeout == 10.0
    assert args.apply is False
    assert test_liff_api.parse_json_body(args.json_body) == test_liff_api.DEFAULT_PAYLOAD


def test_test_webhook_logic_uses_default_texts_when_none_supplied() -> None:
    args = test_webhook_logic.build_parser().parse_args([])

    assert args.texts == []
    assert test_webhook_logic.DEFAULT_TEXTS[0] == "สวัสดี"
