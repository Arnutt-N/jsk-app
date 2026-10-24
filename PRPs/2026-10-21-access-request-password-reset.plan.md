# Plan: ฟอร์มขอใช้งาน + ลืมรหัสผ่านทางอีเมล

## ลำดับงาน (ทีละขั้น ตรวจทีละขั้น)
1. DB: ตาราง `access_requests` + `password_reset_tokens` (migration เดียว 2 ตาราง)
2. หลังบ้าน A: `POST /auth/request-access` (สาธารณะ + rate-limit) + `GET/POST /admin/access-requests` (อนุมัติสร้าง user + ปฏิเสธ) + เทส
3. หลังบ้าน B: `POST /auth/forgot-password` + `POST /auth/reset-password` (token hash + หมดอายุ 30 นาที + ครั้งเดียว) + ส่งอีเมลผ่าน SMTP เดิม + เทส
4. หน้าบ้าน: `/request-access`, `/forgot-password`, `/reset-password`, `/admin/access-requests` + ลิงก์ลืมรหัสในหน้าล็อกอิน + เทส
5. ตรวจรวม + เปิด PR

## ไฟล์ที่แตะ
- ใหม่: `backend/alembic/versions/*_access_requests_and_reset_tokens.py`, `backend/app/models/access_request.py`, `backend/app/models/password_reset_token.py` (หรือรวมใน user.py — เลือกแยกไฟล์ตามแบบ models/ เดิม), `backend/app/api/v1/endpoints/admin_access_requests.py`, `backend/app/api/v1/endpoints/password_reset.py` (หรือรวมใน auth.py — เลือกแยกไฟล์เพราะ auth.py ใหญ่แล้ว), `backend/app/services/password_reset_email.py` (ใช้ `_send_sync` จาก booking_email), เทส 2 ไฟล์, หน้า frontend 4 ไฟล์ + เทส
- แก้: `backend/app/main.py` หรือ router รวม (ลงทะเบียน router), `frontend/app/login/page.tsx` (ลิงก์ลืมรหัส)

## ความเสี่ยง + วิธีกัน
- SMTP ผลิตจริงยังไม่ตั้งค่า: โค้ดต้องเงียบเมื่อไม่มี SMTP (log อย่างเดียว) ฟอร์มลืมรหัสยังตอบสำเร็จเสมอ
- สแปมฟอร์มสาธารณะ: rate-limit ต่อ IP + ไม่อนุมัติอัตโนมัติ + ไม่ขึ้นลิงก์ในเมนู
- ชื่อผู้ใช้ซ้ำตอนอนุมัติ: ตรวจซ้ำก่อนสร้าง (409) เพราะระหว่างรออนุมัติอาจมีคนใช้ชื่อนั้นแล้ว

## การตรวจแต่ละขั้น
- ขั้น 1: migration upgrade/downgrade ผ่านบน DB ทดสอบ
- ขั้น 2-3: pytest ไฟล์ใหม่ + ชุด auth เดิมเขียว
- ขั้น 4: vitest หน้าใหม่ + eslint
- ขั้น 5: รีวิวโค้ดเอง + เปิด PR เดียว commits เรียงลำดับ

## Self-review แผนนี้
- ผ่าน: ใช้สิทธิ์เดิม KEY_MANAGE_USERS ไม่เพิ่ม permission key ใหม่ (ของเดิมครอบคลุม), ใช้ SMTP เดิมไม่เพิ่มของใหม่, ไม่แตะโฟลว์ล็อกอินที่เพิ่งส่ง PR
- ระวัง: อย่าสร้าง user ล่วงหน้าตอนขอ (is_active ไม่เกี่ยวเพราะยังไม่มีแถว user), อย่าบอกใบ้ว่ามีอีเมลนี้ในระบบหรือไม่
