# Plan Review: followup-d1d4

**Plan**: `.claude/PRPs/plans/2026-10-04-followup-d1d4.plan.md`
**Reviewed**: 2026-10-04
**Source PRD**: `.claude/PRPs/prds/2026-10-04-followup-d1d4.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 4 |
| B | general-purpose ("context isolation only" — platform offers no per-dispatch model choice) | FAIL | 4 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | FAIL | B: "no naming/error-handling/logging convention section with real examples" / A: "E1-E16 mirror table with live file:line anchors" |
| A2 | Implementation Readiness | FAIL | FAIL | "extend the closest existing live-chat test (or new … — check __tests__ first)"; "whichever the file's style supports; check imports first"; no useAuth import path |
| A3 | Pattern Faithfulness | PASS | PASS | 5–10+ SOURCE refs spot-checked live by each reviewer (webhook, mask.ts, line_service, twin pages, SDK `_preload_content` param) |
| A4 | Validation Coverage | PASS | FAIL | B: no explicit runnable build command despite TSX changes (package.json HAS `build: next build` — verified by aggregator) |
| A5 | UX Clarity | PASS | PASS | Before/after per UI task; explicit N/A on Tasks 1 and 4 |
| A6 | No Prior Knowledge Test | FAIL | FAIL | D3 recipe unrunnable (see B3-A) + A2's unpinned choices force searching |
| B1 | Spec Coverage | PASS | FAIL | B: PRD "payload contains phone_number and no phone" vs plan spread that keeps `phone` with no absence assertion |
| B2 | Internal Consistency | FAIL | FAIL | A: Files #8 "(new)" is false — `mask.test.ts` exists (overwrite risk); B: unnamed component test file missing from Files; file #9 range (:304-319) vs E15 (:304-338) |
| B3 | Technical Soundness | FAIL | FAIL | A: `_preload_content=False` raises AttributeError in installed linebot (verified at runtime); B: cap-abort `(b"", ct)` takes persist's empty-shape branch, losing the `skipped/too_large` marker |
| B4 | Scope Discipline | PASS | PASS | NOT Building mirrors PRD out-of-scope; no task exceeds it |
| B5 | Risk Coverage | FAIL | PASS | A: D3 risk row misdiagnoses crash as "shape differs"; fakes bypassing the real SDK can't catch it; stated fallback crashes identically |
| B6 | Testability | PASS | PASS | Input/expected pairs per unit + concrete edge-case checklist |

## 🔴 Critical (must fix before implementing)

- D3 design crashes in installed linebot 3.22.0: `_preload_content=False` returns a raw aiohttp `ClientResponse`, then `__call_api` calls `response_data.getheaders()`/`.data` (async_api_client.py), neither of which exists on aiohttp 3.13.4 (aggregator-verified: hasattr False/False) → AttributeError → swallowed by `download_message_content`'s `except Exception` → `(b"", None)` for ALL media (silent total outage). Blob-level fakes bypass the real path so tests would still pass. — Task 4; D3 needs a different approach (reviewer suggestion: direct authenticated HTTP streaming outside the SDK blob method, or header pre-check + existing preloaded path).
- D3 cap-abort returning `(b"", content_type)` contradicts "same skip payloads": `persist_line_media` takes the empty-shape branch (`size: None`, no `skipped` marker) instead of the `skipped/too_large` shape. — Task 4.
- D1 component test file unnamed ("or new CustomerPanel test … check first") and absent from Files to Change; audit glob (`_components/*.tsx` + "expect more") forces discovery. Name the file, list it, enumerate known render points. — Task 3.
- Files #8 "(new)" contradicts the repo: `frontend/lib/__tests__/mask.test.ts` EXISTS with real tests — extend/append, never overwrite; add a VALIDATE step running the pre-existing tests. — Task 3.
- D4 payload keeps raw `phone` via spread while PRD Testing Decisions requires asserting "no `phone`" — strip-vs-keep undecided, test asserts only presence of `phone_number`. Align plan with PRD (strip + assert absence). — PRD vs Task 2.

## 🟡 Important (should fix)

- Missing `useAuth` import path (actual: `@/contexts/AuthContext` — reviewer-verified `AuthContext.tsx:393`). — Task 3.
- Unpinned D3 patch target ("whichever … check imports first") — repin after D3 rework (candidate: PropertyMock on `LineService.blob_api`, verified property at `line_service.py:98-102`).
- No naming/error-handling/logging conventions block with real examples (A1). — plan body.
- No explicit frontend build command — add `cd frontend && npm run build` (script exists). — Validation Commands.
- File #9 range (:304-319) disagrees with E15 (:304-338) — reconcile. — Files/Evidence.

## 🟢 Minor / Suggestions

- Fix wording "MAX_LINE_MEDIA_BYTES (import at module top already)" — it is defined in-module (`line_service.py:35`).
- Expand E14 SDK path to `api/async_messaging_api_blob.py`.
- D3 rework should add at least one test through the real `call_api` with mocked transport, not only fakes.

## Reviewer Disagreements

- A1: A PASS (files + mirrors + harnesses suffice) vs B FAIL (conventions section absent). Both noted; fixing with a compact conventions block satisfies both.
- A4: A PASS (commands map to existing tooling) vs B FAIL (build command not specified). B is right per the rubric ("specified AND exist") — add the command.
- B1: A PASS (minor dropped sub-assertion) vs B FAIL (spec-plan contradiction on `phone`). Treated as Critical per the either-fails rule.
- B5: A FAIL (D3 risk misdiagnosed) vs B PASS (risks + GOTCHAs present). A's deeper reading stands — D3 risk must be rewritten with the verified crash.

## Recommended Next Step

re-plan — rework D3 around the verified SDK limitation (new approach + corrected risk/fallback/tests), fix the remaining Critical/Important items above, then re-run prp-validate-plan (single re-validation expected; the other three units' designs are sound).
