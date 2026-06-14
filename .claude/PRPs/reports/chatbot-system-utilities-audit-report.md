# Audit Report: Chatbot Management & System Management

> **Single source of truth** สำหรับงาน audit/hardening 2 โดเมน (อ้างอิงโดยทุก phase)
> **Date**: 2026-06-14 · **Method**: 3 parallel code-explorer agents + manual code reading
> **Scope**: admin dashboard (Next.js 16 frontend + FastAPI backend) — ไม่รวม LIFF

---

## 1. Executive Summary

ฟีเจอร์ที่ "ดูครบ" หลายส่วน **ทำงานไม่ครบ/ผิด/ไม่ปลอดภัย** จริง:
- 🔴 Role `DIRECTOR`/`HEAD` ถูกตั้ง policy ให้ assign/self-assign ได้ แต่ **เข้าไม่ถึง endpoint** (dead policy) — **แก้แล้วใน Phase 1**
- 🔴 Broadcast ตั้งเวลาได้แต่ไม่มี scheduler รันจริง → ข้อความตั้งเวลาไม่เคยส่ง
- 🔴 Chat Histories export แค่ `.txt` ทั้งที่ backend CSV มีแล้ว
- 🔴 Rich menu compact ขนาดผิด → LINE reject
- 🟡 Audit Log ครอบแค่ live-chat + request edits — ไม่ครอบ User/Settings/Permission changes
- 🟡 Permission ครอบแค่ request workflow — ไม่มี access control สำหรับ Chatbot/File/User/Settings

## 2. Role & Permission Findings (สำคัญสุด)

### Role hierarchy จริง = 6 ระดับ (CLAUDE.md ระบุผิดว่า 4)
`backend/app/models/user.py:7-28`
| Role | ความหมาย | สิทธิ์ request (DEFAULT_POLICY) |
|---|---|---|
| SUPER_ADMIN | เจ้าของระบบ | ทุกสิทธิ์ + แก้ permission |
| ADMIN | สำนักงาน | ทุกสิทธิ์ + แก้ permission |
| DIRECTOR | ผอ. | assign/self-assign (ไม่ revert/edit-details/แก้ permission) |
| HEAD | หัวหน้าฝ่าย | assign/self-assign |
| AGENT | เจ้าหน้าที่ (→ "Operator") | ไม่มีสิทธิ์ — ผู้รับงาน |
| USER | ประชาชน (LIFF) | ส่งคำร้องเท่านั้น |

### Permission engine ปัจจุบัน (ดี — extend ได้)
`backend/app/core/permissions.py` — DB-backed (`permission_settings` table) + in-process cache + `DEFAULT_POLICY` fallback + `ensure_seed_rows()` self-heal + lockout safeguard. มี 5 keys: `assign_request`, `self_assign_request`, `revert_approval`, `edit_request_details`, `edit_permission_settings`.

### 🔴 Dead policy (CRITICAL) — แก้แล้ว Phase 1
ทุก request endpoint ใช้ `get_current_admin`=[ADMIN, SUPER_ADMIN] → DIRECTOR/HEAD ถูกบล็อกที่ประตู, `can_assign`/`can_self_assign` ที่อนุญาต DIRECTOR/HEAD ไม่มีวันถูกเรียกถึง. **Phase 1 fix**: gate ใหม่ `get_current_manager`=[SUPER_ADMIN, ADMIN, DIRECTOR, HEAD] ใช้กับ request view/workflow endpoints (DELETE คง admin), `can_*` ชั้นในยังป้องกัน revert/edit-details.

## 3. Corrections to Initial Agent Audit

| Agent claim | ข้อเท็จจริง |
|---|---|
| `deps.py:133` get_current_admin ขาด DIRECTOR/HEAD | จริง ๆ `:117` คือ `get_current_admin` ([ADMIN, SUPER_ADMIN] — ไม่มี AGENT ด้วยซ้ำ); `:133` คือ `get_current_staff` |
| DIRECTOR/HEAD login ไม่ได้ | **login แก้แล้ว** 2026-05-04 (`auth.py:24-30` `_ADMIN_AUTH_ROLES` รวม DIRECTOR/HEAD/AGENT + test ครอบ) — ปัญหาคือ access endpoint หลัง login |
| Audit Log บันทึกแค่ live-chat | request edits (revert/assign/edit-details) **ก็ log แล้ว** ผ่าน `core/audit.py` `create_audit_log`; ที่ขาดคือ User/Settings/Permission CRUD |

## 4. Chatbot Management Gaps (ranked)

