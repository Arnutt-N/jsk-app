# Session Summary — claude_code — 2026-08-02T00:39:00+07:00

**Branch**: `main`  **HEAD**: `c4837e7`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260802-0039.json`

## Objective
Full Stocktake of every installed Claude skill, requested after the live-chat
fix shipped. Continues `session-summary-20260801-2026.md` (root cause),
`-2118.md` (code review) and `-2138.md` (PR #182, now merged as `c4837e7`).

## Method
`skill-stocktake` skill, Full mode. 282 skills (243 global + 39 project) split
into 12 subagent batches; every batch read the real `SKILL.md` files rather than
judging by name. The project batches were additionally told to **verify each
claim against the actual source** under `backend/` and `frontend/`, using the
known-stale `skn-rich-menu-builder` "no auth" bug as the worked example of the
failure mode being hunted.

**Blocker worked around:** `skill-stocktake`'s own scripts (`scan.sh`,
`quick-diff.sh`, `save-results.sh`) require `jq`, which is absent from both Git
Bash and WSL on this host. The inventory and `results.json` were produced by
hand. Until that is fixed, the cheap Quick Scan path cannot run here.

## Headline finding — 17 of 39 project skills are factually wrong

The recurring pattern: a skill recorded a "GAP: X is not done yet" when it was
written, someone later fixed X, and the skill was never updated. That is worse
than vagueness — an agent trusting the skill will re-fix solved problems or
reintroduce abandoned patterns.

**False "no auth" claims (security-relevant):**
- `skn-liff-data` rule #1 — says `media.py` has no authentication; it has ~13
  protected routes (`media.py:135,171,210,…,456`).
- `skn-operator-tools` GAP-3 — says all `admin_friends.py` routes are
  unauthenticated; all four carry `Depends(get_current_admin)` (`:27,69,92,102`).
- `skn-reply-auto` — says both reply endpoints have no auth; both use
  `get_current_admin` + `require_permission`. Three of its four "known gaps" are
  also already closed.

**Gaps closed long ago but still documented as open:**
`skn-backend-infra` (`admin_friends` IS registered, `api.py:27,54`),
`skn-settings-config` (`admin_credentials` IS registered, `api.py:26,53`),
`skn-user-management` (user CRUD endpoints DO exist, `admin_users.py:320,385,497,557`),
`skn-service-request` (the LIFF fields ARE in schema + model),
`skn-core-runtime` (handoff-keyword TODO already implemented),
`skn-analytics-audit` (N+1 already batched), `skn-admin-requests`.

**Drifted architecture / facts:**
`skn-webhook-handler` (logic moved to `services/message_intake/*`; steps 2/3/6
point at the wrong file), `skn-devtools` (documents ~30 backend-root scripts that
do not exist; says 17 test files, there are 78), `skn-data-models` (18 models
claimed, 29 real), `skn-api-patterns` + `skn-auth-security` (both miss
`require_permission`, used 73 times across 14 files; the latter also calls a
non-existent `syncAdminAuthToken`), `skn-analytics-frontend` (shows `authHeaders`
code that does not exist), `tailwind-design-system` (teaches Tailwind v3 on a v4
repo).

## Global-side findings
- **Stale model IDs (4):** `claude-api`, `cost-aware-llm-pipeline`,
  `prompt-optimizer`, `security-scan` cite Opus 4.1 / Sonnet 4.0 / "Sonnet 4.6" /
  "Opus 4.6" — none exist in the Claude 5 family.
- **Retire (7):** `energy-procurement`, `carrier-relationship-management`,
  `project-guidelines-example`, `design-taste-frontend-v1`, `ecc-tools-cost-audit`,
  `enterprise-agent-ops`, `implement`.
- **Merge (10):** notably a *circular deprecation* — `autonomous-loops` (610
  lines) says it is superseded by `continuous-agent-loop`, which is a 45-line stub
  routing to four skills that do not exist. Also `frontend-design` colliding
  across four locations, `tdd-workflow`→`tdd`, `gpt-taste`→`high-end-visual-design`.
- `frontend-patterns` teaches unconditional `useMemo`/`useCallback`/`memo`, which
  is wrong for this repo specifically — JskApp runs the React Compiler eslint rules.
- `MEMORY.md` is 28 lines, well under the 100-line compression threshold.

## Totals
Keep 219 · Improve 26 · Update 20 · Retire 7 · Merge 10 = 282.

## Artifacts
- `project-log-md/claude_code/skills/skill-stocktake-20260802.md` — full report,
  every claim carrying the real `file:line` that proves or disproves it.
- `~/.claude/skills/skill-stocktake/results.json` — verdict cache (full reasons
  for the 63 actionable verdicts).

**No skill file was modified.** `skill-stocktake` Phase 4 requires explicit user
confirmation before any retire, merge, or edit.

## Next Steps
- Awaiting user go-ahead on the fix order: (1) correct the 17 stale `skn-*`
  skills, starting with the three false no-auth claims, (2) make `skill-stocktake`
  work without `jq`, (3) fix the 4 stale model IDs, (4) retire 7 + merge 10.
- Deploy backend to Koyeb for the `get_conversation_detail` `last_message`
  contract (PR #182 merged; the frontend half is already live on Vercel).
- Verify the live-chat fix on prod: click the top 3 conversations — rows keep
  position, pinned rows stay pinned, arrow keys work right after a click.

## Recommendation to stop the rot recurring
Nothing currently binds a `skn-*` skill to the code it describes. Worth adopting:
date-stamp every "GAP" claim and re-verify past a threshold; stop citing line
numbers in prose (they have now drifted twice in `skn-rich-menu-builder`) in
favour of function and file names; and re-run a scan after any PR that moves
backend endpoints or files.

## Blockers
- `skill-stocktake`'s scripts need `jq`, unavailable on this host.
