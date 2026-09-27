# PRP: Directed Handoff + Queue + Team Board

- **Date:** 2026-09-27
- **Branch:** `feat/directed-handoff-board` (from `main` @ `f0fb89b`)
- **PRD:** `PRPs/2026-09-27-directed-handoff-board.prd.md`
- **Commits (planned split, 2 commits / 1 PR):**
  1. `docs(prp): directed-handoff-board PRD + plan` — this file + PRD only.
  2. `feat(handoff): directed handoff (--to) + generated queue + team board` —
     scripts + validator + tests + workflow docs + generated `HANDOFF_BOARD.md`.

## Phase 0 — Baseline (no tracked changes)

1. `bash .agents/scripts/test-handoff-system.sh` → record PASS count (expect all green).
   - Shell note: run under Git-Bash (WSL bash has no node in PATH on this machine).
2. `python .agents/scripts/validate_handoff_state.py` → record baseline warnings
   (expect PASS; warnings tolerated, must not grow in Phase 5).
3. `git status --short` → expect clean except pre-existing untracked `.zcode/`.

## Phase 1 — `handoff-new.cjs`: `--to` flag (PRD R1)

Reuse the existing `--model`/`--provider` parser block style.

1. Parse `--to <v>` and `--to=<v>` into `toAgentRaw`; empty value → stderr + exit 1
   (same as dangling `--model`); strip from positionals so summary/next-steps
   positions stay stable.
2. Canonicalize: `CANON[raw] ?? raw.toLowerCase().replace(/-/g,'_')`; `all`
   passes through (broadcast marker, still written to JSON so intent is explicit).
3. Guard: must match `^[a-z0-9_]+$` else stderr + exit 1 with no writes
   (mirror the platform path-safety guard; value is JSON-only today).
4. `if (toAgent) checkpoint.to_agent = toAgent;` next to the model/provider block.
5. Summary stub: when directed, add ``**To**: `<agent>`` line after the
   Branch/HEAD line. Broadcast stubs byte-identical to before.
6. Update the header usage comment (usage + one `--to` example).

Validation: `node .agents/scripts/handoff-new.cjs --help`-style arg errors still
exit 1 (covered by golden suite); no real-tree run (creates checkpoints — sandbox only).

## Phase 2 — `gen-handoff-views.cjs`: board + queue (PRD R2, R3)

Filename-first contract preserved: from/when from filename; `to_agent` best-effort
from JSON (`readJson` already returns null on corrupt → treated as broadcast).

1. Entry: add `to` = canonicalized `j.to_agent` (string, else `''`); treat
   `''`/`'all'` as broadcast in all queue logic.
2. Per-platform newest: map platform → max sortKey (already have `entries`
   sorted newest-first; first occurrence per platform wins).
3. Pending queue for X: entries with `to === X` and `sortKey > newestSortKey[X]`.
   (X with no checkpoint → `newestSortKey` undefined → all directed-to-X pending.)
4. Emit `.agents/state/HANDOFF_BOARD.md` (same GENERATED banner):
   - H1 + `> **Last generated**: <stamp> (from newest checkpoint)` + counts line
     (active/archived/platforms — reuse computed numbers).
   - `## Agent Status` table: `| Platform | Status | Last active | Queued | Last task | Summary |`
     Status map: completed→`AVAILABLE`, in_progress→`IN_PROGRESS`,
     blocked→`BLOCKED`, else raw value. Last task = one-line `summary` sliced to
     120 chars (strip newlines). Summary = `findSummary()` link or `—`.
   - `## Handoff Queue`: grouped by recipient (`### <platform> (N pending)`),
     rows `| Date | From | Task | Checkpoint |`. Zero pending everywhere →
     single line `_Queue empty — no pending directed handoffs._`
   - `## Needs attention`: newest ≤10 entries with `status === 'blocked'`
     (same row shape + `| … |` overflow marker style as SESSION_INDEX when >10).
     Zero → `_None — no blocked checkpoints._`
   - `## Recent Activity`: newest 10 entries, all platforms:
     `| When | From → To | Task | Checkpoint |` (To = `to` or `all`).
5. TASK_LOG body: after the `- Checkpoint:` line push
   ``- To: `<to>` (directed)`` when directed. Headings untouched.
6. Stdout message: mention `HANDOFF_BOARD.md` in the generated list.

Validation: run generator on the REAL tree — `git diff` must show ONLY the new
`HANDOFF_BOARD.md` (plus zero diff in TASK_LOG/SESSION_INDEX, proving no legacy
checkpoint renders differently). Revert nothing; the board is a committed artifact.

