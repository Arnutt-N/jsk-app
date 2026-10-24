# Independent review — poteto style — fix/audit-f1f4-ecc

Reviewer did not write the code. Branch verified as `fix/audit-f1f4-ecc`, read-only
worktree `D:\genAI\jsk-app\.worktrees\audit-fix-ecc`, base `6f6bbf6`, 4 commits.
Nothing edited in the worktree. IRON RULE honored: no secret values below
(keys referenced by presence only, counts only).

Principles applied (leaf skills read this session): prove-it-works (every
verification below was run by the reviewer from the review worktree, not taken
from the lane trail); fix-root-causes (F2 judged on reproduction plus a
state-vs-code trace, not on the failure text alone); laziness-protocol (F1/F2/F3
judged as smallest-justified-change questions); minimize-reader-load (F4 dep
and memo edits judged by whether they remove misleading state for the reader).

## F1 — monkeypatch DEV_AUTH_BYPASS — APPROVE

`backend/tests/test_health_hardening.py:8-14`. The gate reads
`settings.DEV_AUTH_BYPASS` at request time (`app/api/deps.py:61`, inside the
dependency function, not at import), so `monkeypatch.setattr` on the singleton
pins the precondition and auto-undoes after the test. Test-only change, no
`.env` created or modified (both absent in the checkout, confirmed by `ls`).
Measured: `pytest tests/test_health_hardening.py` → 2 passed with the flag
unset, and 2 passed with `DEV_AUTH_BYPASS=true` exported. Behavioral assertion
intact in both states.

## F2 — docs-only stale-DB note — APPROVE

`backend/tests/test_inbox_distinct_on.py:1-14` (docstring only, zero code
change). Evidence supports stale-data over code: the node fails on the
persistent DB with `cryptography.fernet.InvalidToken` (measured: 1 failed, 1
passed — the mock-based SQL test passes, so the query code is fine), and a
reviewer-run count-only probe of `users.line_user_id_encrypted` under the
committed pytest dummy key gives 8 token rows, 4 decryptable, 4 stale
(ids 1, 2, 3, 8), matching the lane's probe exactly. No token material read
or printed. The fail-loud decrypt contract (`conversations.py` →
`user_identity_service.py:71-72`) is deliberate, so a docs-only change is the
smallest justified change per laziness-protocol. Note states the hazard and
the reset procedure and forbids deleting shared dev rows.

## F3 — eslint ignores line — APPROVE

`frontend/eslint.config.mjs:12`, one added line
`"playwright-report-2client/**"` in `ignores`. No rule relaxed, no source file
touched. The dir is gitignored generated output (`.gitignore:4-5`; absent from
the checkout because it only exists after a Playwright run), so the ignore can
hide only generated bundles. Measured from `frontend/`: `npm run lint` exit 0
with zero warning/error lines, `npx tsc --noEmit` exit 0.

## F4 — nine warning fixes + test mock retype — APPROVE-WITH-NOTES

All 9 spots inspected individually; every edit removes a false dependency or
restates an equivalent construct, and none changes runtime behavior.
`chat-histories/[lineUserId]/page.tsx:179` (body uses only `messages`,
`displayName`; `lineUserId` unreferenced — removal correct).
`friends/history/page.tsx:151` (`perPage` is a module-scope const at line 95,
never reactive — removal correct). `rich-menus`, `settings/custom`,
`settings/line` (`toast` added; provider defines it via stable `useCallback`,
so no re-render change). `CommandPalette.tsx:244` (`logout` used only at line
375 in the confirm handler outside the memo; memo body references it only in
string literals — removal correct). `files/page.tsx` (two `<img>` → `<Image
unoptimized>`; thumbnail parent gained `relative` for `fill`, modal uses
explicit dimensions; `loading="lazy"` dropped but next/image lazy-loads by
default). `AuthContext.tsx:194-195` (destructure reorder; CSRF store write
still precedes auth-state set, token still stripped from stored user).
`upload-security.test.ts:14-15` (mock retyped with explicit `Mock<...>`
annotation, arg-free impl; assertions untouched — touching the test file is
justified because the change is mock typing only). Measured: lint exit 0 with
0 errors and 0 warnings (was 11), tsc exit 0. Build and full unit (430s
suites) NOT rerun by the reviewer; the lane's receipts (build 49/49 pages,
785/785 unit, targeted 2/2) suffice because the diff scope is warning-class
only — dep arrays, an image component swap with `unoptimized`, a destructure
reorder, and a mock annotation — none of which can alter behavior beyond what
lint and tsc already verify on this tree. Notes, not objections: the
thumbnail `Image` with `fill` drops the old `w-full h-full` sizing contract
in favor of `object-cover` (visually equivalent, worth one glance in the
admin files page); the mock retype papers over an unused-param warning by
deleting the params rather than asserting they are forwarded (acceptable here
because the interceptor under test, not the mock, owns forwarding).

## Sharpest single objection, if any

None rising to REQUEST-CHANGES. The closest thing to an objection is the F4
thumbnail `fill` swap, and it is visually equivalent by construction.
