# Verify admin browser matrix

Goal: record real browser results for every admin route before any fix lands. Each row gets filled by Tasks 2 through 5 of docs/PRP-admin-browser-verification.md.

## Status (25 ต.ค. 2026 — code-evidence ครบ, browser pass ค้าง)

ตรวจด้วยการอ่านโค้ดจริงเสร็จทั้ง 8 ข้อ P1 แล้ว (หลักฐานใน `.audit/browser-verify/`)
สรุปคำตัดสินดู `docs/VERIFY-admin-browser-report.md` ขั้น browser (เปิดจอจริง+ถ่ายภาพ) ยังค้าง
ตาม `docs/PRP-admin-browser-verification.md` Task 2–5 — สเปกเปล่ารอที่ `frontend/e2e/admin-audit-verify/`

P1 ที่พังจริงตามโค้ดและเส้นทางที่เกี่ยว:
- NAV-01 (ค้นหามือถือ): ทุก route ที่มีแถบบน (`layout.tsx`) — จอ 360px พัง, 1280px ใช้ได้
- NAV-02 (เมนู/สิทธิ์): `/admin/bookings` สำหรับ AGENT — เมนูโชว์แต่โดน guard เด้งกลับ `/admin/live-chat`
- SAFE-01 (ออก 2 แบบ): ทุก route (sidebar) vs UserMenu
- SAFE-02/03 (ปิดตอนรอ/ลบเบิ้ล): `/admin/requests` (ลบ), ทุก ConfirmDialog ตอน pending
- A11Y-01 (ลิ้นชักมือถือ): ทุก route จอ 360px
- A11Y-02 (เตือนหมดเวลา): ทุก route ยกเว้น `/admin/live-chat` (หน้านั้นไม่มีเตือนเลย — ไม่ใช่บั๊กซ้ำ)
- NET-01 (ผลเก่าทับใหม่): `/admin/requests`

## Legend

Cell values stay simple. Use pass, fail, or blocked. Blocked needs a reason in notes. Evidence lives under .audit/browser-verify/ and each fail links its screenshot or note there.

## Matrix

| route | SUPER_ADMIN | ADMIN | AGENT | 360px | 1280px | keyboard | touch | notes |
|---|---|---|---|---|---|---|---|---|
| /admin | | | | | | | | |
| /admin/access-requests | | | | | | | | |
| /admin/analytics | | | | | | | | |
| /admin/audit | | | | | | | | |
| /admin/auto-replies | | | | | | | | |
| /admin/auto-replies/[id] | | | | | | | | |
| /admin/bookings | | | | | | | | |
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
| /admin/live-chat | | | | | | | | |
| /admin/live-chat/analytics | | | | | | | | |
| /admin/reply-objects | | | | | | | | |
| /admin/reply-objects/new | | | | | | | | |
| /admin/reply-objects/[object_id]/edit | | | | | | | | |
| /admin/reports | | | | | | | | |
| /admin/requests | | | | | | | | |
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
