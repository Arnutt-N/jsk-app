---
description: [line-test] ทดสอบ LINE Messaging API และ Webhook
---

# Workflow: LINE API Testing

## Purpose
ใช้สำหรับทดสอบการรับ-ส่งข้อความ และการตั้งค่า Webhook ของ LINE OA

## Steps

### 1. ทดสอบ Webhook (ngrok/Public URL)
ตรวจสอบว่า `SERVER_BASE_URL` ใน `.env` ตรงกับ URL ใน LINE Developers Console หรือไม่

### 2. ตรวจสอบ Webhook Logs (Backend)
ดูประวัติการเรียก Webhook ที่ส่งมาจาก LINE:
// turbo
```bash
# ตรวจสอบว่ามี 200 OK หรือไม่ใน Terminal ที่รัน Uvicorn
```

### 3. ทดสอบการตอบกลับ (Auto-Reply Test)
ลองส่ง Keyword ไปหาบอท และตรวจสอบการตอบกลับ:
- ส่ง `สวัสดี` (ดูว่าเป็น Text ปกติไหม)
- ส่ง Keyword ที่ติด Flex Message (ดูว่ารูปขึ้นไหม)

### 4. ตรวจสอบ Error จาก LINE SDK
หากมี Error `invalid reply token` หรือ `invalid uri scheme`:
- เช็คว่าประมวลผลนานกว่า 1-2 วินาทีหรือไม่
- เช็คว่า URL รูปภาพเป็น HTTPS หรือยัง

## Tools
- [LINE Developers Console](https://developers.line.biz/console/)
- [LINE Flex Message Simulator](https://developers.line.biz/flex-simulator/)
