# PRD — ตรวจของจริงใน Browser ก่อนซ่อม (Admin Panel UX/UI Audit Verification)

> Branch: `feat/admin-browser-verification`
> Audit source: `admin-panel-ux-ui-audit.md` (branch `v0/admin-panel-ux-ui-review-a6d7fb96`, วันที่ 25 ต.ค. 2026)
> Skills invoked: `superpowers:writing-plans`, `mattpocock:to-prd`, `addyosmani:spec-driven-development` (+ project rule: AGENTS.md workflow)
> User decision (2026-10-25): ข้อ ค. ตรวจของจริงใน browser ให้ครบก่อนซ่อม

## 1. ปัญหา (ภาษาคนทั่วไป)

รายงานตรวจรอบก่อนอ่านจากโค้ดอย่างเดียว ยังไม่ได้ลองกดจริงทุกหน้า/ทุกปุ่ม อาจมีจุดที่รายงานเข้าใจผิด หรือจุดที่กดจริงแล้วพังกว่าที่คิด ก่อนสั่งซ่อมต้องรู้ว่าอันไหนพังจริง อันไหนแค่เสี่ยง

คำที่ต้องอธิบายครั้งแรก:
- **route** = ทางเข้าหน้าเว็บ เช่น `/admin/requests` คือหน้าคำร้อง
- **role** = สิทธิ์คนใช้ เช่น SUPER_ADMIN (สิทธิ์สูงสุด), ADMIN, AGENT (คนตอบแชท), VIEWER
- **viewport** = ขนาดจอ (มือถือ 360px / คอม 1280px)
- **modal** = หน้าต่างลอยที่เด้งขึ้นมาบังหน้าหลัก เช่น หน้าต่างยืนยันลบ
- **pending** = ช่วงกำลังรอผล เช่น กดลบแล้วเน็ตยังหมุนอยู่

## 2. เป้าหมายการตรวจ (ไม่ใช่การซ่อม)

1. ยืนยัน/หักล้างข้อ P1 ทั้ง 8 ข้อ: NAV-01, NAV-02, SAFE-01, SAFE-02, SAFE-03, A11Y-01, A11Y-02, NET-01
2. ทำ route-state matrix: `route × role × viewport × keyboard/touch` ว่าหน้าไหนกดได้/ติดตรงไหน
3. ส่งมอบหลักฐาน (ภาพหน้าจอ/คลิป/ผลเทส) ไม่ใช่ความเห็นลอยๆ
4. ห้ามแก้โค้ดโปรดักชันในเฟสนี้ — เขียนได้เฉพาะสคริปต์ตรวจ/โน้ต

## 3. ขอบเขต

ตรวจ:
- `/admin/*` ทุก route ที่มีใน `frontend/app/admin/` (dashboard, requests, bookings, chatbot/*, live-chat, users, files, audit, reports, settings, rich-menus, reply-objects, canned, auto-replies, access-requests, friends, health, design-system)
- ทุก modal ในเส้นทางหลัก (ConfirmDialog, LogoutConfirmDialog, SessionTimeoutWarning, Request delete)
- role หลัก: SUPER_ADMIN, ADMIN, AGENT (+ VIEWER ถ้ามีในระบบ)
- viewport: 360px (มือถือ) + 1280px (คอม), keyboard-only + touch

ไม่ตรวจ (รอบนี้):
- ประสิทธิภาพเชิงลึก (LCP/INP/CLS — ค่าวัดว่าเว็บโหลดไว/กดแล้วตอบไว/จอนิ่ง) แค่จด baseline ถ้าทำได้
- contrast จริงทุกจุด (จดเป็น backlog)
- การซ่อมโค้ดทุกข้อ

## 4. วิธีตรวจรับ (เกณฑ์ผ่านของงานนี้)

- มีตาราง matrix ครบ route × role × viewport พร้อมสถานะ ผ่าน/พัง/ยังไม่ได้ตรวจ
- ทุกข้อ P1 มีคำตัดสิน: "พังจริง" / "ไม่พัง (รายงานคลาดเคลื่อน)" / "ต้องเทสเพิ่ม" พร้อมหลักฐาน (ไฟล์ภาพ/ผลรัน)
- สคริปต์ตรวจที่เขียนเพิ่มรันซ้ำได้ (`npm run test:e2e -- <spec>` ผ่านหรือล้มเหลวชัดเจน)
- ไม่แตะไฟล์โปรดักชัน (`git status` มีเฉพาะ `docs/*`, `frontend/e2e/*`, `.audit/*`)

## 5. User stories (ย่อ)

1. ในฐานะคนสั่งงาน อยากรู้ว่าปุ่มค้นหาบนมือถือพังจริงไหม จะได้สั่งซ่อมถูกจุด
2. ในฐานะแอดมิน อยากรู้ว่าเมนูไหนกดแล้วโดนเด้งออก จะได้ไม่หลงกดตอนทำงานจริง
3. ในฐานะคนตรวจ อยากได้ตาราง route × role ว่าสิทธิ์ไหนเข้าหน้าไหนได้จริง

## 6. การตัดสินใจที่ทำแล้ว

- ทำบน branch ใหม่ `feat/admin-browser-verification` (ห้ามทำบน main ตรง)
- ใช้ Playwright (เครื่องมือกดเว็บอัตโนมัติ) + ตรวจมือประกอบ ไม่เดาจากโค้ดอย่างเดียว
- แยกงานตรวจออกจากการซ่อม: เฟสนี้ส่งมอบ matrix + หลักฐานเท่านั้น

## 7. นอกขอบเขต

- การแก้โค้ดตาม audit (รอเฟสถัดไป)
- การเพิ่ม role/viewer, การเปลี่ยนสิทธิ์หลังบ้าน
- การวัดความเร็วเชิงลึกจนสรุปว่าเร็ว/ช้า

## 8. Iron rule reminder (user-mandated 2026-10-13)

ห้ามพิมพ์ key/secret/token ใดๆ ในแชต สรุป หรือ log สรุปให้ผู้ใช้ต้องเป็นภาษาไทยล้วน