## Phase 3 — `validate_handoff_state.py`: W4 + W5 (PRD R4)

Warnings only; PASS/FAIL semantics untouched; wrap new scans so unexpected data
warns instead of crashing (validator must never crash on 264 heterogeneous files).

1. `KNOWN_PLATFORMS` frozenset mirroring the JS CANON canonical values
   (`claude_code codex kimi_code kilo_code cline antigravity gemini_cli open_code
   qwen qoder zcode`) plus `all`.
2. W4 (newest handover for `--platform`, inside the existing `else` block where
   `ho` is available): if `to_agent` is a non-empty string, canonicalize
   (`lower().replace('-','_')`) and warn when it is not in KNOWN_PLATFORMS AND has
   no `project-log-md/<to>/` dir AND no `handover-<to>-*.json` checkpoint
   (established custom platforms stay silent; likely typos warn).
3. W5 (all-checkpoints scan, after W2): parse filename timestamps via
   `handover-(.+)-(\d{8})-(\d{4})\.json`; per-platform newest sortKey; pending =
   directed entries newer than recipient newest (same rule as Phase 2; JSON read
   best-effort, unparseable → broadcast). If any pending item is >7 days older
   than now (local naive compare, consistent with the W2/PROJECT_STATUS style):
   single warning `N pending directed handoff(s), oldest <date> (<from> → <to>)`.
4. Keep the report format (`WARNING: …` lines before RESULT).

Validation: sandbox fixtures (crafted checkpoints: unknown `to_agent`, stale
pending item) must fire W4/W5; real tree must stay PASS with no NEW warnings.

## Phase 4 — Docs (PRD R5)

1. `handoff-to-any.md`:
   - FAST PATH: `--to` example line.
   - "That single command does everything" step 4 → views list gains the board.
   - Architecture diagram: add `HANDOFF_BOARD.md` generated branch.
   - Generated-files rule paragraph: name all three views.
   - Checkpoint schema: `"to_agent": "cline", // OPTIONAL — directed recipient…`
     + optional-keys list gains `to_agent` (absent/`"all"` = broadcast).
   - Picking-up steps: step 1 becomes board queue check, then TASK_LOG.
2. `pickup-from-any.md`: RECEIVE step — check `HANDOFF_BOARD.md` Handoff Queue for
   your platform; rule list: queue checked before coding.
3. `QUICK_START_CARD.md`: one line under the handoff command — incoming work lives
   on the board queue.
4. `cross_platform_collaboration` SKILL.md: NO change (defers to handoff-to-any.md).

Validation: grep the three docs for `to_agent`/`HANDOFF_BOARD` — consistent naming,
no leftover "broadcast-only" claim; contradiction re-check vs PR #233 rules
(no hand-edit instructions for generated views).

## Phase 5 — Tests (PRD R6)

Extend `.agents/scripts/test-handoff-system.sh` (sandboxed; numbering continues):

- T18 `--to` canonicalization: `--to Claude-Code` → `"to_agent": "claude_code"`.
- T19 broadcast default: no flag → no `to_agent` key; `--to all` → `"all"`.
- T20 rejection: `--to ../../evil`, `--to ""`, dangling `--to` → exit 1, no files.
- T21 board queue: directed `qoder → cline` checkpoint → regen →
  `HANDOFF_BOARD.md` contains queue entry under cline section.
- T22 auto-clear: newer cline checkpoint → regen → queue empty line present.
- T23 board sections: status table + Needs-attention empty line + Recent Activity
  render (grep markers).
- Validator W4/W5: no harness (repo has none for the validator) — verify manually
  in a /tmp sandbox + on the real tree; paste outputs in the PR body.

Phase-gate: full suite green + validator PASS on real tree + `git diff --stat`
shows only intended files.

## Phase 6 — Review → commit → push → PR

1. Self-review diff (stale-pattern grep: `TASK_LOG.md.*hand`, manual board-edit
   instructions, `Task #`); re-read the three docs once.
2. Read `git_workflow` project skill; commit per the planned 2-commit split;
   push branch; open PR with `gh` (body: what/why, validation evidence, W4/W5
   sample outputs). STOP before merge — merge is the user's call.

## Risks

- Node/Python absent on agent machines → both scripts already fail-open; board
  simply regenerates next run. No new hard dependency.
- Custom platforms + W4 → mitigated by the established-presence exemption (Phase 3.2).
- Minute-collision on rapid `--to` tests in suite → reuse the T07 retry-loop pattern
  if a new test writes two same-platform checkpoints (T21/T22 use distinct minutes
  via pre-created files where needed).
