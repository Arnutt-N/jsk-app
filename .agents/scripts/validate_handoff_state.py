#!/usr/bin/env python3
"""
Validate cross-platform handoff state consistency for SknApp.

Usage:
  python .agents/scripts/validate_handoff_state.py
  python .agents/scripts/validate_handoff_state.py --platform codeX
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]


def parse_iso(ts: str) -> datetime | None:
    candidate = ts.strip().replace("Z", "+00:00")
    candidate = re.sub(r"(\.\d{6})\d+(?=(?:[+-]\d{2}:\d{2}|$))", r"\1", candidate)
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        return None


def parse_project_status_ts(line: str) -> datetime | None:
    # Expected: > **Last Updated:** YYYY-MM-DD HH:MM by ...
    m = re.search(r"Last Updated:\**\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})", line)
    if not m:
        return None
    try:
        return datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def latest_file(paths: list[Path]) -> Path | None:
    if not paths:
        return None

    def dated_name_key(path: Path) -> tuple[int, str]:
        name = path.name
        compact = re.search(r"(\d{8})-(\d{4})", name)
        if compact:
            return (2, f"{compact.group(1)}{compact.group(2)}")

        expanded = re.search(r"(\d{4})-(\d{2})-(\d{2})[-_](\d{2})-(\d{2})(?:-(\d{2}))?", name)
        if expanded:
            seconds = expanded.group(6) or "00"
            return (
                1,
                f"{expanded.group(1)}{expanded.group(2)}{expanded.group(3)}"
                f"{expanded.group(4)}{expanded.group(5)}{seconds}",
            )

        return (0, f"{int(path.stat().st_mtime_ns):020d}")

    return sorted(paths, key=dated_name_key, reverse=True)[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", help="Platform code override (default from current-session.json)")
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    info: list[str] = []

    project_status = REPO_ROOT / ".agents/PROJECT_STATUS.md"
    current_session = REPO_ROOT / ".agents/state/current-session.json"
    task_md = REPO_ROOT / ".agents/state/task.md"
    checkpoints_dir = REPO_ROOT / ".agents/state/checkpoints"

    required_files = [project_status, current_session, task_md]
    for p in required_files:
        if not p.exists():
            errors.append(f"Missing required file: {p.as_posix()}")

    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        return 1

    # Parse current session
    try:
        cs = load_json(current_session)
    except Exception as ex:  # noqa: BLE001
        print(f"ERROR: invalid JSON in {current_session.as_posix()}: {ex}")
        return 1

    platform = args.platform or cs.get("platform")
    if not platform or not isinstance(platform, str):
        errors.append("Unable to determine platform (missing --platform and current-session.platform).")
        platform = "unknown"

    cs_updated_raw = cs.get("last_updated")
    if not isinstance(cs_updated_raw, str):
        errors.append("current-session.json missing string field: last_updated")
        cs_updated = None
    else:
        cs_updated = parse_iso(cs_updated_raw)
        if not cs_updated:
            errors.append(f"current-session.json has invalid ISO timestamp: {cs_updated_raw}")

    # Latest handover for platform
    handover_pattern = f"handover-{platform}-*.json"
    handovers = list(checkpoints_dir.glob(handover_pattern))
    latest_handover = latest_file(handovers)
    if not latest_handover:
        errors.append(f"No handover file found for platform '{platform}' using pattern {handover_pattern}")
        handover_ts = None
    else:
        info.append(f"Latest handover: {latest_handover.as_posix()}")
        try:
            ho = load_json(latest_handover)
        except Exception as ex:  # noqa: BLE001
            errors.append(f"Invalid JSON in {latest_handover.as_posix()}: {ex}")
            ho = {}

        required_handover_keys = [
            "handoff_version",
            "platform",
            "agent",
            "timestamp",
            "status",
            "work_summary",
            "priority_actions",
            "context_for_next_agent",
        ]
        for k in required_handover_keys:
            if k not in ho:
                errors.append(f"Handover missing key '{k}' in {latest_handover.name}")

        ts = ho.get("timestamp")
        if not isinstance(ts, str):
            errors.append(f"Handover missing/invalid timestamp in {latest_handover.name}")
            handover_ts = None
        else:
            handover_ts = parse_iso(ts)
            if not handover_ts:
                errors.append(f"Handover has invalid ISO timestamp '{ts}' in {latest_handover.name}")

    # Latest session summary for platform
    summary_dir = REPO_ROOT / "project-log-md" / platform
    summaries = list(summary_dir.glob("session-summary-*.md")) if summary_dir.exists() else []
    latest_summary = latest_file(summaries)
    if not latest_summary:
        errors.append(f"No session summary found for platform '{platform}' at {summary_dir.as_posix()}")
    else:
        info.append(f"Latest summary: {latest_summary.as_posix()}")

    # Consistency checks
    if cs_updated and handover_ts and cs_updated < handover_ts:
        errors.append(
            "current-session.last_updated is older than latest handover timestamp "
            f"({cs_updated.isoformat()} < {handover_ts.isoformat()})"
        )

    # Basic task/project content checks
    task_text = task_md.read_text(encoding="utf-8")
    if "Overall Progress:" not in task_text:
        warnings.append("task.md does not contain 'Overall Progress:' marker.")

    ps_text = project_status.read_text(encoding="utf-8")
    ps_first_line = next((ln for ln in ps_text.splitlines() if "Last Updated:" in ln), "")
    ps_dt = parse_project_status_ts(ps_first_line)
    if ps_dt is None:
        warnings.append("PROJECT_STATUS.md Last Updated line not parseable.")
    elif cs_updated is not None:
        # Compare as naive local minute-level to catch obvious stale cases.
        cs_naive = cs_updated.replace(tzinfo=None)
        if ps_dt < (cs_naive - timedelta(minutes=5)):
            warnings.append(
                "PROJECT_STATUS.md Last Updated appears older than current-session.last_updated "
                f"({ps_dt} < {cs_naive})."
            )

    # Print report
    print("Handoff State Validation")
    print(f"- Platform: {platform}")
    for line in info:
        print(f"- {line}")

    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if errors:
        print("RESULT: FAIL")
        return 1

    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
