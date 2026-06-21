---
description: Universal handoff workflow for any AI coding platform
---

# Workflow: Universal Handoff (Any Platform → Any Platform)

## Purpose
Guarantee clean cross-platform continuity with no stale state drift, using a single
source of truth (the checkpoint JSON) plus generated views.

---

## ✅ FAST PATH — one command (preferred)

```bash
node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
# example:
node .agents/scripts/handoff-new.cjs claude_code "Merged PR #114: rich-menu R1/R2" "Smoke test on prod"
```

That single command does **everything**:
1. Writes the **checkpoint JSON** (source of truth) + a **session-summary** stub.
2. Syncs `current-session.json` (prepends `handoff_history`, refreshes `last_updated`).
3. Refreshes `PROJECT_STATUS.md` — only the `Last Updated` line and one prepended
   `Recent Completions` entry (curated sections are left intact — keep those current by hand).
4. Regenerates `TASK_LOG.md` + `SESSION_INDEX.md` via `gen-handoff-views.cjs`.
5. Runs `validate_handoff_state.py` automatically and prints PASS / FAIL / skipped.

Then you only:
- **Flesh out** the generated `project-log-md/<platform>/session-summary-*.md`.
- **`git add` + commit** the artifacts, and push.

A Stop hook (`handoff-stop-check.cjs`) blocks session end until a fresh checkpoint
exists and the tree is clean, so this can't be silently skipped.

### Architecture
```
.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json  ← SOURCE OF TRUTH (one/session)
        └─ gen-handoff-views.cjs ─┬─→ .agents/state/TASK_LOG.md      ← GENERATED (do not hand-edit)
                                  └─→ .agents/state/SESSION_INDEX.md  ← GENERATED (do not hand-edit)
project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md          ← human narrative (linked)
```

> **⛔ Never hand-edit `TASK_LOG.md` or `SESSION_INDEX.md`.** They are regenerated from
> checkpoints and your edits will be overwritten. To change them: edit (or add) a
> checkpoint JSON, then run `node .agents/scripts/gen-handoff-views.cjs`.

Use canonical `lowercase_underscore` platform names: `claude_code`, `codex`,
`kimi_code`, `antigravity`, `gemini_cli`, `cline`, `kilo_code`, `open_code`, `qwen`.
The generator normalizes variants (e.g. `codeX` → `codex`).

---

## Checkpoint schema (what `handoff-new.cjs` writes)

```jsonc
{
  "handoff_version": "2.0",
  "platform": "claude_code",       // canonical name
  "agent": "claude_code",          // or $AGENT_NAME
  "timestamp": "2026-06-21T19:06:00+07:00",  // local wall-clock WITH real UTC offset — never "Z"
  "branch": "main",
  "head_commit": "3a90f4d",
  "status": "completed",           // completed | in_progress | blocked
  "work_summary": "…",             // one-paragraph what-happened
  "priority_actions": ["…"],       // next steps for the next agent
  "context_for_next_agent": "",     // optional free-text gotchas
  "session_summary": "project-log-md/<platform>/session-summary-<ts>.md",
  "cross_platform_read": []         // optional: summaries from other platforms you relied on
}
```

**Required keys** (enforced by `validate_handoff_state.py`):
`handoff_version`, `platform`, `agent`, `timestamp`, `status`, `work_summary`,
`priority_actions`, `context_for_next_agent`.

`cross_platform_read` is **optional** — fill it only when work from another platform
actually informed this session. Don't ceremonially pad it.

---

## Manual fallback (only if Node is unavailable)

The FAST PATH is strongly preferred. If you must author by hand, you only need **two**
real files — the rest are generated:

1. `git rev-parse --show-toplevel` → use this as `PROJECT_ROOT` for all paths (avoid
   creating artifacts in the wrong directory; never trust the relative CWD).
2. Create `.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json` with the
   schema above (timestamp = local time **with offset**, not `Z`).
3. Create `project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md` (narrative).
4. Run `node .agents/scripts/gen-handoff-views.cjs` to rebuild the views.
   *(If Node is truly absent, leave `TASK_LOG.md`/`SESSION_INDEX.md` alone — they will be
   regenerated next time someone runs the generator. Do NOT hand-edit them.)*
5. Verify: `python .agents/scripts/validate_handoff_state.py`

---

## Verification

```bash
python .agents/scripts/validate_handoff_state.py            # PASS / FAIL
# (handoff-new.cjs already runs this for you; run manually after a hand-edit)
```

The validator checks that required files exist, the checkpoint has all required keys
with a parseable ISO timestamp, and `current-session.last_updated` is not older than
the newest checkpoint.

---

## Picking up (next agent)
1. Read `.agents/state/TASK_LOG.md` (top few entries — newest first).
2. Skim `.agents/state/SESSION_INDEX.md` for cross-platform context.
3. Open the latest `project-log-md/<platform>/session-summary-*.md` for detail.
4. Follow `.agents/workflows/pickup-from-any.md`.

---

## Notes
- Never rely on chat memory alone; file state is the source of truth.
- Do not claim completion for plan steps without matching code/test evidence.
- The checkpoint JSON is the record; the session-summary is the story. Keep both honest.
