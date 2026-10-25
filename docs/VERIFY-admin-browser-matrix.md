# Verify admin browser matrix

Goal: record real browser results for every admin route before any fix lands. Each row gets filled by Tasks 2 through 5 of docs/PRP-admin-browser-verification.md.

## Status (25 ต.ค. 2026 — browser pass done, 10/10 specs green)

Browser pass Tasks 2-5 done in real Chromium (specs in `frontend/e2e/admin-audit-verify/`, stills in `.audit/browser-verify/*.png`). Per-P1 verdicts are in Results below.

Browser correction to the code-read: NAV-02 — the AGENT console has no admin sidebar at all, so there is no Appointments item to click (stronger than "menu shows but guard kicks"); opening the URL directly snaps back to `/admin/live-chat`.

P1 ที่พังจริงตามโค้ดและเส้นทางที่เกี่ยว:

- NAV-01 (ค้นหามือถือ): ทุก route ที่มีแถบบน (`layout.tsx`) — จอ 360px พัง, 1280px ใช้ได้
- NAV-02 (เมนู/สิทธิ์): `/admin/bookings` สำหรับ AGENT — เมนูโชว์แต่โดน guard เด้งกลับ `/admin/live-chat`
- SAFE-01 (ออก 2 แบบ): ทุก route (sidebar) vs UserMenu
- SAFE-02/03 (ปิดตอนรอ/ลบเบิ้ล): `/admin/requests` (ลบ), ทุก ConfirmDialog ตอน pending
- A11Y-01 (ลิ้นชักมือถือ): ทุก route จอ 360px
- A11Y-02 (เตือนหมดเวลา): ทุก route ยกเว้น `/admin/live-chat` (หน้านั้นไม่มีเตือนเลย — ไม่ใช่บั๊กซ้ำ)
- NET-01 (ผลเก่าทับใหม่): `/admin/requests`

## Legend

Cell values stay simple. Use pass, fail, or blocked. Blocked needs a reason in notes. Evidence lives under .audit/browser-verify/ and each fail links its screenshot or note there. fail = bug reproduced pre-fix in a real browser. Blank = not covered by this browser pass.

## Results (browser pass 25 Oct 2026 — `npx playwright test admin-audit-verify`, 10/10 passed)

| P1 | verdict | evidence |
|---|---|---|
| NAV-01 mobile search dead | fail | `nav-01-mobile-dead-input.png` — 360px input has no handler, typing + Enter changes nothing |
| NAV-01 desktop palette | pass | `nav-01-desktop-palette.png` — 1280px palette dialog opens |
| NAV-02 AGENT vs Appointments | fail | `nav-02-agent-console.png`, `nav-02-agent-snapped-back.png` — no Appointments affordance; direct URL snaps back to live-chat |
| SAFE-01 two logouts | fail | `safe-01-sidebar-logout.png` (no-confirm DIV), `safe-01-usermenu-confirm.png` (UserMenu asks first) |
| SAFE-02 Escape mid-request | fail | `safe-02-escape-dismissed.png` — Escape closes the dialog while DELETE is in flight |
| SAFE-02 backdrop mid-request | fail | `safe-02-backdrop-dismissed.png` — backdrop click closes the dialog while DELETE is in flight |
| SAFE-03 double confirm | fail | `safe-03-double-delete.png` — fast double-click sends 2 DELETE requests |
| A11Y-01 mobile drawer | fail | `a11y-01-drawer-open.png`, `a11y-01-focus-escaped.png` — Tab reaches the page behind; Escape does not close |
| A11Y-02 session warning | fail | `a11y-02-no-warning.png` — absent on fresh page (needs 25 idle min, untriggerable in-test); rendered markup is plain divs with no dialog role (code fact) |
| NET-01 stale overwrites fresh | fail | `net-01-stale-wins.png` — slow first search resolves last and replaces the newest query |

## Matrix

| route | SUPER_ADMIN | ADMIN | AGENT | 360px | 1280px | keyboard | touch | notes |
|---|---|---|---|---|---|---|---|---|
| /admin | | pass | | fail | pass | fail | | NAV-01 dead mobile search; A11Y-01 drawer focus escapes — `nav-01-*`, `a11y-01-*` |
| /admin/access-requests | | | | | | | | |
| /admin/analytics | | | | | | | | |
| /admin/audit | | | | | | | | |
| /admin/auto-replies | | | | | | | | |
| /admin/auto-replies/[id] | | | | | | | | |
| /admin/bookings | | | fail | | | | | AGENT: no menu affordance, direct URL snaps to live-chat — `nav-02-*` |
| /admin/canned-responses | | | | | | | | |
| /admin/chat-histories | | | | | | | | |
| /admin/chat-histories/[lineUserId] | | | | | | | | |
| /admin/chatbot | | | | | | | | |
| /admin/chatbot/broadcast | | | | | | | | |
| /admin/chatbot/broadcast/new | | | | | | | | |
| /admin/chatbot/broadcast/[id] | | | | | | | | |
| /admin/chatbot/friends | | | | | | | | |
| /admin/chatbot/history | | | | | | | | |
| /admin/design-system | | | | | | | | |
| /admin/files | | | | | | | | |
| /admin/friends | | | | | | | | |
| /admin/friends/history | | | | | | | | |
| /admin/friends/[lineUserId] | | | | | | | | |
| /admin/health | | | | | | | | |
| /admin/image-resize | | | | | | | | |
| /admin/live-chat | | | pass | | | | | AGENT home console renders; snap-back target — `nav-02-*` |
| /admin/live-chat/analytics | | | | | | | | |
| /admin/reply-objects | | | | | | | | |
| /admin/reply-objects/new | | | | | | | | |
| /admin/reply-objects/[object_id]/edit | | | | | | | | |
| /admin/reports | | | | | | | | |
| /admin/requests | | fail | | | pass | fail | | SAFE-02/03 + NET-01 reproduced — `safe-02-*`, `safe-03-*`, `net-01-*` |
| /admin/requests/create | | | | | | | | |
| /admin/requests/kanban | | | | | | | | |
| /admin/requests/[id] | | | | | | | | |
| /admin/rich-menus | | | | | | | | |
| /admin/rich-menus/aliases | | | | | | | | |
| /admin/rich-menus/new | | | | | | | | |
| /admin/rich-menus/[id]/edit | | | | | | | | |
| /admin/rich-menus/[id]/insights | | | | | | | | |
| /admin/settings | | | | | | | | |
| /admin/settings/booking | | | | | | | | |
| /admin/settings/business-hours | | | | | | | | |
| /admin/settings/custom | | | | | | | | |
| /admin/settings/line | | | | | | | | |
| /admin/settings/n8n | | | | | | | | |
| /admin/settings/permissions | | | | | | | | |
| /admin/settings/telegram | | | | | | | | |
| /admin/taxonomy | | | | | | | | |
| /admin/users | | | | | | | | |
| /admin/users/[id] | | | | | | | | |

## Sources

Route rows come from find over frontend/app/admin for page.tsx files. Nav roles come from frontend/app/admin/layout.tsx menuGroups and frontend/lib/nav-access.ts isNavItemVisible. Existing admin e2e specs live in frontend/e2e and stay untouched until Tasks 2 through 5 add specs under frontend/e2e/admin-audit-verify/.
