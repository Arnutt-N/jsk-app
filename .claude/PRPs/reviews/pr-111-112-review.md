# Review — PR #111 (matchtype enum) + PR #112 (reply-object editors)

**Date:** 2026-06-29
**Method:** Fan-out multi-expertise review (7 specialist agents) + adversarial 2-lens verify (correctness + scope) via workflow `review-prs-111-112` (95 agents, 6.3M tokens, 44 findings).
**Verdict:** 2 BLOCKING (fixed), 35 confirmed non-blocking, 7 refuted (false positives caught by adversarial verify).

## Decisions (with user, 2026-06-29)
- **webhook STARTS_WITH/REGEX matching** → **follow-up issue** (not in #111). Migration has standalone value (ORM can now persist STARTS_WITH); runtime matching is a pre-existing larger gap.
- **#112 pre-merge scope** → **acceptance + a11y**: fix 422-toast, add integration test (save→reload), fix 3 a11y HIGH (focus-restore / labels / aria-pressed). Remaining MEDIUM/LOW → follow-up.

## 🔴 BLOCKING (2 — same root cause) — FIXED
| id | finding | fix |
|---|---|---|
| mig-1 / enum-1 | **Duplicate alembic revision `t0u1v2w3x4y5`** collides with richmenu migration on main (applied to PROD 2026-06-21) → `alembic upgrade head` crashes, Koyeb deploy fails | Re-chained: new revision `u1v2w3x4y5z6`, `down_revision='t0u1v2w3x4y5'`, renamed file. Validated: single head, upgrade OK, enum_range now has STARTS_WITH. |

## 🟠 Non-blocking → FIXED in #112 (acceptance + a11y)
| id | sev | finding |
|---|---|---|
| tcq-1 | CRITICAL | integration test save→reload absent (issue #112 acceptance) |
| plan-2 | MEDIUM | 422 toast receives array not string → invalid-save error unrenderable (React-child crash) |
| a11y-1 / react-1 | HIGH | Modal focus not restored to trigger on close (WCAG 2.4.3) — mirror MobileDrawer |
| a11y-2 | HIGH | 5 modal form fields have no label association (WCAG 1.3.1/4.1.2) |
| a11y-3 | HIGH | Template subtype toggle: active state colour-only, no aria-pressed (WCAG 1.4.1/4.1.2) |

## 🟡 Deferred → follow-up issue/PR (confirmed real, non-blocking)
**#111 webhook (issue #111 acceptance not fully met):**
- enum-2 / mig-2 (HIGH): webhook.py has no STARTS_WITH branch → STARTS_WITH intents store but never fire
- enum-3 (HIGH): REGEX match type also unimplemented in webhook.py
- enum-4 (MEDIUM): tests only check Python enum membership, no DB round-trip / webhook dispatch
- enum-5 (LOW): frontend MATCH_TYPES hardcoded inline, not shared constant

**#112 test coverage (HIGH):** tcq-2 round-trip prefill, tcq-3 QuickReplyEditor (13-item boundary), tcq-4 TextV2Editor, tcq-5 ActionEditor, tcq-6 422 path, tcq-7 carousel subtypes, tcq-8 buttons 4-action boundary, tcq-9 legacy compat, tcq-10 carousel column count.

**#112 a11y/react/security (MEDIUM/LOW):** react-2 key={index} in dynamic lists; a11y-4/5 field-helper & ActionEditor labels; a11y-7/8/9 dup accessible names / modal-title id / quickReply imageUrl label; sec-1 ActionEditor uri accepts any scheme; ts-1 double-cast in MessagePreview; ts-4 fire-and-forget delete; ts-5 DOM cast to union; mig-3/4 ADD VALUE comment / orphan enum; plan-1/4 plan doc nits.

## ✅ REFUTED by adversarial verify (false positives — do NOT fix)
- plan-3: "preview shipped but issue defers to Phase C" — scope reconciled, preview is acceptable here.
- react-3: ActionEditor type-switch "leaks stale fields" — refuted, payload rebuilt cleanly.
- react-4: fetchObjects effect "doesn't cancel in-flight fetch" — refuted, harmless.
- react-5: handleQuickReplyChange "stale closure" — refuted, reads current parsedPayload.
- a11y-6: live preview "exposes tree to SR" — refuted, decorative content acceptable.
- ts-2: TemplateEditor subtype fallback "broken" — refuted, fallback works.
- ts-3: non-null assertion "could DELETE /null" — refuted, guarded upstream.

## Notes
- adversarial verify removed 7/44 (16%) false positives — meaningful noise reduction before touching prod.
- Both PRs' original CONFLICTING state was only `.agents/state/*` session noise; branches were reset to main + clean production changes re-applied.

## Outcome (2026-06-29)
- **PR #111 merged** to main (squash `3018db4`). Migration re-chained to `u1v2w3x4y5z6` (down_revision `t0u1v2w3x4y5`). Local validate: single head, `alembic upgrade head` OK, `enum_range(matchtype)` now includes `STARTS_WITH`; `test_match_type_unification` 5 passed.
- **PR #112 merged** to main (squash `dc52cb8`). vitest 31/31 (incl. new ReplyObjectsPage integration test), tsc/eslint clean.
- **PENDING**: apply #111 migration to Supabase PROD (`db_target.py alembic --target remote upgrade head`). Backend auto-deploys on Koyeb, frontend on Vercel.
- **Follow-ups to open**: (1) webhook STARTS_WITH/REGEX runtime matching + tests; (2) #112 deferred test-coverage / a11y-medium / security-medium items (see Deferred section).
