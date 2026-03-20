from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests
from _cli_utils import resolve_output_path


DEFAULT_URL = "http://localhost:8000/api/v1/admin/live-chat/conversations"
DEFAULT_TIMEOUT = 10.0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a simple GET request against the backend API.")
    parser.add_argument(
        "url",
        nargs="?",
        default=DEFAULT_URL,
        help=f"Target URL to request. Defaults to {DEFAULT_URL}",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help="Request timeout in seconds.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional file path to save the response body or error text.",
    )
    return parser


def write_output(output_path: Path | None, content: str) -> None:
    if output_path is None:
        return
    output_path.write_text(content, encoding="utf-8")
    print(f"Saved response to: {output_path}")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    output_path = resolve_output_path(args.output)

    print(f"URL     : {args.url}")
    print(f"Timeout : {args.timeout}s")
    try:
        response = requests.get(args.url, timeout=args.timeout)
        print(f"Status  : {response.status_code}")
        try:
            body = json.dumps(response.json(), indent=2, ensure_ascii=False)
        except ValueError:
            body = response.text
        print(body)
        write_output(output_path, body)
        return 0
    except Exception as exc:
        message = f"Error: {exc}"
        print(message)
        write_output(output_path, message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
