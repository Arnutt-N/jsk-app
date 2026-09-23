# Session Summary — Cline — วันอังคารที่ 22 กันยายน พ.ศ. 2569 เวลา 17:00 น. (Asia/Bangkok, UTC+07:00)

- **Agent**: Cline
- **Timestamp**: 2026-09-22 17:00:26 +07:00 (วันอังคารที่ 22 กันยายน พ.ศ. 2569 เวลา 17:00 น.)
- **Workspace**: `D:\genAI\jsk-app`
- **Branch**: `feat/feature-line-audit-fix-map` (ahead 10, ยังไม่ commit งานรอบนี้)
- **Handoff ต้นทางที่รับมา**: `project-log-md/codex/2026-09-22-feature-line-audit-fix-map-handoff.md` (Codex, 10:00:29 ICT — แผนรอบ 5 NOT READY 1/10, สั่งแก้ B2/C1/C2/D7 ก่อนเขียนโค้ด)

## เป้าหมายของรอบนี้
แก้แผน + เอกสาร (plan + PRD) ให้ตรงโค้ดจริงแบบไม่พังกลางทาง โดยยังไม่แตะโค้ดโปรแกรมจริง แล้วส่งตรวจแผนแบบคู่จนได้ READY ก่อนเริ่ม Wave A

## งานที่เสร็จแล้ว
1. **อ่าน handoff + ตรวจข้อ 1 เทียบของจริงครบ** — เปิดแผน/PRD/ใบตรวจรอบ 5 เทียบ `credential_service.py:74-82`, `analytics_service.py:433-451`, `admin_broadcast.py`, `broadcast_service.py:173-227`, `media.py:348`, หน้าจอ `frontend/app/admin/chatbot/broadcast/*` + `frontend/app/admin/analytics/page.tsx`
2. **รับทางเลือกจากผู้ใช้** — C1 = ผ่าตัดใหญ่ (ถามครั้งเดียว, data statements ≤2), B2 = เก็บตารางสำรองยาวแต่ล็อกแน่น
3. **แก้แผน + PRD (2 ไฟล์เท่านั้น)**:
   - `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md` (+~1144 บรรทัดสุทธิ)
   - `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md` (งบ query, TTL 120s, ปุ่ม preview, backup เข้ารหัส)
   - B2: `_payload_for` dict-shape ต่อคีย์ (LINE/TELEGRAM/CUSTOM), `_DENY_MIGRATE` 6 + `_ROOT_KEYS` 2 (env-only), backup เก็บแต่ blob เข้ารหัส + `migrated_by` marker + ไม่ DROP + purge แบบ explicit + audit, downgrade ลบเฉพาะ marker + seed ของเก่าต้องรอด + ตรวจ `upgrade→downgrade→upgrade`
   - C1: `_get_dashboard_row` single-statement (scalar-subquery + JSON subquery volume/heatmap) + FCR/abandon สูตร exact เหมือน `_fcr_rate`/`_abandonment_rate` + คง shape จอเดิมครบ (trends 6 + volume + heatmap + funnel + percentiles) + เทส cache-hit/empty=0/Redis-down + `import json/aliased` + หมายเหตุ FCR today/yesterday vs 7-day
   - C2: เพิ่มไฟล์จอ `new/page.tsx` + `[id]/page.tsx` + เทสปุ่ม dry-run, `dry_run` คืน preview ไม่ persist, retry 3 รอบ exponential + โมเดล `broadcast_failed_recipient` (hash + unique) + migration `b8c9d0e1f2a3` + ตรวจ heads ก่อนรัน + หมายเหตุ `_build_messages` shape
   - D7: static `resize-ticket` ก่อน dynamic `{media_id}` (:348) + red-phase try/except แทน patch ตรง + import ครบ
4. **ส่งตรวจแผน 4 รอบ (dual review ทุกรอบ)**:
   - รอบ 6: A PASS / B FAIL → ตัดสิน NOT READY 6/10 (ปัดตก 3 ข้อของ B, เจอของจริง 2 ข้อใหม่: C2 ขาด migration + C1 FCR 100/0)
   - แก้ตามรอบ 6: เติม C2 migration + สูตร FCR/abandon exact + หมายเหตุลำดับกุญแจ B2→D7
   - รอบ 7: A PASS / B PASS → READY 9/10
   - แก้ตามรอบ 7: หมายเหตุ heads-check + dry-run shape + query_counter scope + FCR window
   - รอบ 8: A PASS / B PASS → READY 9/10 (เหลือแก้ถ้อยคำ query_counter จุดเดียว)
   - แก้ถ้อยคำ query_counter ให้ตรง (engine ตัวเดียว, auth ถูก override จึงไม่นับ)
   - รอบ 9: A PASS / B PASS → READY 9/10
5. **ตรวจความปลอดภัยทุกครั้ง**: `git diff --check` ผ่าน (เหลือแค่เตือน CRLF→LF ของไฟล์ PRD), ไม่แตะโค้ดจริง, ไม่ commit/push/PR

## ใบตรวจที่เขียนใหม่ในรอบนี้ (review-only, ไม่แก้แผนตอนตรวจ)
- `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round6-2026-09-22.md` (NOT READY 6/10)
- `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round7-2026-09-22.md` (READY 9/10)
- `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round8-2026-09-22.md` (READY 9/10)
- `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round9-2026-09-22.md` (READY 9/10)

## งานค้าง (pending)
1. **เริ่มเขียนโค้ดจริง Wave A→B→C→D** ตามแผนทีละ task (TDD red→green→regression, เทสทุกขั้น, เคารพเจ้าของไฟล์ liff.py/media.py)
2. **ก่อนรัน C2 migration**: สั่ง `alembic heads` ต้องเหลือหางเดียว ถ้า 2 หางให้ merge ก่อน แล้วค่อยตั้ง `down_revision`
3. **ตอนลงมือ**: ยืนยัน `_build_messages` รับ SimpleNamespace preview, ตัวนับ query ถ้ามี engine ใหม่ต้องฟังเพิ่ม (ห้ามแก้เลขงบ ≤2)
4. **git**: งานรอบนี้ยังไม่ commit — ต่อไปต้อง commit→push→PR→merge ตาม `git-workflow` (ตอนนี้ ahead 10 + ไฟล์ใหม่ untracked หลายไฟล์ อย่าเหมารวมของค้างอื่น)

## ข้อควรระวัง (gotchas)
- ไฟล์แผนใหญ่มาก (~4000+ บรรทัด) เครื่องมืออ่านอาจขึ้น `[outdated]` ถ้าแก้ค้างอยู่ — ตรวจรอบหน้าควรรันตอนไฟล์นิ่งแล้ว
- `search_codebase` ไทม์เอาต์กับคำกว้าง — ใช้ `Select-String` แคบๆ แทน
- ไฟล์ PRD มีบรรทัด CRLF ปน 2 บรรทัด — Git เตือนตอน diff แต่ไม่พัง
- งานค้าง untracked ของผู้ใช้เยอะ (graphify-out, .qwen ฯลฯ) — ห้ามแตะ/ลบก่อน commit แผน

## สถานะสุดท้าย
แผน **READY 9/10 (รอบ 9, เห็นพ้อง 2 เสียง)** — พร้อมเริ่ม Wave A ได้เลยถ้าผู้ใช้สั่ง
