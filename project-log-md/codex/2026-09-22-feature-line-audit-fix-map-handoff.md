# Session Handoff — feature-line-audit-fix-map

## Agent and timestamp

- Agent: Codex (GPT-5)
- Timestamp: 2026-09-22 10:00:29 ICT (Asia/Bangkok, UTC+07:00)
- Workspace: `D:\genAI\jsk-app`
- Branch context: `feat/feature-line-audit-fix-map` (verify with read-only `git status`/`git branch` before continuing)
- Handoff destination: `project-log-md/codex`

## User objective

Prepare and validate the PRP implementation plan for the LINE/LIFF/LiveChat/media/settings audit remediation. Do not implement application code until the plan validation gate is READY.

## Completed

1. Read the repository instructions in `AGENTS.md` and followed the project requirement to use Graft context before source exploration.
2. Used the `prp-validate-plan` review workflow across successive rounds. The plan and its historical review artifacts are referenced below; do not duplicate their full contents here.
3. Revised the implementation plan after earlier reviews at:
   - `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
4. Revised the source PRD to make the current LIFF route inventory explicit:
   - `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
   - Current `liff.py` inventory is three POST routes; there is no current LIFF GET/PATCH target. Future GET/PATCH routes must add their own rate-limit / `None -> 422` contract tests before the inventory expectation is updated.
5. Earlier D7 plan corrections include:
   - resize ticket type `image_resize_ticket`, distinct from the normal `access` cookie token;
   - upload-side type/purpose/subject/expiry/nonce checks;
   - JPEG/PNG-only resize upload contract, CSRF transport coverage, Redis tri-state handling, audit events, Thai error expectations;
   - actual frontend symbols `installAdminAuthFetchInterceptor` and `setCsrfToken`, replacing the nonexistent `authFetch` export;
   - a real-cookie/CSRF test setup outline, valid PNG construction, replay/Redis/PDF/audit cases, and cleanup requirements.
6. Round-5 validation was run with two independent isolated reviewers. The new report is:
   - `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round5-2026-09-21.md`
   - Result: `NOT READY`, confidence `1/10`.
7. Read-only source checks verified the key evidence used in round 5, including:
   - `backend/app/services/credential_service.py:74-82` — credentials are JSON-serialized before Fernet encryption and JSON-decoded after decryption;
   - `backend/app/core/security.py:65-68` — access-token helper and additional claims;
   - `backend/app/core/permissions.py:61,123` — image-resize permission;
   - `frontend/lib/authFetch.ts:156-179` and `frontend/contexts/AuthContext.tsx:119` — the existing global fetch interceptor;
   - `frontend/package.json:7-14` — unit/lint/build scripts.
8. Static checks performed after the latest document edits:
   - `git diff --check` reported no whitespace error for the changed plan/PRD (Git warned that the PRD working copy has CRLF normalization if Git touches it);
   - the Python test snippet embedded in the plan was parsed successfully with `ast.parse` after extraction;
   - no full backend/frontend test suite was run.

## Current validation outcome

Round 5 found these blocking areas:

- **B2 secrets migration:** the plan encrypts a bare string while the existing credential service expects a JSON object; downgrade deletes credentials by name and can remove pre-existing rows; the deny-list has eight names but the migration covers six; the persistent backup table retains plaintext without a complete safe-disposition contract.
- **C1 analytics:** the PRD asks for a consolidated dashboard query, while the plan explicitly accepts at least eleven database statements and only proves cache reuse.
- **C2 broadcast:** the PRD asks for a user-visible preview button and failed-token handling, while the plan lists backend files only and does not define the recovery record/cleanup behavior.
- Additional important D7 follow-up: ensure the new static ticket route is registered before the dynamic `/admin/media/{media_id}` route, and make the pre-implementation Redis monkeypatch target explicit because the current `media.py` does not yet expose `redis_client` until Step 3 adds it.

## Pending work

1. Re-plan/fix B2 with a source-faithful credential payload contract:
   - map every sensitive key deliberately, including `ENCRYPTION_KEY` and `LINE_ID_HMAC_KEY`; do not encrypt a root key with itself or silently leave it in `SystemSetting`;
   - specify where any migration backup lives, how it is protected/time-bounded, and when it is removed; do not leave plaintext in an indefinite database table;
   - record migration-created credential IDs or an equivalent migration marker so downgrade removes only rows created by this migration;
   - preserve pre-existing credentials and test that normal `CredentialService` retrieval returns dictionaries;
   - add executable upgrade/downgrade/upgrade and backup cleanup assertions.
2. Re-plan/fix C1:
   - either implement the PRD's true consolidated query and measurable query-budget test, or record an explicit PRD/acceptance decision that changes that requirement;
   - retain cache-hit, empty percentile, and Redis-down tests.
3. Re-plan/fix C2:
   - inspect the actual broadcast admin UI path and add it to `Files`;
   - define the preview button flow, response shape, no-persist/no-provider-call assertions, and frontend test;
   - define bounded retry plus failed-token persistence/recovery and test retry exhaustion/timezone behavior.
4. Fix the D7 route-order and red-test setup details noted above.
5. Re-run `prp-validate-plan` after revisions. For the next gate, consider supplying the round-5 report as `--findings` so every accepted finding must map to a task with root cause, fix, test, and regression risk.
6. Only after a dual-review READY result should implementation begin. Then follow the plan's Wave ordering and test after each task; do not assume the older memory entry saying the plan was READY reflects the current working tree.

## Important file/artifact references

- Plan: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
- Source PRD: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
- Latest validation: `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round5-2026-09-21.md`
- Historical validation reports: `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review.md`, `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round4.md`, and the dated round-4 report in the same directory
- Project workflow instructions: `AGENTS.md`

## Worktree safety

Existing dirty and untracked work belongs to the user. Preserve it. Before editing, run read-only status/diff checks and isolate only the plan/PRD/review artifacts intended for this task. Do not reset, checkout, delete, or stage unrelated files. No application-code implementation, commit, push, PR, or merge has been completed in this session.

## Suggested skills for the next session

- `prp-validate-plan` — validate the revised plan, preferably with the round-5 report supplied as findings.
- `karpathy-guidelines` — keep B2/C1/C2 revisions surgical and evidence-led.
- `graft` — re-query the exact credential, analytics, broadcast UI, and media route symbols before editing the plan.
- `executing-plans` — only after the plan reaches READY and implementation is explicitly authorized.
- `git-workflow` — only for the later branch/commit/push/PR phase required by the project instructions.

## Pickup instruction

Start by inspecting the latest round-5 report and the current B2/C1/C2 sections of the plan against the live source files. Resolve the three blocking root causes above, update the plan/PRD consistently, preserve all unrelated WIP, and run the next dual validation gate before writing application code.
