# Deploy JskApp on Vercel + Koyeb + Supabase + Upstash

## เหมาะกับใคร

เอกสารนี้เขียนสำหรับคน non-IT ที่ต้องการ deploy ระบบนี้แบบใช้งานจริง โดยใช้บริการ cloud ที่ตั้งค่าง่ายและมี free tier

stack ที่ใช้:

- Frontend: Vercel
- Backend: Koyeb
- Database: Supabase
- Redis: Upstash

## ทำไมใช้ชุดนี้

โปรเจ็กต์นี้มี:

- FastAPI backend
- PostgreSQL
- Redis
- WebSocket สำหรับ live chat

ดังนั้นแนวทางที่เหมาะคือ:

1. เอา frontend ไป Vercel
2. เอา backend ไป Koyeb
3. เอาฐานข้อมูลไป Supabase
4. เอา Redis ไป Upstash

หมายเหตุ:

- ไม่แนะนำให้เอา backend ตัวนี้ไปลง Vercel เพราะระบบนี้มี WebSocket/live chat
- ถ้าจะใช้ฟรีทั้งหมด ชุดนี้ถือว่าเหมาะและทำได้จริง

## สิ่งที่ต้องมี

ก่อนเริ่ม ให้เตรียมบัญชีเหล่านี้:

1. GitHub
2. Vercel
3. Koyeb
4. Supabase
5. Upstash
6. LINE Developers

และต้องมีค่าเหล่านี้จาก LINE:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_LOGIN_CHANNEL_ID`

## Step 1: เตรียม GitHub

1. push โค้ดขึ้น GitHub ให้เรียบร้อย
2. ให้แน่ใจว่า branch `main` คือเวอร์ชันล่าสุด
3. ใช้ branch `main` สำหรับ deploy

## Step 2: สร้างฐานข้อมูลบน Supabase

### 2.1 สร้างโปรเจ็กต์

1. เข้า Supabase
2. กด `New project`
3. ตั้งชื่อโปรเจ็กต์
4. ตั้ง database password
5. เลือก region ที่ใกล้ที่สุด

### 2.2 หา DATABASE_URL

1. เข้าโปรเจ็กต์
2. ไปที่ `Connect`
3. เลือก `Session pooler`
4. คัดลอก connection string

รูปแบบที่จะใช้กับโปรเจ็กต์นี้:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/postgres
```

หมายเหตุ:

- สำหรับ app นี้ แนะนำ `Session pooler`
- ไม่แนะนำ `Transaction pooler`

## Step 3: สร้าง Redis บน Upstash

1. เข้า Upstash
2. สร้าง Redis database
3. เลือก region ที่ใกล้กับ backend
4. คัดลอก `REDIS_URL`

ตัวอย่าง:

```env
REDIS_URL=redis://default:password@host:6379
```

## Step 4: Deploy Backend บน Koyeb

### 4.1 สร้าง App

1. เข้า Koyeb
2. กด `Create App`
3. เลือก deploy จาก GitHub
4. เลือก repository นี้
5. เลือก branch `main`
6. ตั้ง working directory เป็น:

```text
backend
```

### 4.2 ตั้งค่า Build และ Run

ใส่ค่าประมาณนี้:

Build Command:

```bash
pip install -r requirements.txt
```

Run Command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

หมายเหตุ:

- สำหรับ Koyeb ในโปรเจ็กต์นี้ ไม่ต้องใช้ `Procfile`
- ไม่ต้องใช้ `runtime.txt`
- ให้ใส่ build/run command ตรงในหน้า Koyeb ได้เลย

### 4.3 ใส่ Environment Variables ของ Backend

ใส่ค่าต่อไปนี้ใน Koyeb:

```env
ENVIRONMENT=production
SECRET_KEY=ค่าสุ่มยาว
ENCRYPTION_KEY=Fernet key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

DATABASE_URL=ค่าจาก Supabase
REDIS_URL=ค่าจาก Upstash

LINE_CHANNEL_ACCESS_TOKEN=ค่าจาก LINE
LINE_CHANNEL_SECRET=ค่าจาก LINE
LINE_LOGIN_CHANNEL_ID=ค่าจาก LINE

SERVER_BASE_URL=https://YOUR-BACKEND.koyeb.app
BACKEND_CORS_ORIGINS=["https://YOUR-FRONTEND.vercel.app"]

ADMIN_DEFAULT_PASSWORD=รหัสชั่วคราวที่ปลอดภัย
SLA_MAX_FRT_SECONDS=120
SLA_MAX_RESOLUTION_SECONDS=1800
SLA_MAX_QUEUE_WAIT_SECONDS=300
SLA_ALERT_TELEGRAM_ENABLED=false
```

