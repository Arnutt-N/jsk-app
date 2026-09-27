# PRD: Directed Handoff + Queue + Team Board (adopt hr-ims strengths)

- **Date:** 2026-09-27
- **Branch:** `feat/directed-handoff-board`
- **Status:** READY (self-reviewed)
- **Scope:** `.agents/` handoff system only. No backend/frontend changes.

## 1. Problem

jsk-app's handoff system (v2, checkpoint JSON + generated views) is broadcast-only:
a checkpoint is visible to everyone but addressed to no one. There is no way to
say "this is FOR agent X", no receive queue, and no single team overview.
hr-ims has all three (`HANDOFF_BOARD.md` + directed `<from>_to_<to>` logs + queue),
but implemented as hand-edited Markdown that drifts (proven: board stale vs logs,
ID drift `kilo` vs `kilo_code`, stale hard-coded paths).

## 2. Goal

Adopt hr-ims's three strengths — **directed handoff, receive queue, team board** —
onto jsk-app's source-of-truth architecture, keeping every derived artifact
generated (never hand-edited).

## 3. Non-goals

- Explicit ack/remove queue mechanics (v1 uses time-based auto-clear, §5).
- Hand-curated sprint tasks (v1 derives "current tasks" from latest checkpoints).
- Changing the checkpoint filename contract (`handover-<from>-<YYYYMMDD-HHMM>.json`).
- Bumping `handoff_version` (change is additive + backward compatible; stays `2.0`).
- Multi-recipient directed handoffs (one recipient or broadcast; use broadcast + name
  agents in `priority_actions` when several agents must see it).
- The "lightweight/markdown-only" aspect of hr-ims (contradicts jsk-app's direction).

## 4. Users & stories

- **Sending agent:** `node handoff-new.cjs <me> "<summary>" --to <agent>` addresses
  the handoff; the recipient sees it in their queue.
- **Receiving agent:** pickup starts at `HANDOFF_BOARD.md` → Handoff Queue section →
  sees pending items addressed to them, newest first.
- **Anyone:** board shows per-agent status, pending queues, blocked items, recent
  activity — one file, always in sync (generated).

## 5. Requirements

### R1 — Directed handoff (optional checkpoint field `to_agent`)
- `handoff-new.cjs` accepts `--to <platform|all>` (both `--to x` and `--to=x` forms,
  same parser style as `--model`/`--provider`).
- Value canonicalized via existing CANON map; `all` passes through; anything not
  matching `^[a-z0-9_]+$` after canonicalization is rejected (exit 1, no writes) —
  same path-safety posture as the platform guard (the value is not a path today,
  but must never become an injection vector later).
- Written as `"to_agent"` in the checkpoint JSON only when the flag is passed.
  Absent/empty/`"all"` = broadcast (current behavior, renders no queue entry).
  `"any"` is accepted as a legacy alias and normalized to `"all"` at write time;
  legacy checkpoints already containing `"any"` (or a non-string) render as
  broadcast when read.
- Session-summary stub gains a `**To**: <agent>` line when directed (broadcast stubs
  unchanged).

### R2 — Queue semantics (derived, zero new state)
- Pending queue for agent X = checkpoints with `to_agent == X` whose filename
  timestamp is NEWER than X's newest checkpoint filename timestamp.
- Rationale: pickup rules require reading newest state, so an X checkpoint newer
  than the directed handoff proves X has cycled since. No ack bookkeeping needed.
- Edge cases: X has no checkpoint yet → all directed-to-X are pending.
  `to_agent: "all"`/missing → broadcast, never queued. Unparseable JSON →
  filename still yields from/when; `to` unknown → treated as broadcast.

### R3 — Generated team board (`.agents/state/HANDOFF_BOARD.md`)
- Emitted by `gen-handoff-views.cjs` alongside TASK_LOG/SESSION_INDEX. Same GENERATED
  banner. Never hand-edit (edits overwritten; fix the checkpoint, re-run).
- Sections (mirroring hr-ims board, all derived):
  1. Header: last-generated stamp (newest checkpoint), active/archived counts.
  2. **Agent Status** table: platform | status (newest checkpoint status mapped:
     completed→AVAILABLE, in_progress→IN_PROGRESS, blocked→BLOCKED, else raw) |
     last active | queued (count) | last task (one-liner, truncated) | summary link.
  3. **Handoff Queue**: per-recipient pending items (R2): from → to, one-liner,
     checkpoint link, date. Empty state: explicit "queue empty" line.
  4. **Needs attention**: newest ≤10 checkpoints with `status: blocked`
     (hr-ims "Issues" equivalent, derived — no schema change).
  5. **Recent Activity**: newest 10 checkpoints across platforms (when, from→to,
     one-liner, checkpoint link).
- TASK_LOG entry body gains `- To: <agent> (directed)` line when directed.
  Headings (`### WHEN — platform — status`) UNCHANGED (pickup doc greps/parses them).

### R4 — Validator warnings (fail-open, warnings only)
- **W4**: newest handover's `to_agent` present but not a known canonical code or
  `all`, AND the target has no `project-log-md/<to>/` dir and no
  `handover-<to>-*` checkpoint → warning (unknown target; typo guard.
  Established custom platforms stay silent).
- **W5**: any pending queue item (R2 rule) older than 7 days → one warning with count
  + oldest date (stale directed work detector).
- PASS/FAIL semantics unchanged (warnings never fail).

### R5 — Docs
- `handoff-to-any.md`: `--to` FAST PATH example; `to_agent` in schema + optional-keys
  list; board added to architecture diagram + generated-files rule; pickup steps
  check board queue first.
- `pickup-from-any.md`: RECEIVE step — check `HANDOFF_BOARD.md` queue for your
  platform before starting; rule list updated.
- `QUICK_START_CARD.md`: one line pointing at the board for incoming work.
- `agent_handover` + `agent_pickup` SKILL.md: minimal sync (read order, `--to`
  example, schema `to_agent`, never-hand-edit list) — they duplicate mechanics.
- `cross_platform_collaboration` SKILL.md: no change (already defers mechanics to
  `handoff-to-any.md`; its v1 `to_platform` example is conceptually aligned).

### R6 — Tests
- Extend `.agents/scripts/test-handoff-system.sh` (sandboxed, never touches real
  state): `--to` canonicalization/accept/reject cases, board generation, queue
  present → cleared-after-recipient-checkpoint lifecycle.
- Manual: run validator on sandbox fixtures (W4/W5 fire) + on the real tree
  (must stay PASS, no new warnings from 264 legacy checkpoints).

## 6. Compatibility

- 264 existing checkpoints have no `to_agent` → all broadcast → board queue starts
  empty, no warnings from legacy data (W4 only fires on present-but-unknown).
- `handoff_version` stays `2.0`. Filename contract untouched. Consumers of
  TASK_LOG headings / SESSION_INDEX tables unaffected (no format change there).

## 7. Success criteria

1. `--to` happy path + canonicalization + rejection cases pass in the golden suite.
2. Board generates from real 264 checkpoints with correct agent rows, empty queue,
   no crash on the 1 unparseable + legacy schemas.
3. Validator on real tree: PASS with zero NEW warnings vs pre-change baseline.
4. Docs reviewed: no `to_agent`/board contradiction across the 3 touched docs.
