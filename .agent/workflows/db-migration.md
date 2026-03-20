---
description: [db-migration] จัดการ Database Migration ด้วย Alembic แบบระบุ target ชัดเจน
---

# Workflow: Database Migration (Alembic)

## Purpose
ใช้สำหรับจัดการ schema migration โดยระบุ `local` หรือ `remote` ให้ชัดเจนทุกครั้งผ่าน `python scripts/db_target.py`

## Steps

### 1. ตรวจ target ปัจจุบันก่อน

สำหรับ local Docker/Postgres (`backend/app/.env`):
```bash
cd backend
ENV_FILE=app/.env python scripts/show_active_db_target.py
python scripts/db_target.py show --target local
python scripts/db_target.py alembic --target local current
```

สำหรับ Supabase/remote runtime (`backend/.env`):
```bash
cd backend
python scripts/show_active_db_target.py
python scripts/db_target.py show --target remote
python scripts/db_target.py alembic --target remote current
```

### 2. สร้าง migration ใหม่
เมื่อมีการแก้ model ใน `backend/app/models/`:
```bash
cd backend
python scripts/db_target.py alembic --target local revision --autogenerate -m "add_new_table"
```

### 3. อัปเกรดฐานข้อมูล

อัปเกรด local ก่อน:
```bash
cd backend
python scripts/db_target.py alembic --target local upgrade head
```

ถ้าต้องอัปเกรด Supabase/remote:
```bash
cd backend
python scripts/db_target.py alembic --target remote upgrade head
```

### 4. ดูประวัติ migration
```bash
cd backend
python scripts/db_target.py alembic --target local history --verbose
```

### 5. rollback

rollback local:
```bash
cd backend
python scripts/db_target.py show --target local
python scripts/db_target.py alembic --target local downgrade -1
```

rollback remote:
```bash
cd backend
python scripts/db_target.py show --target remote
python scripts/db_target.py alembic --target remote downgrade -1
```

## Verification
```bash
cd backend
python scripts/audit_local_vs_supabase.py
python scripts/db_target.py alembic --target local current
python scripts/db_target.py alembic --target remote current
```

ยืนยันว่า `(head)` ตรงกับ revision ล่าสุดก่อนปิดงาน
