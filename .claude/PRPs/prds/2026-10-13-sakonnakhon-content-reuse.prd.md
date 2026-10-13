# PRD: Reuse SakonNakhonBot Legacy Content in jsk-app

Date: 2026-10-13 · Branch: `feat/sakonnakhon-content-reuse` · Owner: Muse Spark
Skills invoked: `pstack-architect` (Phase A `how` over intake/objects/friends
slices + Phase B `arena` 2 candidates + cross-judge, synthesis at
`.scratch/arena-sakonnakhon/synthesis.md`), `skn-line-flex-builder`
(content-home rules); skill map: `.claude/docs/skill-collections-20260712.md`.
Design sign-off: user-approved 2026-10-13 (base = content-as-data + 3 grafts).

## 1. Background

The legacy SakonNakhonBot (Google Apps Script, `D:/Line Chatbot/SakonNakhonBot`,
~2,552 lines across 11 `.gs` files, live in production) serves Sakon Nakhon
community-justice citizens. Its full data export
(`secrets/moj-skn-bot.xlsx`, gitignored) contains:

- **Sheet1: 100 real Q&A pairs** (181 keyword rows; 81 silent `line-oa` rows;
  837 blank rows), Thai answers avg 524 chars (max 2,405), **28 with images**
  hosted on postimg.cc/imgur;
- Flex carousel builders + FAQ/Community-Justice-Center bubbles, a 6-zone
  **imagemap menu**, quick replies, follow/unfollow welcome texts with
  follow-counts, exact-`"0"` staff handoff (+Telegram notify);
- Sheet2: 10,468 real conversation rows (2,030 users, 2024-07-21 → live);
  FriendHistory: 1,958 users (1,957 follows / 120 unfollows).
- Top asks: legal consult (2,179), booking/queue (1,267), contact office (920),
  community justice center (676), traffic cases, child certification, divorce.

Gap analysis (verified in code, Oct 2026) found jsk-app already supports all
four content homes — intent cascade (`EXACT>STARTS_WITH>CONTAINS>REGEX` +
AutoReply fallback), reply objects (10 types + quickReply modifier), rich menu
module, friend-event tracking + live-chat handoff. The ONLY missing runtime
behavior is the **follow welcome message** (`handle_follow_event` records but
never replies). The old bot was never pushed to GitHub (not a git repo; owner
declined archive backup).

## 2. Problem statement

1. The 100 Q&A pairs, flex/carousel JSONs, menu, and quick replies exist only
   in the legacy Sheet/`.gs` files — jsk-app admins cannot use them.
2. New followers get **no greeting** (old bot sent first-time + welcome-back
   texts); the refollow count needed for welcome-back copy is already tracked
   (`FriendEvent.refollow_count`) but unused.
3. Legacy `"0"` handoff cannot be copied as a keyword: `check_handoff_keywords`
   is **substring** matching, so bare `"0"` would match every message containing
   the digit 0 (amounts, dates, `^0\d{9}$` phone flow).
4. 28 answer images are hotlinked to third-party hosts (rot risk); jsk-app
   self-hosts JPEG/PNG/PDF ≤10 MB only.

## 3. Decision

**Content-as-data migration + ~40 lines of new code** (arena synthesis: base A +
3 grafts from B). Everything legacy lands as rows in existing tables; the
cascade, renderer, uploader, and handoff machinery are reused untouched.

- Import: one idempotent script, Sheet1 cols A–K → intent rows + media +
  reply objects (dry-run + overlap gate).
- Runtime: pure `render_welcome()` (~30 lines) + 4-line follow hook (reply via
  outbox, fail-silent) + 3-line exact-`"0"` branch (before handoff keywords,
  gated by `ZERO_HANDOFF_ENABLED`) + 1-line `validate_handoff_keywords` guard.
- No new tables, endpoints, matcher, renderer, or uploader code.

Alternatives rejected (arena record): a `legacy_pack` service package (deep but
misplaced — follow-push built on the false premise that follow lacks a reply
token; namespaced rows + re-import-vs-edit as two ways to do one task); inline
`IntentResponse.payload` flex (hero-strip trap); `"0"` in `HANDOFF_KEYWORDS`
(catastrophic substring); migrating the 10k conversation rows (PDPA + no value —
jsk-app log starts clean).

## 4. Scope

IN:

