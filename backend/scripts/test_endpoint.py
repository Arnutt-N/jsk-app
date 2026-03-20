from __future__ import annotations

import argparse
import json

from _cli_utils import ensure_backend_on_path


DEFAULT_PATH = "/api/v1/admin/settings/line/validate"
DEFAULT_JSON = {"channel_access_token": "test"}

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Exercise a FastAPI endpoint with TestClient.")
    parser.add_argument(
        "--method",
        default="POST",
        choices=["GET", "POST", "PUT", "PATCH", "DELETE"],
        help="HTTP method to use.",
    )
    parser.add_argument(
        "--path",
        default=DEFAULT_PATH,
        help=f"API path to request. Defaults to {DEFAULT_PATH}",
    )
    parser.add_argument(
        "--json",
        dest="json_body",
        help="Optional JSON payload string. Defaults to a sample payload for the default endpoint.",
    )
    return parser


def parse_json_body(raw_json: str | None) -> object | None:
    if raw_json is None:
        return DEFAULT_JSON
    return json.loads(raw_json)


def main(argv: list[str] | None = None) -> int:
    from fastapi.testclient import TestClient

    from app.main import app

    args = build_parser().parse_args(argv)
    payload = parse_json_body(args.json_body)
    client = TestClient(app)

    print(f"Method  : {args.method}")
    print(f"Path    : {args.path}")
    try:
        response = client.request(args.method, args.path, json=payload)
        print(f"Status  : {response.status_code}")
        try:
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))
        except ValueError:
            print(response.text)
        return 0
    except Exception as exc:
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
