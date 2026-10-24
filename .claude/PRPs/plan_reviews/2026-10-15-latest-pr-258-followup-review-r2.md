# Plan review — 2026-10-15-latest-pr-258-followup (GATE LOOP 2)

Plan (rev.2, R1–R4 applied). Method: dual adversarial review, fresh isolated reviewers.

## Reviewer A — VERDICT: READY, CONFIDENCE: 8/10 — all B1–B9 PASS, R1–R4 YES
Top risks: T2 service-method resolve-via-grep leaves minor discovery; bundled-PR deviation
relies on small-hunk justification; T1 fallback masks isolation if second-DB run skipped
despite BLOCKING label.

## Reviewer B — VERDICT: READY, CONFIDENCE: 7/10 — all B1–B9 PASS, R1–R4 YES
Top risks: T2 "(or the owning service method — resolve via grep)" leaves target unpinned;
Files item 7 is a grep recipe not a pinned schema file (422 risk at impl); T1 isolation
conditional on TEST_DATABASE_URL so H1 proof rests on the blocking tail.

## Parent grounding (post-review, pre-decision)
Parent resolved B's 422 risk to a concrete fact:
- Route `GET /conversations` enforces `response_model=ConversationList`
  (`backend/app/api/v1/endpoints/admin_live_chat.py:76`).
- `ConversationSummary.line_user_id: str` is REQUIRED
  (`backend/app/schemas/live_chat.py:22`); `ConversationList` has NO extra field.
- Therefore the planned per-row `line_id_decrypt_error` flag alone is insufficient AND
  `line_user_id=None` rows would 500 on response validation. The plan's T2 must change:
  SKIP quarantined rows + additive `quarantined_count: int = 0` on `ConversationList`
  (default keeps old clients safe) + log (+ counter or named follow-up).
- Target pinned: `ConversationsMixin.get_conversations` (`conversations.py:81`).

## Gate decision (loop 2): REVISE → loop 3 (loops used: 2/3)
Not a confidence failure (both READY, all criteria PASS) but a material logic refinement
from grounding that the loop-3 reviewers must judge explicitly. Revision orders:
R5: pin T2 target/route/schema files; replace per-row-flag with skip + `quarantined_count`
  (rationale quoted above); update mirror asserts + acceptance proof accordingly.
R6: T1 stays as-is (B's isolation-conditional risk is already carried by the BLOCKING
  second-DB tail checkbox — loop-3 judges sufficiency).
