# Plan Review: 2026-10-23-leave-confirm-soft-delete

**Plan**: `.agents/PRPs/2026-10-23-leave-confirm-soft-delete.plan.md` (rev 1)
**Reviewed**: 2026-10-23
**Source PRD**: `.agents/PRPs/2026-10-23-leave-confirm-soft-delete.prd.md`
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only (same model) | FAIL | 4 |
| B | context isolation only (same model) | FAIL | 5 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | FAIL | Test targets as "ค้น test_intent*" / "ถ้ามี" force searching; exact files now resolved (see fixes) |
| A2 | Implementation Readiness | FAIL | FAIL | Literal placeholders `<test-intent>`, `<path>`, `<ทุกโฟลเดอร์ที่แตะ>`; missing `import { useLiffLeave } from '@/hooks/useLiffLeave'` |
| A3 | Pattern Faithfulness | PASS | PASS | 5+ refs spot-checked real by both reviewers, no invented snippets |
| A4 | Validation Coverage | PASS | FAIL | `test_auto_replies.py` does not exist; Task 7 commands not runnable as written |
| A5 | UX Clarity | PASS | PASS | Before/after copy documented for all user-visible changes |
| A6 | No Prior Knowledge Test | FAIL | FAIL | Restore routes unnamed; booking fallback vague; test discovery needs repo grep |
| B1 | Spec Coverage | FAIL | FAIL | Task 1 omits restore test; canned/close-test verify-only unmapped; intent list-exclusion design unstated; booking fallback contradicts PRD |
| B2 | Internal Consistency | PASS | FAIL | Self-review "no placeholders" claim false; reopen coverage inconsistent across tasks |
| B3 | Technical Soundness | PASS | FAIL | B found real gap: `list_categories` has no `is_active` filter; plan drops `self.invalidate()`; booking fallback mismatches cited pattern |
| B4 | Scope Discipline | FAIL | FAIL | No NOT-building section; 2 of 4 PRD non-goals absent from plan |
| B5 | Risk Coverage | PASS | FAIL | No GOTCHA fields; cache-invalidation + list-filter pitfalls unmitigated |
| B6 | Testability | PASS | PASS | Red-green per task with input/expected pairs; Task 3 has 4-case edge list |
| B7 | Finding Coverage | SKIPPED | SKIPPED | No findings input supplied |

## 🔴 Critical (must fix before implementing)

- Placeholders in commands/test targets — Task 7, Task 1/2/4; evidence: `<test-intent> <test-taxonomy>`, `<path>`, `ค้น test_intent*`, `ถ้ามี — ต่อท้าย`
- Missing import path `@/hooks/useLiffLeave` and unnamed restore routes — Tasks 5-6, Task 1/3
- Task 1 omits PRD-mandated restore test — Task 1 vs PRD acceptance
- No explicit non-goals section; Goal sentence overgeneralizes to all LIFF forms — plan header
- Intent list-exclusion design unstated (`list_categories` unfiltered) — Task 2; resolution: admin lists show all incl. inactive (restore needs it, matches TaxonomyEditor badge pattern), public reads already filter
- Booking fallback destination contradicts PRD (homepage vs LINE link) — Task 6 vs PRD section A
- Taxonomy `self.invalidate()` dropped from steps; `topic_count` counts soft-deleted topics — Task 3

## 🟡 Important (should fix)

- Encode intent re-activate 400-guard (needs ≥1 active response) in Task 2 tests — verified `admin_intents.py` guard ~line 128
- Keep `DELETE` response body `{"status":"deleted"}` stable (contract unchanged) — state explicitly
- request-v2 has no in-form exit button at all — resolution: exclude from scope (adding one is new UI), harden only its success-screen fallback

## 🟢 Minor / Suggestions

- Name exact test files/commands (done in rev 2)
- Narrow Goal sentence to the in-scope pages

## Reviewer Disagreements

- A1/A4/A5-criteria split (A PASS, B FAIL on A1, A4, B2, B3, B5): B verified deeper (missing file on disk, unfiltered list query, absent GOTCHAs). B's evidence is concrete; aggregate records FAIL wherever either failed.

## Recommended Next Step

revise and re-validate — fix all 🔴 + 🟡 above in plan rev 2, then re-run prp-validate-plan before implementing.
