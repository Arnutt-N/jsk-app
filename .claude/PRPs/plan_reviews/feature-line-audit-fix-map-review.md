# Plan Review: feature-line-audit-fix-map

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
**Reviewed**: 2026-09-21
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Review Mode**: limited — two independent context-isolated reviewers were dispatched; both initial dispatches and the one allowed retry failed to return structured JSON
**Verdict**: NOT READY
**Confidence Score**: 1/10 — local review found multiple single-pass blockers; the limited-review cap also applies

## Load Check

- Plan metadata, summary, file structure, 20 step-by-step tasks, validation contract, NOT Building, risks, UX, and edge-case checklist were present.
- Source PRD was resolved and read. Stories 1–43 and the implementation/testing decisions were checked against the plan mapping.
- No `--findings` path was supplied for this round; B7 is therefore SKIPPED.
- Read-only repository checks verified frontend scripts in `frontend/package.json`, pytest dependencies in `backend/requirements.txt`, and the source references listed below.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only | N/A | No structured JSON after initial dispatch and one retry |
| B | context isolation only | N/A | No structured JSON after initial dispatch and one retry |

## Rubric Results

`N/A*` means the independent reviewer did not provide criterion-level JSON; the result below is the local adversarial assessment, not a fabricated reviewer verdict.

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | N/A* | N/A* | FAIL locally: D7 names `authFetch` and a Redis-backed ticket flow but does not document the actual frontend transport owner, the required import block in `media.py`, or a concrete auth/CSRF fixture recipe; plan D7:2914–3197. |
| A2 | Implementation Readiness | N/A* | N/A* | FAIL locally: all 20 tasks retain ACTION/IMPLEMENT/MIRROR/VALIDATE/GOTCHA, but D7 still leaves the frontend helper choice and security-test fixtures unresolved. |
| A3 | Pattern Faithfulness | N/A* | N/A* | FAIL locally: the plan's `authFetch` snippet is not an existing exported API; repo has `installAdminAuthFetchInterceptor` at `frontend/lib/authFetch.ts:156`, while the image-resize hook still uses raw fetch at `frontend/app/admin/image-resize/use-image-resize.ts:206`. |
| A4 | Validation Coverage | N/A* | N/A* | PASS locally: `frontend/package.json` defines `build`, `lint`, and `test:unit`; `backend/requirements.txt` includes pytest/pytest-asyncio; plan supplies pytest, Vitest, typecheck, lint, build, and static checks. |
| A5 | UX Clarity | N/A* | N/A* | PASS locally: plan includes Wave UX plus an explicit Image-resize Before/After entry at plan:3252–3258 and internal-change boundaries. |
| A6 | No Prior Knowledge Test | N/A* | N/A* | FAIL locally: a fresh implementer must search how to use the existing global fetch interceptor or create a new helper, how to construct the real cookie/CSRF auth client, and how to seed/clean the ticket fixtures. |
| B1 | Spec Coverage | N/A* | N/A* | PASS locally for story-to-task mapping: plan:3275 maps stories 1–43, and PRD story 38 is now assigned to D7 with auth/CSRF/expiry coverage. The concrete audit-log gap is reported under B3/B6. |
| B2 | Internal Consistency | N/A* | N/A* | FAIL locally: D7 says “use `authFetch`” and tests mock it, but no such export or file change is specified; the same task says to use existing auth while its code snippet omits the imports and exact owner for the new dependencies. |
| B3 | Technical Soundness | N/A* | N/A* | FAIL locally: JWT expiry and `redis_client.set(..., nx=True)` are repository-compatible (`security.py:65`, `:148`, `redis_client.py:86`), but the proposed frontend API is dead and the D7 route does not specify its import/reuse path for `Form`, `Annotated`, `redis_client`, ticket helpers, and the existing media validation/storage path. PRD story 43 also requires important actions to be auditable; D7's route contract does not state an audit event. |
| B4 | Scope Discipline | N/A* | N/A* | PASS locally: NOT Building explicitly excludes a public image-resize endpoint and keeps the in-scope route inside the existing media router (plan:3228–3239). |
| B5 | Risk Coverage | N/A* | N/A* | PASS locally: ticket expiry, nonce replay, Redis failure, CSRF, and generic-media permission separation have GOTCHA/risk entries (plan:2916, 3242–3249). |
| B6 | Testability | N/A* | N/A* | FAIL locally: D7 gives status expectations, but relies on undefined `authenticated_admin_client`, `agent_client`, and `resize_tickets` fixtures and does not provide the setup/cleanup needed to exercise the real cookie/header CSRF path (plan:3013–3069). |
| B7 | Finding Coverage | N/A* | N/A* | SKIPPED — no `--findings` input supplied. |

## 🔴 Critical (must fix before implementing)

- **D7 calls a nonexistent frontend API.** The plan says to call and mock `authFetch` (plan:2914, 2927, 2937, 3189–3197), but the repository exports `installAdminAuthFetchInterceptor()` at `frontend/lib/authFetch.ts:156`; it does not export `authFetch`. The current hook calls raw `fetch` at `frontend/app/admin/image-resize/use-image-resize.ts:206`, and the page currently gates with `manage_files` at `frontend/app/admin/image-resize/page.tsx:36`. The plan must choose the existing interceptor contract or explicitly create/modify a helper with its exact import path and tests.
- **D7 is not single-pass implementable on the backend.** The new `media.py` snippet (plan:3142–3185) uses `ResizeTicketResponse`, `Form`, `Annotated`, `timedelta`, `create_access_token`, `verify_token`, `redis_client`, and `KEY_IMAGE_RESIZE`, but does not give the import block or a concrete existing validation/storage helper to call. It also does not specify the audit-log call required by PRD story 43 (PRD:92–93). A fresh implementer must search and make security-sensitive decisions.
- **The required security tests are fixture placeholders, not an executable setup.** The plan names `authenticated_admin_client`, `agent_client`, and `resize_tickets` and says to define them later, but does not specify how to issue the real cookie token, seed the user/permission, set the CSRF cookie/header, consume/restore Redis nonce state, or clean up the created `MediaFile` (plan:3013–3069). This blocks reliable auth/CSRF/ticket verification.
- **Both independent reviewers failed the one allowed retry.** No structured verdict is available; under the skill's failure handling this round is a limited review and cannot return READY.

## 🟡 Important (should fix)

- D7 response details mix English `Resize ticket` text with Thai, despite the plan's global Thai UI/error requirement; define the exact Thai error messages and assert them.
- Add an explicit frontend test for the actual repository transport (`installAdminAuthFetchInterceptor`/global fetch or the newly created helper), including the CSRF header and `credentials: 'include'` behavior.
- Add an audit-log input/expected pair for ticket issuance and successful/failed resize upload, and state whether the nonce is consumed before or after file validation.
- D3's route-inventory assertion proves that no GET/PATCH exists today, but the plan should state the source-of-truth route list and failure behavior if a future route is added, rather than relying on a broad grep command alone.

## 🟢 Minor / Suggestions

- Keep the round-2 correction note, but rerun the self-review line references after the D7 import/fixture contract is made concrete.
- After revision, rerun this gate with two independent reviewers; do not treat the previous limited report as a PASS.

## Reviewer Disagreements

None available — neither independent reviewer returned structured criterion-level JSON. The local evidence above is explicitly separated from reviewer verdicts.

## Recommended Next Step

Revise the plan to resolve the D7 transport/import/fixture/audit contracts, then re-run `prp-validate-plan` round 3.
