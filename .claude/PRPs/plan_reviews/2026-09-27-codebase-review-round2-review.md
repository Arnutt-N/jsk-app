# Plan Review Report: 2026-09-27-codebase-review-round2 (GATE - READY 9/10, round 6)

- **Plan:** `.claude/PRPs/plans/2026-09-27-codebase-review-round2.plan.md`
- **PRD:** `.claude/PRPs/prds/2026-09-27-codebase-review-round2.prd.md`
- **Findings:** `.claude/PRPs/findings/2026-09-27-full-codebase-findings.md`
- **Method:** prp-validate-plan, dual adversarial review, 13 criteria (A1-A6 + B1-B7).
- **Isolation:** context-only (single model; no model choice available) — recorded
  per skill; independence via separate context windows + no cross-visibility.

## Gate history (max 3 revise loops consumed)

| Run | Result | Failed (union) | Disposition |
|-----|--------|----------------|-------------|
| 1 (initial) | NOT READY | A2, B2, B3 (missing imports, abandoned-path gap, false ChatSessionResponse premise) | Revised (loop 1) |
| 2 | NOT READY | A2, A5, A6, B2, B3, B6, B7 (placeholders, T6 contradiction, UX gaps, test-repair gaps) | Revised (loop 2) |
| 3 | NOT READY | A2 (B3), A5 (A3) — T3 L98 rename, T6 hedge, PDF-413 UX premise | Revised (loop 3) |
| 4 (final) | **NOT READY** | A2, B2, B6 (B4 only; A4 crashed, no verdict) | **ESCALATE — no loops left** |
| 5 (extra, approved) | NOT READY | A5+B5 narrow (frontend stub / M-8 / test pins) | Rev6 (Detail-phantom fix, this revision) |
| 6 | **READY (9/10)** | none (13/13 PASS both) | Implement (Step 8); rev6a wording-only touch-ups |

Trajectory converged every round (7 → 7 → 2 → 3 narrow criteria), but the cap
is the cap: **no implementation has started (G1/G2 intact), zero code touched.**

## Round-4 verdicts

### Reviewer B4: FAIL — A2, B2, B6 (rest PASS)
Critical issues (all author-verified TRUE against the repo):
1. **Stale NOT Building bullet** — "Any frontend change (verified unnecessary)"
   contradicts the T4 toast subtask + Files #9 + PRD scope (author's own
   revision-3 editing miss).
2. **T4 test stub incoherent** — stub lacks `content-type`/`text()`; real
   `readErrorMessage` (`frontend/lib/api-error.ts:26-50`) falls through to
   `response.text()`, which the stub lacks → TypeError → fallback, so the
   "containing 'Conversation too large'" assertion fails as specified.
   (Also noted: L34 checks capital-D `Detail` — pre-existing quirk.)
3. **Blanket acceptance line** — "no frontend change needed" contradicts the
   required T4 toast; T5 `return_value={...}` unpinned.

Suggestions (valid): pin T5 mock + user_ids order; pin T6 501-row await counts;
Tighten T7 test edits to exact lines.

### Reviewer A4: CRASHED (no verdict)
Child run failed on infrastructure before delivering JSON. No recovery
attempted — loop budget was already exhausted by B4's FAIL.

## Remaining work if a 4th loop is approved (~15 min, all specified)
1. Fix the 2 stale frontend bullets (NOT Building + Acceptance).
2. T4 test: use a REAL `new Response(JSON.stringify({ Detail: '...' }),
   { status: 413, headers: { 'content-type': 'application/json' } })` stub.
3. Pin T5 mock `{123: "Uxxx"}` + `dict.fromkeys` order; pin T6 501 counts.
4. T7: exact test edits (remove `commit.assert_awaited` at
   `test_live_chat_service.py:284`, add explicit commit where callers would).
5. Re-run dual gate (needs human approval — exceeds max 3 loops).

## Confidence: N/A (gate NOT READY — no score claimed)

## Round-5 verdicts (texts in pre-compaction session log, not in repo)
- A5: FAIL — narrow items (frontend stub / M-8 / test pins, per session log).
- B5: FAIL — narrow items incl. "T4 frontend stub uses mismatched Detail-keyed
  payload no backend path emits".
- Both FAILs actioned in rev6 below.

