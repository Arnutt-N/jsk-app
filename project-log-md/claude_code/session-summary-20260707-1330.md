# Session Summary — claude_code — 2026-07-07T13:30:00+07:00

**Branch**: `main`  **HEAD**: `a2083f9`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260707-1330.json`

## Objective
Remote-control bug session: 6 issues from LIVE PROD testing. FIXED #1a (a2083f9): removed fake operator presence dot from navbar UserMenu + sidebar SidebarUserInfo (sidebar was hardcoded status=online, no socket to back it). tsc clean. Investigated ALL 6 root causes via code-read (see next steps). AWAITING prod URL from user to reproduce #2/#3 + screenshot #4. Session cost went critical (~130 usd) so checkpointing findings.

## Completed
- Remote-control bug session: 6 issues from LIVE PROD testing. FIXED #1a (a2083f9): removed fake operator presence dot from navbar UserMenu + sidebar SidebarUserInfo (sidebar was hardcoded status=online, no socket to back it). tsc clean. Investigated ALL 6 root causes via code-read (see next steps). AWAITING prod URL from user to reproduce #2/#3 + screenshot #4. Session cost went critical (~130 usd) so checkpointing findings.

## Next Steps
- AWAITING: user will paste prod frontend URL (Vercel) so I navigate an MCP tab (shares Chrome login cookie) to see real network/console. tabs_context has an MCP tab ready (group 862674545).
- #2 canned-responses EMPTY on prod: endpoint is OLD (added commit b547623, registered in api.py long ago) so NOT a missing-deploy. It uses get_current_admin (ADMIN/SUPER_ADMIN ONLY) vs live-chat get_current_staff (all roles incl AGENT/HEAD/DIRECTOR). Frontend GET /api/v1/admin/canned-responses (relative, cookie auth) expects data.items; backend returns {items:[],total} correctly. Reproduce to confirm 403(role) vs 200-empty(no seed rows) vs 500(missing table/migration).
- #3 FREEZE on selecting a user: frontend code is fine (useChatRoom effect setMessages([]) then fetchChatDetail+fetchMessagesPage, all null-guarded, no render loop; ChatHeader guards currentChat?). Likely backend GET /conversations/{id}/messages error/hang on prod. Reproduce console+network. ALSO user wants an unread-divider (best-practice 'unread messages' / 'previous session' separator) in ChatArea.
- #4 shrink status dots: DO NOT guess size again - user said prior shrink was 'still too big'. Get a real screenshot first, then calibrate. Dots today: CustomerPanel h-3.5 w-3.5 ring-2 (80px avatar), ChatHeader h-3.5 (lg 48px), ConversationItem h-3 (40px), ProfileDropdown w-2 (sm 32px). navbar/sidebar dots already removed.
- #5 operator name on bubble: backend is 100pct CORRECT (live_chat_service.send_message sets operator_name=operator.display_name; saved via line_service.save_message; broadcast on both WS ws_live_chat.py and REST; MessageResponse serializes it). Root cause = OLD messages rows with null operator_name OR the operator has no display_name (fallback Admin). Frontend getSenderLabel in ChatArea returns operator_name || เจ้าหน้าที่. Fix = data backfill + smarter fallback; confirm via reproduce which case it is.
- #1 customer dot: user chose 'customer dot = chat SESSION status' (current getSessionPresence logic is already correct: ACTIVE=green WAITING=amber none=gray). When reproducing, check if a session is stuck ACTIVE in DB while not really active (that would be why it showed green). Consider session-centric labels (กำลังสนทนา/รอคิว/ไม่มีเซสชัน) instead of PRESENCE_LABEL ออนไลน์ which reads like customer-online.
- #6 sidebar conversation dropdown (BIG): the 5 items removed in 6b10af0 (Pin/Mute/Archive/Spam/Delete) were ALL disabled 'coming soon' placeholders. User wants 6 REAL working features: 1 Pin conversation, 2 Delete/hide, 3 Mute notifications, 4 Spam/Archive, 5 Follow-up flag, 6 PREVIEW incoming messages (modal, view ~10 msgs WITHOUT marking read / clearing unread badge). Needs DB fields + backend endpoints + frontend. Do AFTER bugs 1-5.
- Decisions locked: navbar dot=REMOVED(done). customer dot=session status. reproduce=user opens prod browser for me. #6=implement all 6 real.

## Blockers
- _none_

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
