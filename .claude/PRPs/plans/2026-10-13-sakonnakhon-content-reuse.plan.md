# PRP Plan: SakonNakhonBot Content Reuse (import + welcome + exact-"0")

## Metadata

- Complexity: Medium (1 ops script + ~40 runtime lines + data rows; no schema
  change, no new tables/endpoints, no renderer/uploader changes).
- Source PRD: `.claude/PRPs/prds/2026-10-13-sakonnakhon-content-reuse.prd.md`
  (PRD §4 items 1–8 map to Phases 1–4 below; PRD §5 maps to S1–S5).
- Design record: `.scratch/arena-sakonnakhon/synthesis.md` (base A + 3 grafts;
  open verification note on follow-outbox threading — resolved in Phase 2).
- Branch: `feat/sakonnakhon-content-reuse` (already created, based on
  `main@5601d36`).
- Working directory: ALL shell commands run from `backend/` unless stated.
  Backend runs in WSL (`backend/venv_linux`); DB/Redis via docker-compose.
- Legacy source (read-only, never committed):
  `D:/Line Chatbot/SakonNakhonBot/apps-script/*.gs`,
  `D:/genAI/jsk-app/secrets/moj-skn-bot.xlsx` (Sheet1 = import input).

## Summary

Land legacy content as data plus three surgical runtime additions in 4 phases:
(1) idempotent Sheet1 A–K import script with hard fails + overlap gate + tests;
(2) pure `render_welcome()` + follow hook threaded through the event outbox;
(3) exact-`"0"` branch + `validate_handoff_keywords` guard + tests;
(4) dry-run → apply the real 100 pairs / 28 images / menu / quick replies +
small admin-UI hints. One commit per phase; backend suite green after each.

## Files to Change

| # | File | What |
|---|------|------|
| 1 | `backend/scripts/seed_sakonnakhon_content.py` (NEW) | Idempotent A–K import: header-mapped load, `classify_row` hard fails, silent-drop, flex→ReplyObject+$ref rule, media branch (self-host JPEG/PNG ≤10 MB else external object), stale-deactivate-never-delete sweep, overlap report + result object, `--dry-run`/`--apply`/`--force-with-overlap` |
| 2 | `backend/tests/test_seed_sakonnakhon_content.py` (NEW) | Script tests: idempotency (apply twice = zero diff), `"0"` ValueError, silent-drop, quickReply>13 + REGEX rejection, overlap gate blocks apply, per-file media isolation |
| 3 | `backend/app/services/welcome_service.py` (NEW) | Pure `render_welcome(db, user)`: `WELCOME_TEMPLATE` + `{display_name}`/`{follow_count}`, blank = disabled, never raises |
| 4 | `backend/app/api/v1/endpoints/webhook.py` | `handle_follow_event`: thread event outbox (see Phase 2), render + reply, fail-silent (~+6 lines) |
| 5 | `backend/tests/test_follow_welcome.py` (NEW) | Welcome once / welcome-back count / blank-template silence / render-failure never breaks bookkeeping / no reply on unfollow |
| 6 | `backend/app/services/message_intake/message_handler.py` | Exact `text == "0"` branch after HUMAN gate, before handoff keywords, `ZERO_HANDOFF_ENABLED` kill-switch, single-use-token discipline (~+3 lines) |
| 7 | `backend/app/services/handoff_service.py` | `validate_handoff_keywords()` one-liner in `get_configurable_keywords` (drop bare `"0"`, loud log) (+1 line + guard location; guard body may live in `welcome_service.py` or `handoff_service.py` — implementer picks, single owner) |
| 8 | `backend/tests/test_exact_zero_handoff.py` (NEW) | `"0"` → handoff; HUMAN-mode loss; phone `08x-xxx-xxxx` unaffected; `10`/`20` never trigger; guard drops bare `"0"` from keyword lists |
| 9 | `frontend/app/admin/chatbot/*`, `reply-objects/*`, settings UI | Hint text only: `$ref`-at-end guidance, template placeholder help (no new routes/components) |
| 10 | Data rows (via script, Phase 4) | ~12 categories, ~132 keywords, 100 responses, ~34 reply objects, `WELCOME_TEMPLATE` + `ZERO_HANDOFF_ENABLED`, ~24 media files |