### 4.4 วิธีสร้าง SECRET_KEY และ ENCRYPTION_KEY

`SECRET_KEY`

```bash
openssl rand -hex 32
```

`ENCRYPTION_KEY`

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 4.5 Deploy

1. กด deploy
2. รอให้ Koyeb build และ start สำเร็จ
3. จด backend URL ที่ได้

### 4.6 เช็กว่า backend พร้อมใช้งาน

เปิด:

```text
https://YOUR-BACKEND.koyeb.app/api/v1/health
```

ถ้าขึ้น health ปกติ แปลว่า backend พร้อมใช้

## Step 5: Deploy Frontend บน Vercel

### 5.1 สร้าง Project

1. เข้า Vercel
2. กด `Add New Project`
3. เลือก GitHub repository นี้
4. ตั้ง Root Directory เป็น:

```text
frontend
```

### 5.2 ใส่ Environment Variables ของ Frontend

```env
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.koyeb.app/api/v1
NEXT_PUBLIC_DEV_MODE=false
```

### 5.3 Deploy

1. กด deploy
2. รอจนได้ frontend URL

ตัวอย่าง:

```text
https://YOUR-FRONTEND.vercel.app
```

## Step 6: กลับไปอัปเดต CORS ที่ Koyeb

หลัง frontend ได้ URL จริงแล้ว:

1. กลับไป Koyeb
2. แก้ค่า:

```env
BACKEND_CORS_ORIGINS=["https://YOUR-FRONTEND.vercel.app"]
```

3. redeploy backend

## Step 7: ตั้งค่า LINE

### 7.1 Webhook URL

ใน LINE Developers:

```text
https://YOUR-BACKEND.koyeb.app/api/v1/line/webhook
```

### 7.2 LIFF URL

ถ้าใช้ LIFF:

```text
https://YOUR-FRONTEND.vercel.app/liff/service-request
```

### 7.3 SERVER_BASE_URL

ค่า `SERVER_BASE_URL` ต้องตรงกับ backend URL จริง เช่น:

```env
SERVER_BASE_URL=https://YOUR-BACKEND.koyeb.app
```

## Step 8: ทดสอบหลัง deploy

### Backend

1. เปิด `/api/v1/health`
2. ต้องใช้งานได้
3. ลอง admin login
4. ลองหน้า analytics
5. ลอง webhook จาก LINE
6. ลอง live chat

### Frontend

1. เปิดหน้าเว็บได้
2. เปิดหน้า admin ได้
3. ดึงข้อมูลจาก backend ได้
4. ไม่มีปัญหา CORS

### LINE

1. ส่งข้อความเข้า LINE OA
2. backend ต้องรับ webhook
3. ข้อความต้องไปถึงหน้า admin

## ปัญหาที่เจอบ่อย

### 1. Frontend เรียก API ไม่ได้

เช็ก:

- `NEXT_PUBLIC_API_URL`
- `BACKEND_CORS_ORIGINS`

### 2. Backend ไม่ start

เช็ก:

- `ENCRYPTION_KEY`
- `DATABASE_URL`
- `REDIS_URL`

### 3. LINE webhook ไม่เข้า

เช็ก:

- webhook URL
- backend online หรือไม่
- LINE token/secret ถูกหรือไม่

### 4. Live chat ใช้ไม่ได้

เช็ก:

- มี Redis แล้วหรือยัง
- backend online แล้วหรือยัง
- Koyeb deploy สำเร็จจริงหรือไม่

## สรุปสั้นที่สุด

ถ้าจะใช้ stack นี้:

1. Supabase = ฐานข้อมูล
2. Upstash = Redis
3. Koyeb = Backend
4. Vercel = Frontend
5. LINE = ชี้ webhook มาที่ Koyeb

## ไฟล์อ้างอิงในโปรเจ็กต์

Backend env:

- [backend/app/.env.example](/backend/app/.env.example)

Frontend env:

- [frontend/.env.local.example](/frontend/.env.local.example)
