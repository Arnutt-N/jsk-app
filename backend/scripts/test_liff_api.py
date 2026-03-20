from __future__ import annotations

import argparse
import json

import requests


DEFAULT_URL = "http://localhost:8000/api/v1/liff/service-requests"
DEFAULT_PAYLOAD = {
    "name": "Test User",
    "phone": "0812345678",
    "service_type": "Test Category",
    "description": "Scanning API Test",
    "line_user_id": "U1234567890dummy",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe the LIFF service-request endpoint.")
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Target LIFF endpoint URL.",
    )
    parser.add_argument(
        "--json",
        dest="json_body",
        help="Optional JSON payload string. Defaults to a sample service-request body.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="Request timeout in seconds.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Send the POST request. Without this flag the script only prints the request plan.",
    )
    return parser


def parse_json_body(raw_json: str | None) -> dict[str, object]:
    if raw_json is None:
        return dict(DEFAULT_PAYLOAD)
    return json.loads(raw_json)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    payload = parse_json_body(args.json_body)
    print(f"URL     : {args.url}")
    print(f"Timeout : {args.timeout}s")
    print(f"Payload : {json.dumps(payload, ensure_ascii=False)}")

    if not args.apply:
        print("\nDry run only. Re-run with --apply to POST the payload.")
        return 0

    try:
        response = requests.post(args.url, json=payload, timeout=args.timeout)
        print(f"Status  : {response.status_code}")
        print(f"Body    : {response.text}")
        return 0
    except Exception as exc:
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