| # | Severity | Gap | Location | Phase |
|---|---|---|---|---|
| 1 | 🔴 HIGH | Broadcast scheduler ไม่มีจริง (scheduled_at เก็บแต่ไม่ส่ง) | `broadcast_service.py:229-245` | 4 |
| 2 | 🔴 HIGH | Chat Histories export แค่ .txt (backend CSV ไม่ได้ต่อ) | `chat-histories/[lineUserId]/page.tsx:171-185` vs `admin_export.py` | 4 |
| 3 | 🔴 HIGH | Rich menu compact hard-code height 1686 (ควร 843) → LINE reject | `rich_menus.py:47-73` | 4 |
| 4 | 🟡 MED | Reply Objects ขาด Template/Coupon/Text v2/Quick reply (มี 8/12 types) | `reply-objects/page.tsx:27` | 4 |
| 5 | 🟡 MED | Narrowcast/multicast ไม่มี UI (audience builder) | `broadcast/new/page.tsx:382-389` | 4 |
| 6 | 🟡 MED | Multi-rich-menu switching (`richmenuswitch`) ไม่มี | `rich-menus/new/page.tsx:441-447` | 4 |
| 7 | 🟡 MED | Response ordering UI ไม่มี (มี order column) | `auto-replies/[id]/page.tsx` | 4 |
| 8 | 🟢 LOW | `/admin/chatbot/history` + `/admin/chatbot/friends` เป็น stub | `chatbot/history/page.tsx` | 4 |
| 9 | 🟢 LOW | Broadcast detail label bugs (ไทยผิด) | `broadcast/[id]/page.tsx:378-417` | 4 |

## 5. System Management Gaps (ranked)

| # | Severity | Gap | Location | Phase |
|---|---|---|---|---|
| 1 | 🔴 CRIT | DIRECTOR/HEAD เข้า request endpoints ไม่ได้ (dead policy) | `deps.py` + `admin_requests.py` | **1 (done)** |
| 2 | 🔴 HIGH | frontend StaffRole type ขาด DIRECTOR/HEAD | `layout.tsx`, `UserMenu.tsx` | **1 (done)** |
| 3 | 🟡 MED | Audit Log ไม่ครอบ User/Settings/Permission CRUD | `admin_audit.py` + write sites | 5 |
| 4 | 🟡 MED | File เก็บเป็น BLOB ใน DB + thumbnail_url ไม่เคย populate | `media_file.py:87` | 5 (Image Resize) |
| 5 | 🟡 MED | Permission ครอบแค่ request workflow | `permissions.py` | 3 |
| 6 | 🟢 LOW | AssignModal hardcode `?role=AGENT` | `AssignModal.tsx:42` | 2/3 |
| 7 | 🟢 LOW | report_operators ใช้ string literal "ADMIN" แทน enum | `admin_reports.py` | 5 |
| 8 | 🟢 LOW | "System Management" label (rename → "System and Utilities") | `layout.tsx:179` | 2 |

## 6. AGENT Rename Blast Radius (สำหรับ Phase 2)

Decision: **เปลี่ยนแค่ display label `AGENT`→"Operator", เก็บ enum/DB ไว้.** ความหมาย: "Operators"=AGENT เท่านั้น; "Staff"=คำรวม internal users (ไม่รวม USER).

- **Backend enum** (ห้ามแตะ): `models/user.py:27`, + ~18 จุดอ้าง `UserRole.AGENT` (admin_users, auth, ws_live_chat, deps, live_chat_service, tests, migrations)
- **DB column** `assigned_agent_id` (service_request) — คงชื่อ (label-only rename ไม่กระทบ)
- **Frontend labels** (เปลี่ยนได้): `users/page.tsx:63,71,82` (แสดง "Staff" อยู่แล้ว), `users/[id]/page.tsx:37,44`, `settings/permissions/page.tsx:32,40`
- แนะนำ: central role-label map (`lib/constants/roles.ts`) เป็น source of truth

## 7. Phase 1 Fixes Applied (2026-06-14)

| Fix | File |
|---|---|
| gate `get_current_manager` + `get_current_staff` += DIRECTOR/HEAD | `backend/app/api/deps.py` |
| 10 request endpoints → manager (DELETE คง admin) | `backend/app/api/v1/endpoints/admin_requests.py` |
| StaffRole type += DIRECTOR/HEAD | `frontend/app/admin/layout.tsx`, `components/admin/UserMenu.tsx` |
| Service Requests nav += DIRECTOR/HEAD | `frontend/app/admin/layout.tsx` |
| pure `isNavItemVisible` helper (testable) | `frontend/lib/nav-access.ts` |
| tests: gates (3), request authz (2), nav (7) | `test_deps_gates.py`, `test_admin_requests_endpoints.py`, `nav-access.test.ts` |

## 8. Design System — PENDING

Agent 3 (Design System audit) ยังไม่ส่งผล ณ เวลาเขียนรายงาน — ผลจะเติมในส่วนนี้ตอนเริ่ม **Phase 6** (Design System). ประเด็นที่ต้อง audit: design tokens single-source, component library consistency, theming, a11y, hardcoded values.

## 9. Recommendations per Phase

- **Phase 2**: rename label `AGENT`→Operator (central map) + "System Management"→"System and Utilities" (`layout.tsx:179`) + Image Resize menu placeholder. แก้ `AssignModal.tsx:42` hardcode role.
- **Phase 3**: extend `permission_settings` — keys ใหม่ Chatbot/System + UI 3-module + presets + per-module override. ทบทวน nav ของ Operator/DIRECTOR/HEAD เต็มรูปแบบ.
- **Phase 4**: broadcast scheduler (APScheduler vs Vercel cron) + CSV wiring + rich menu size fix + Reply Objects ครบ types + narrowcast/multi-menu.
- **Phase 5**: Image Resize utility (Pillow/sharp) + audit logging ครอบ User/Settings/Permission + reports polish.
- **Phase 6**: design tokens + component library + docs (ใช้ `impeccable` + `andrej-karpathy-skills`).

---
*Generated: 2026-06-14 · Status: living document — updated per phase*
