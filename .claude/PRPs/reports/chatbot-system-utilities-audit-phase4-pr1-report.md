# Implementation Report: Phase 4 PR1 — Chatbot Management Hardening (Must-fixes)

## Summary
ปิด CRITICAL/HIGH gaps ของ Chatbot Management ครบ 4 workstream: (1) broadcast scheduler ในกระบวนการ (in-process asyncio loop) ที่ส่ง scheduled broadcast จริง + idempotent, (2) wire ปุ่ม Export หน้า chat-histories ให้ดาวน์โหลด CSV จาก backend, (3) แก้ rich menu compact ให้ height = 843 ตาม template, (4) แก้ label bug หน้า broadcast detail. ผ่าน code review (0 CRITICAL) และแก้ทุก HIGH/MEDIUM/LOW ที่ review พบ

## Assessment vs Reality
| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large |
| Confidence | 9/10 | สำเร็จ single-pass (มี review fixes เล็กน้อย) |
| Files Changed | ~12 (4 create, ~8 update) | 11 (3 create + 8 update) |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `get_due_scheduled()` + SKIP LOCKED | ✅ Complete | `broadcast_service.py` |
| 2 | `tasks/broadcast_scheduler.py` (mirror session_cleanup) | ✅ Complete | poll 30s, audit log `auto_send_broadcast` |
| 3 | เสียบ scheduler ใน `main.py` lifespan + export ใน `tasks/__init__.py` | ✅ Complete | start/stop คู่กับ cleanup task |
| 4 | rich menu `resolve_rich_menu_size()` แทน hard-code 1686 | ✅ Complete | compact=843 / large=1686 (2 จุด) |
| 5 | CSV export wiring หน้า chat-histories | ✅ Complete | ปุ่ม CSV (backend) + คง TXT เดิม |
| 6 | broadcast detail label bug | ✅ Complete | **5 จุด** (มากกว่าแผน 3 — deviation ด้านล่าง) |
| 7 | unit tests (scheduler + rich menu size) | ✅ Complete | 16 tests ใหม่ |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✅ Pass | frontend `tsc --noEmit` ✅ · eslint ไฟล์ที่แก้ ✅ · backend import ✅ |
| Unit Tests | ✅ Pass | 27 passed (16 ใหม่ + 11 broadcast regression) |
| Build / Collect | ✅ Pass | `pytest --collect-only` 405 tests, ไม่มี import regression |
| Integration | ⏳ Manual | scheduler in-process — ต้องทดสอบกับ DB + LINE จริง (manual checklist) |
| Edge Cases | ✅ Pass | empty due / send-fail-no-propagate / continue-after-fail / compact·large·empty·None |

## Files Changed
| File | Action | Notes |
|---|---|---|
| `backend/app/tasks/broadcast_scheduler.py` | CREATED | scheduler loop + start/stop |
| `backend/tests/test_broadcast_scheduler.py` | CREATED | 4 tests |
| `backend/tests/test_rich_menu_size.py` | CREATED | 12 tests |
| `backend/app/services/broadcast_service.py` | UPDATED | + `get_due_scheduled()` |
| `backend/app/tasks/__init__.py` | UPDATED | export start/stop scheduler |
| `backend/app/main.py` | UPDATED | lifespan start/stop scheduler |
| `backend/app/api/v1/endpoints/rich_menus.py` | UPDATED | size resolver (2 จุด) |
| `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` | UPDATED | CSV export handler + button |
| `frontend/app/admin/chatbot/broadcast/[id]/page.tsx` | UPDATED | 5 label fixes |
| `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md` | UPDATED | Phase 4 progress |

## Deviations from Plan
1. **Label bug: แก้ 5 จุด (แผนระบุ 3)** — พบเพิ่ม send modal title ("รายละเอียด Broadcast"→"ยืนยันการส่ง Broadcast") และปุ่มยืนยันใน modal ("ส่งแล้ว"→"ส่ง") เป็น copy-paste bug ชุดเดียวกัน แก้ครบเพื่อความสมบูรณ์
2. **Export UI = 2 ปุ่ม (CSV + TXT)** แทน dropdown — ลด risk ไม่ต้องสร้าง component ใหม่ (user ถามค้างไว้ ตัดสินใช้ค่า default ตามแผน)
3. **rich menu helper อยู่ใน `rich_menus.py`** ไม่แยกไฟล์ — KISS (แผนเปิดทางเลือกไว้แล้ว)

## Code Review (code-reviewer agent)
| Severity | Count | Resolution |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 2 | ✅ แก้: (1) เพิ่ม `await db.rollback()` ใน scheduler except (กัน session ค้างเมื่อ guard-raise), (2) แก้ docstring/comment idempotency ให้ตรงความจริง (durable guard = SCHEDULED→SENDING, ไม่ over-claim เรื่อง lock multi-instance) |
| MEDIUM | 2 | ✅ แก้ 401 case ใน CSV export; lock-duration ครอบด้วย doc reword |
| LOW | 2 | ✅ แก้ PEP8 blank line, `asyncio.Task | None` |

## Issues Encountered
- **Dev environment**: backend tests รันใน WSL `venv_linux` (pytest 9.0.2); frontend tooling ก็ผ่าน WSL (`tsc`/`eslint` ไม่ทำงานตรงจาก Windows git bash) — ตรงกับ memory `user_dev_environment`

## Tests Written
| Test File | Tests | Coverage |
|---|---|---|
| `test_broadcast_scheduler.py` | 4 | `_process_due_broadcasts`: noop / send+audit / fail-no-propagate+rollback / continue-after-fail |
| `test_rich_menu_size.py` | 12 | compact·large·empty·None·case-insensitive height mapping |

## Next Steps
- [ ] `/prp-pr` เปิด PR (PR1)
- [ ] Manual: ตั้งเวลา broadcast +1 นาที → ยืนยันส่งจริง; CSV เปิด Excel ภาษาไทย; sync rich menu compact
- [ ] Phase 4 **PR2**: Reply Objects ครบ type + preview
