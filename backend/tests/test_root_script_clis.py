from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import manage_rich_menu
import run
import test_endpoint
import verify_api
import verify_db
import verify_schema_extended


def test_manage_rich_menu_defaults_to_list_only() -> None:
    args = manage_rich_menu.build_parser().parse_args([])

    assert args.delete_all is False
    assert args.delete is None
    assert args.unlink_known_users is False
    assert args.apply is False


def test_manage_rich_menu_rejects_unlink_without_delete_all() -> None:
    args = manage_rich_menu.build_parser().parse_args(["--unlink-known-users"])

    try:
        manage_rich_menu.validate_args(args)
    except ValueError as exc:
        assert str(exc) == "--unlink-known-users can only be used together with --delete-all"
    else:
        raise AssertionError("validate_args should reject --unlink-known-users without --delete-all")


def test_verify_db_output_path_is_optional() -> None:
    args = verify_db.build_parser().parse_args([])

    assert args.output is None


def test_verify_db_resolves_relative_output_path(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)

    assert verify_db.resolve_output_path(Path("verification.txt")) == (
        tmp_path / "verification.txt"
    ).resolve()


def test_verify_schema_output_path_is_optional() -> None:
    args = verify_schema_extended.build_parser().parse_args([])

    assert args.output is None


def test_verify_api_defaults_are_safe() -> None:
    args = verify_api.build_parser().parse_args([])

    assert args.url == verify_api.DEFAULT_URL
    assert args.timeout == 10.0
    assert args.output is None


def test_verify_api_resolves_relative_output_path(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)

    assert verify_api.resolve_output_path(Path("api.json")) == (tmp_path / "api.json").resolve()


def test_test_endpoint_defaults_match_existing_quick_check() -> None:
    args = test_endpoint.build_parser().parse_args([])

    assert args.method == "POST"
    assert args.path == test_endpoint.DEFAULT_PATH
    assert args.json_body is None
    assert test_endpoint.parse_json_body(args.json_body) == test_endpoint.DEFAULT_JSON


def test_test_endpoint_parses_custom_json_body() -> None:
    payload = test_endpoint.parse_json_body('{"hello":"world"}')

    assert payload == {"hello": "world"}


def test_run_defaults_to_local_target() -> None:
    args = run.build_parser().parse_args([])

    assert args.target == "local"
    assert args.host == "0.0.0.0"
    assert args.port == 8000
    assert args.reload is True


def test_run_builds_uvicorn_command_without_reload() -> None:
    args = run.build_parser().parse_args(["--target", "remote", "--no-reload", "--port", "9000"])

    assert run.build_uvicorn_command(args) == [
        run.sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "9000",
    ]
