# Synthesis — SakonNakhonBot reuse design (arena result, 2026-10-13)

## Decision
**Base = Candidate A (content-as-data)** + 3 grafts from Candidate B.
Agreement with cross-judge: full agreement on base and graft list. No reframe needed —
both candidates converged on the same core (intent rows + reply objects + exact-"0"
branch + follow welcome); they differed only on ownership mechanics, resolved below.

## Why A won
This is a one-shot content migration with a permanent non-coder admin tail, not a new
behavior subsystem. A's shape (rows in existing tables, cascade untouched, existing
admin UIs as editors) is the only one where an admin can fix content without a deploy.
B's `legacy_pack` package is real depth in the wrong place: namespaced `legacy:` rows,
re-import-vs-manual-edit as two ways to do one task, and — decisively — B's
`send_follow_welcome` is built on a false premise (follow events DO carry a reply
token; only unfollow is tokenless), so its push path burns push quota for no reason.
A's reply-via-outbox on follow is correct.

## Grafts (B -> A, adapted)
1. `validate_handoff_keywords` runtime guard (B verbatim): drop bare `"0"` in
   `handoff_service.get_configurable_keywords`, log loudly. Promotes A's comment
   into structure.
2. `classify_row` hard fails in the import script: `ValueError` on sheet keyword
   `"0"` ("zero is behavior, not content"); empty-answer rows become unmappable
   `SilentRow` dropped pre-write (replaces A's `--silent` input-list convention);
   plus `check_quick_reply_limit` (<=13, Thai message) and no-REGEX-emit rule.
3. Stale-deactivate-never-delete sweep + single-response-per-category emit +
   collision list returned as a result object (CI-gateable), not just printed.
   Tagging stays A's style: `payload/meta {source, legacy_no}` — NOT B's
   `legacy:` name prefixes (avoids the namespaced-ghetto criticism).

## Explicitly rejected (from B)
- `send_follow_welcome` push path and `legacy_welcome_first/back` objects — keep
  A's `WELCOME_TEMPLATE` setting + reply via outbox.
- `ReplyObject`-for-plaintext indirection — plain answers stay `text_content`.
- One-off-script rejection as dilemma: the script IS one-shot ops (not runtime),
  which is fine; the "two ways" concern is answered by making the script the only
  bulk path while day-to-day edits stay in admin UIs (different operations, not
  two ways to do one task).

## Final shape (what gets built)
1. `backend/scripts/seed_sakonnakhon_content.py` — idempotent Sheet1 A-K import
   (dry-run + overlap gate blocking `--apply`, per-file media isolation, hard
   fails from graft 2, stale sweep + collision result from graft 3). Ops-only.
2. `backend/app/services/welcome_service.py` — pure `render_welcome()` (~30 lines)
   filling `{display_name}`/`{follow_count}` from `WELCOME_TEMPLATE` setting,
   fail-silent (follow path must never break friend creation).
3. `webhook.py::handle_follow_event` +4 lines (render + reply, fail-silent).
4. `message_handler.py` +3 lines (`text == "0"` exact branch before handoff
   keywords, gated by `ZERO_HANDOFF_ENABLED`).
5. `handoff_service.py` +1 line (`validate_handoff_keywords` guard).
6. Data: ~12 categories, ~132 keywords, 100 responses, ~34 reply objects,
   2 settings, ~24 re-hosted media files. Admin frontend: extend existing pages
   (field hints), no new routes.

## Verification notes (Phase F)
- OPEN (implementation must resolve): `handle_follow_event` currently takes no
  outbox; A's sketch drains a locally-created outbox inline, which risks ghost
  send if `db.commit()` later fails. Implementation must thread the event outbox
  through the follow handler (same mutate->commit->announce discipline as
  message events) or otherwise drain post-commit. Recorded here, not papered over.
- `text == "0"` branch must sit AFTER the HUMAN-mode gate and use the same
  single-use-token discipline as `check_handoff_keywords` (return True, no second
  reply on the token).
- Flex rule is structural in the script: col-H JSON -> `ReplyObject(FLEX)` +
  `$ref`-only response, never inline `IntentResponse.payload` (hero-strip trap).
- 81 silent keywords -> zero rows (silence is the cascade default). No unfollow
  reply, no BLOCK/UNBLOCK code. No new tables/endpoints/matcher/renderer/uploader.

## Red-flag re-screen of the synthesis
Shallow module: no new runtime abstraction beyond the 30-line pure helper — depth
lives in existing cascade/services. Leakage: no wire types cross; script writes via
existing schemas. No temporal decomposition, no pass-through, single ownership per
state (welcome text: setting; Q&A: intent rows; handoff words: HANDOFF_KEYWORDS +
exact branch that cannot collide by construction). One import path, one welcome
path, one "0" path. Silent behavior derived from row absence (no list to sync);
overlap is a generated report.

## Open questions for the human (need answers before PRD)
1. Welcome copy: exact Thai texts for first-follow vs welcome-back? (defaults exist
   in old bot; confirm or rewrite)
2. Sheet1 A-K headers: confirm actual header names/positions in moj-skn-bot.xlsx
   (import script maps by header with positional fallback — dev will verify).
3. Image hosts: are the 28 postimg/imgur URLs still fetchable for re-hosting?
   (dev checks at implementation; unfetchable ones stay hotlinked + flagged)
4. `ZERO_HANDOFF_ENABLED` default on or off at launch?
5. Outgoing-Flex-body logging gap + `IntentResponse.order` quirk: documented as
   out of scope — confirm accepted.

## Next implementation step
After human sign-off: write the PRD (per repo workflow), then the PRP plan.
