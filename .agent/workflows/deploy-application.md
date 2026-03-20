---
description: [deploy] ขั้นตอนการ Deployment แอปพลิเคชัน (Backend & Frontend)
---

# Workflow: Deploy Application

## Purpose
ใช้สำหรับเตรียมความพร้อมและ Deployment แอปพลิเคชัน ทั้งในสภาพแวดล้อม Local และ Server

## Steps

### 1. Backend Preparation
// turbo
```bash
cd backend
pip install -r requirements.txt
python scripts/db_target.py show --target remote
python scripts/db_target.py alembic --target remote upgrade head
```

### 2. Frontend Building (Production)
// turbo
```bash
cd frontend
npm install
npm run build
```

### 3. Environment Check
ตรวจสอบไฟล์ `.env` ทั้งคู่:
- `backend/.env`: `DATABASE_URL`, `SERVER_BASE_URL`, `LINE_CHANNEL_ACCESS_TOKEN`
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`

ถ้าต้อง deploy หรือ migrate local แทน remote ให้เช็ก target ก่อนทุกครั้ง:
```bash
cd backend
python scripts/db_target.py show --target remote
python scripts/db_target.py show --target local
```

### 4. Running the Application
**Backend:**
```bash
cd backend
python run.py --target remote --no-reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run start
```

## Maintenance Logs
ตรวจสอบ log เพื่อเช็คความผิดปกติ:
```bash
# Backend logs ใน Terminal
# Nginx/Docker logs (กรณีอยู่บน Server)
```