1. `backend/scripts/seed_sakonnakhon_content.py` — idempotent A–K import:
   header-mapped load; `classify_row` hard fails (`ValueError` on keyword `"0"`,
   empty-answer → unmappable `SilentRow` dropped pre-write, quickReply ≤13,
   never emits REGEX); flex-carousel JSON → ONE `ReplyObject(FLEX)` +
   `$ref`-only response (`payload=None`, whole-carousel preservation);
   single image → `ReplyObject(IMAGE)` (+ self-host JPEG/PNG ≤10 MB via media
   module, else external-URL object); imagemap menu → single shared IMAGEMAP
   object; quick replies → `payload.quickReply`; 81 silent keywords → zero rows
   (plan FAILS on collision with silent list); stale sweep
   (deactivate-never-delete rows tagged `payload/meta {source, legacy_no}`);
   overlap report vs live `auto_replies`/`intent_keywords` blocking `--apply`
   unless `--force-with-overlap` (audit-logged); per-file media isolation
   (one bad file never aborts the run); returns a result object (CI-gateable).
2. `backend/app/services/welcome_service.py` — pure `render_welcome()`: fills
   `{display_name}`/`{follow_count}` from `WELCOME_TEMPLATE` setting (default =
   legacy first-time text), blank template = disabled, never raises.
3. `webhook.py::handle_follow_event` — render + reply via the event outbox
   (post-commit discipline, NO push quota burn), fail-silent.
4. `message_handler.py` — `text == "0"` exact branch after HUMAN-mode gate,
   before `check_handoff_keywords`, honoring `ZERO_HANDOFF_ENABLED`
   (default ON for legacy parity), single-use-token discipline.
5. `handoff_service.py` — `validate_handoff_keywords()` one-liner: drops bare
   `"0"`, logs loudly (structural backstop).
6. Data (via script): ~12 categories, ~132 keywords (EXACT default; phrasing
   variants as extra keywords/CONTAINS), 100 responses (single-response per
   category — the unhonored-`order` quirk becomes irrelevant), ~34 reply
   objects, 2 settings, ~24 re-hosted media files.
7. Admin UI hints on existing intents/reply-objects/settings pages
   (`$ref`-at-end guidance, template placeholder help). No new routes.
8. Tests: import idempotency + hard fails + silent-drop + overlap gate;
   `render_welcome` pure cases; exact-`"0"` branch (incl. HUMAN-mode loss and
   phone-regex non-conflict); keyword-guard drop; no welcome on unfollow.

OUT (explicitly not this task):

- Unfollow replies / BLOCK-UNBLOCK handling (LINE gives no reply token on
  unfollow; enum values are dead).
- Renderer fixes (`IntentResponse.order` honoring, outgoing-Flex-body logging,
  `$`-greediness) — documented quirks, separate tasks.
- Migrating Sheet2/FriendHistory rows (PDPA personal data of ~2k citizens;
  jsk-app logging + pseudonym layer starts clean).
- Rebuilding the imagemap as a persistent rich menu (imagemap object is the
  faithful port; rich-menu variant is an optional follow-up).
- Production cutover sequencing / LINE OA switching (ops decision, separate).
- Rotating the leaked LINE + Telegram tokens hardcoded in legacy `Code.gs`
  (urgent ops task, flagged to owner — NOT bundled here).

## 5. Acceptance criteria

- Dry-run on the real `moj-skn-bot.xlsx` Sheet1 reports 100 pairs / 81 silent /
    junk rows with zero writes; `--apply` twice converges (second run: zero changes).
- New follower receives the welcome text once; refollower gets the welcome-back
  text with the correct count; blank template sends nothing; follow bookkeeping
  never breaks even if rendering fails.
- Bare `0` opens a staff handoff (in-hours greeting + queue Flex; after-hours
  notice + WAITING session); `08x-xxx-xxxx` still hits phone flow; `10`, `20`,
  `101` never trigger handoff; removing `"0"` from any keyword list cannot break
  the guard.
- All 28 image answers render (self-hosted or flagged hotlink); flex carousels
  arrive whole (no hero-strip); replies cap at 5 balloons; no-match text stays
  silent; backend suite + new tests green; `node --check`-style syntax gates pass
  for scripts.

## 6. Risks & open decisions (proposed answers for review)

- Welcome copy: default to legacy Thai texts (first-time + welcome-back);
  owner may rewrite before launch — setting is admin-editable anytime.
- Sheet1 A–K headers: script maps by header name with positional fallback;
  dev verifies against the real xlsx during implementation.
- 28 image URLs: dev checks fetchability at implementation; unfetchable ones
  stay hotlinked and are flagged in the import report.
- `ZERO_HANDOFF_ENABLED` default ON (legacy parity); kill-switch stays.
- Outgoing-Flex logging + `order` quirks accepted as-is (documented, out of scope).
- Follow reply uses the event outbox drained post-commit (no ghost sends);
  implementation must thread the outbox through `handle_follow_event`
  (verification note from arena synthesis — resolve in PRP plan).
