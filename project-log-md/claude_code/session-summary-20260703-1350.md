# Session Summary — claude_code — 2026-07-03T13:50:00+07:00

**Branch**: `main`  **HEAD**: `733c09f` (+ handoff commit)
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260703-1350.json`

## Objective
Continuation after the user manually tested #120 on the prod LINE OA and
reported two bugs: (1) modal inputs accept only one character per click,
(2) the bot never replies to STARTS_WITH / REGEX intents (exact-text works).

## Completed

### Bug 1 — modals steal input focus on every keystroke (FIXED, shipped 733c09f)
Root cause: the focus capture/restore `useEffect` in `Modal.tsx`,
`TransferDialog.tsx`, and `MobileDrawer.tsx` listed the `onClose` callback in
its deps (directly, or via a `handleKeyDown` that closed over it). The
create-category page passes `onClose={() => setShowAddForm(false)}` — a new
inline identity every render. Typing one character re-renders the parent →
new `onClose` → the focus effect re-runs → its cleanup fires
`previouslyFocused.focus()` and yanks focus out of the field. Symptom matches
exactly: "one character, must re-click". **Live since PR #112 (2026-06-29)** —
not introduced this session; my #121 Modal `useId` edit was unrelated.
Fix: split each into two effects — focus capture/restore keyed on the
open flag ONLY, and a separate keydown (Escape + Tab-trap) effect that may
still depend on `onClose` (re-attaching a listener is harmless). Audited the
other focus-managing components: `CannedResponsePicker` and `ConfirmDialog`
were already correct (keydown-only effect, no focus steal). Added
`Modal.focus.test.tsx` (re-render keeps focus; close still restores it) and a
tsc-clean cast in the reply-objects integration test. Validation (WSL):
tsc 0 errors, vitest 93/93. Frontend auto-deploys via Vercel.

### Bug 2 — bot silent on STARTS_WITH/REGEX = stale prod backend (FIXED via deploy)
Diagnosis was NOT the first hypothesis. Initially suspected "backend frozen at
2026-06-16 (last successful CD run)", but a live HTTP probe disproved it:
`/admin/reply-objects` returns 401 on prod (route exists) → prod code is
≥ 2026-06-20. The #120 change only edited `webhook.py` (no new route), so HTTP
probing couldn't confirm the July-3 version. Resolved it by reading the **prod
DB directly (read-only)**: the user's intents were configured **correctly** —
`kw#175 'ทดสอบ120'` (STARTS_WITH) and `kw#176 '^เรื่องที่\d+'` (REGEX) both on
category `'ทดสอบ'` (cat#101, active) with 2 active responses each; enum has
`STARTS_WITH`; DB at `v2w3x4y5z6a7`. Local test already proved this exact data
+ #120 code → matches. So data is right, code is missing = **prod backend
lacked #120**. Backend deploys **only via `cd.yml`** (confirmed in
docs/GITHUB_ACTIONS_CD_VERCEL_KOYEB_TH.md), which was disabled 2026-06-20 →
Koyeb drifted behind main. Prior handoff's "pushed → Koyeb auto-deploys" was
WRONG. Fix (user approved "enable CD permanently + deploy now"): re-enabled CD,
dispatched `gh workflow run cd.yml -f environment=production -f target=backend
-f backend_skip_build=false` (run 28643492923) — all jobs success: prod
migration (no-op, already at head), Koyeb rebuild from latest main, backend
smoke. #120 is now live on prod.

## Next Steps
- **User: final LINE re-test** (data already in place) — message the prod OA
  `ทดสอบ120 ขอข้อมูล` (expect STARTS_WITH reply) and `เรื่องที่42` (expect the
  REGEX `^เรื่องที่\d+` reply). Should reply now. Then delete the test category
  `ทดสอบ` (cat#101) from admin.
- CD now stays **enabled** — pushes to main auto-deploy backend again (public
  repo = free Actions). Prior sessions must stop assuming a bare push ships the
  backend without CD.
- Deploy-arch memory corrected ([[project_deploy_architecture]]): backend =
  Koyeb via cd.yml ONLY; manual deploy command + Koyeb URL recorded.

## Blockers
- _none_ (Docker Desktop still needs an elevated `com.docker.service` start for
  local docker DB; WSL PG16 fallback remains installed but stopped.)

> TASK_LOG.md + SESSION_INDEX.md are generated — do not hand-edit.