## NOT Building

- No unfollow reply / BLOCK-UNBLOCK code; no new tables/endpoints/matcher/renderer/uploader.
- No `IntentResponse.order` honoring, no outgoing-Flex-body logging, no `$` escaping (documented quirks).
- No Sheet2/FriendHistory migration; no rich-menu rebuild of the imagemap; no prod cutover sequencing; no token rotation (separate ops task).

## Phase 1 — Import script + tests

Goal: PRD §4 item 1. Steps:
1. Write `backend/scripts/seed_sakonnakhon_content.py` per §2 sketch
   (dataclass `LegacyRow`, `load_sheet`, `plan`, `apply`, stable identity via
   `payload/meta {source:"sakonnakhon", legacy_no}`).
2. Write `backend/tests/test_seed_sakonnakhon_content.py` (cases in table row 2).
3. Validate: `python -m pytest tests/test_seed_sakonnakhon_content.py -v`
   then full `python -m pytest` (must stay green).
4. Self-check against red flags: no new runtime abstraction; script is ops-only.
Commit 1.

## Phase 2 — Welcome service + follow hook

Goal: PRD §4 items 2–3. Resolves synthesis verification note: thread the
per-event outbox through `handle_follow_event` (same mutate→commit→announce
discipline as message events) instead of draining inline.
Steps:
1. Write `welcome_service.py` (`WELCOME_TEMPLATE_KEY`, `ZERO_HANDOFF_ENABLED_KEY`,
   `DEFAULT_WELCOME` = legacy first-time Thai text).
2. Extend `handle_follow_event`: render + append reply closure to the event
   outbox; fail-silent (log only). No touch to unfollow path.
3. Write `backend/tests/test_follow_welcome.py` (cases in table row 5).
4. Validate: new test file + `python -m pytest tests/test_webhook_media.py`
   (follow-adjacent regressions) + full suite.
Commit 2.

## Phase 3 — Exact-"0" + keyword guard

Goal: PRD §4 items 4–5. Steps:
1. Insert exact branch in `message_handler.py` text path (position per PRD §4.4).
2. Add `validate_handoff_keywords` + one-line call in `get_configurable_keywords`.
3. Write `backend/tests/test_exact_zero_handoff.py` (cases in table row 8).
4. Validate: new test file + `python -m pytest tests/test_websocket.py`
   (handoff-adjacent) + full suite.
Commit 3.

## Phase 4 — Data import + admin hints

Goal: PRD §4 items 6–7. Steps:
1. Export Sheet1 from `secrets/moj-skn-bot.xlsx` to CSV (local only, never commit).
2. `--dry-run`: expect 100 pairs / 81 silent / junk rows, zero writes; review
   overlap report vs live `auto_replies` + intent keywords; resolve collisions
   (deactivate/rename runbook) before proceeding.
3. `--apply` on dev DB; re-run to prove zero-diff convergence; spot-check the
   top-5 legacy asks (legal consult, queue, contact, justice center, traffic).
4. Upload menu base image via existing media flow; create the shared IMAGEMAP
   object (6 actions) + quick-reply attachments; verify in reply-object preview.
5. Frontend hint texts (row 9), Thai copy, no new routes.
6. Validate: full backend suite + lint; manual LINE sandbox checks per PRD §5
   (welcome once, welcome-back count, `"0"` handoff in/after hours, carousel
   wholeness, 5-balloon cap, no-match silence).
Commit 4, then PR → review → merge per repo workflow.

## Risks

- 28 image URLs may be dead (postimg/imgur rot) — script flags per file; dead
  ones stay hotlinked + reported, never block the run.
- Overlap with live `auto_replies`/intents — dry-run gate blocks apply until
  resolved; pack never deletes unowned rows.
- `WELCOME_TEMPLATE`/`ZERO_HANDOFF_ENABLED` values are admin-editable; wrong
  values fail safe (blank = silent; kill-switch = off).
- secrets xlsx + legacy `.gs` stay out of git (secrets/ is gitignored; legacy
  lives outside the repo).