## Rev6 author response — the capital-D `Detail` phantom (byte-verified)
Root cause: B4's round-4 aside "(L34 checks capital-D `Detail` — pre-existing
quirk)" was a MISREAD of `frontend/lib/api-error.ts:34`. Rev5 complied with it
literally (plan L235/L237), creating a real plan bug: the capital-D stub could
neither hit L34's lowercase branch nor match any backend payload shape.
Perception-independent evidence:
1. `Select-String -CaseSensitive -Pattern 'Detail' frontend/lib/*.ts` →
   ZERO matches: no capital-D reader/producer in frontend source.
2. Same pattern on the plan (pre-rev6) → lines 235, 237 only (+229
   `fetchChatDetail`, a legitimate identifier).
3. `api-error.ts:34` on-disk bytes `?.` + `0x64...` (lowercase `detail`) —
   correct as committed; `vitest run lib/__tests__/api-error.test.ts` 20/20
   green on clean HEAD (`d1b47f7`); `git status` clean.
4. FastAPI `exception_handlers.py:16` emits `{"detail": ...}` (lowercase,
   verified in `backend/venv_win` site-packages) — the new T4 413 arrives
   lowercase.
5. Live-producer audit (refutes "mappings for unraised statuses"): 413 →
   `media.py:272,275,657,660` (+ new T4 export gate); 429 →
   `core/http_rate_limit.py:72-77` wired in `liff.py:87,145,262` +
   `media.py:73,78`; 422 → FastAPI auto-validation; 502 →
   `admin_broadcast.py:254`.
Rev6 changes (plan-only; zero source touched — G1/G2 intact):
- L235: stub `{ Detail:` → `{ Detail:` (real FastAPI 413 shape; hits L34).
- L237: prose corrected to lowercase-is-real-shape.
- L197: pinned backend `detail="Conversation too large"` (was a bare
  `HTTPException(413)` — the exact-toast assertion was unimplementable).
- L248 VALIDATE: assert status AND `detail == 'Conversation too large'`.
- Post-rev6 capital-D grep on plan → line 229 only.
Tooling footnote: PowerShell variables are case-INsensitive (`$D`/`$d`
collide) — the rev6 script used `$capD`/`$lowD` with `[int]` guards (68/100).
## Round 6 - GATE PASSED (READY, 9/10)

- **Reviewed:** 2026-09-27, plan rev6 (rev6a touch-ups applied after verdict;
  wording-only, no semantic change - no re-gate required)
- **Reviewers:** A6 PASS, B6 PASS (context isolation only: single model,
  separate windows, no cross-visibility)
- **Rubric:** 13/13 PASS on both sides (A1-A6, B1-B7 incl. B7 Finding
  Coverage - zero orphans; M-8 DEFERRED with documented reason accepted)
- **Score:** 10 - 2x0 - 1x0 - 1x(Important) = 9 >= 8 - READY, proceed to Step 8
- **Disagreements:** none on criteria. A6 filed the T7 wording item under
  critical_issues; B6 filed none; adjudicated as Important (exact
  IMPLEMENT/VALIDATE steps unaffected - rationale sentence only).

### Important (1, fixed in rev6a)

- T7 ACTION claimed "mutation + audit row commit atomically" while the M-8
  NOTE states the audit decorator never fires for transfer - reworded to
  "so the mutation commits atomically" (A6; author-verified TRUE).

### Minor folded into rev6a (all repo-verified before folding)

- T4: quoted 404 literal `Conversation not found or has no messages`
  (admin_export.py:108,134) (B6).
- T6: full patch path
  `app.tasks.session_cleanup.analytics_service.emit_live_kpis_update`
  (session_cleanup.py:15,78) (B6).
- T3: narrowed no-touch range to L116-123 + L125-126 flex reply
  (commands.py verified) (A6).
- T3: zero-rows reply = L92 literal copied VERBATIM from source (B6).
- L35/L226: full frontend-relative dirs for useChatRoom.ts +
  ChatArea.connection.test.tsx (glob-verified; useChatRoom.ts is 258 lines
  so :151-187 is live) (A6).

### Minor NOT folded

- A6: "confirm jsdom exposes global Response for the T4 test" - answered,
  no plan change: the existing lib/__tests__/api-error.test.ts already
  constructs `new Response` under jsdom, 20/20 green.

### Independent confirmation of the rev6 Detail fix

- B6 (unprompted, byte-level): "api-error.ts:34 contains only lowercase
  detail (0x64, no 0x44 on line); transfer-errors test has 0 capital-D vs
  5 lowercase matches - plan case claims correct, no phantom."

### Recommended next step

implement from the plan (Step 8), T1-T7 in dependency order (T6 after T5).
