---
description: [media-management] จัดการไฟล์สื่อและการอัปโหลดรูปภาพเข้าฐานข้อมูล
---

# Workflow: Media Management

## Purpose
ใช้สำหรับบริหารจัดการไฟล์สื่อ (รูปภาพ) ที่เก็บอยู่ในฐานข้อมูล เพื่อใช้ใน Flex Message และข้อความตอบกลับอื่นๆ

## Steps

### 1. ตรวจสอบไฟล์สื่อในฐานข้อมูล
// turbo
```bash
python -c "from backend.app.db.session import SessionLocal; from backend.app.models.media_file import MediaFile; import asyncio; async def run(): async with SessionLocal() as db: res = await db.execute('SELECT id, filename, content_type FROM media_files'); [print(f'{r[0]} | {r[1]} | {r[2]}') for r in res.all()]; asyncio.run(run())"
```

### 2. นำเข้าไฟล์สื่อแบบ Bulk
หากมีรูปภาพใหม่ในโฟลเดอร์ `examples/` สามารถเขียนสคริปต์สั้นๆ เพื่อนำเข้าเป็น `MediaFile` และใช้ในระบบได้

### 3. ตรวจสอบขนาดพื้นที่ที่ใช้ (Media BLOB)
ตรวจสอบขนาดข้อมูลในตาราง `media_files`
```sql
SELECT pg_size_pretty(pg_total_relation_size('media_files'));
```

### 4. การจัดการ URLs ใน Flex Message
จำไว้ว่ารูปภาพใน Flex Message ต้องเป็น HTTPS เสมอ
- ตรวจสอบ `SERVER_BASE_URL` ใน `.env`
- รูปภาพจะถูกเรียกผ่าน `/api/v1/media/{id}`

## Verification
เมื่ออัปโหลดไฟล์แล้ว ให้ทดสอบเปิด URL รูปภาพใน Browser:
`https://[SERVER_BASE_URL]/api/v1/media/[MEDIA_ID]`
