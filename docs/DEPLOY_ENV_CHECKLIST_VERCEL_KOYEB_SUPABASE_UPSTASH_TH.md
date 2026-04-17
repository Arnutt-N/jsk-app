# Deployment Env Checklist: Vercel + Koyeb + Supabase + Upstash

เอกสารนี้ไว้สำหรับกรอกค่าทีละช่องก่อน deploy จริง

## 1. URL หลักของระบบ

- Frontend URL:
  - `____________________________`
- Backend URL:
  - `____________________________`
- LINE OA Name:
  - `____________________________`

ตัวอย่าง:

- Frontend URL: `https://my-app.vercel.app`
- Backend URL: `https://my-api.koyeb.app`

## 2. Backend Environment Variables

ใช้กับ Koyeb

### Security

- `ENVIRONMENT`
  - ค่าแนะนำ: `production`
  - ค่าที่จะใส่: `____________________________`

- `SECRET_KEY`
  - ต้องเป็นค่าสุ่มยาว
  - ค่าที่จะใส่: `____________________________`

- `ENCRYPTION_KEY`
  - ต้องเป็น Fernet key
  - ค่าที่จะใส่: `____________________________`

- `ALGORITHM`
  - ค่าแนะนำ: `HS256`
  - ค่าที่จะใส่: `____________________________`

- `ACCESS_TOKEN_EXPIRE_MINUTES`
  - ค่าแนะนำ: `30`
  - ค่าที่จะใส่: `____________________________`

### Database / Cache

- `DATABASE_URL`
  - เอาจาก Supabase Session pooler
  - ค่าที่จะใส่: `____________________________`

- `REDIS_URL`
  - เอาจาก Upstash
  - ค่าที่จะใส่: `____________________________`

### LINE

- `LINE_CHANNEL_ACCESS_TOKEN`
  - ค่าที่จะใส่: `____________________________`

- `LINE_CHANNEL_SECRET`
  - ค่าที่จะใส่: `____________________________`

- `LINE_LOGIN_CHANNEL_ID`
  - ค่าที่จะใส่: `____________________________`

### App URLs

- `SERVER_BASE_URL`
  - ต้องเป็น backend URL จริง
  - ค่าที่จะใส่: `____________________________`

- `BACKEND_CORS_ORIGINS`
  - ต้องเป็น frontend URL จริง
  - ตัวอย่าง:
    - `["https://my-app.vercel.app"]`
  - ค่าที่จะใส่: `____________________________`

### Optional

- `ADMIN_DEFAULT_PASSWORD`
  - ค่าที่จะใส่: `____________________________`

- `SLA_MAX_FRT_SECONDS`
  - ค่าแนะนำ: `120`
  - ค่าที่จะใส่: `____________________________`

- `SLA_MAX_RESOLUTION_SECONDS`
  - ค่าแนะนำ: `1800`
  - ค่าที่จะใส่: `____________________________`

- `SLA_MAX_QUEUE_WAIT_SECONDS`
  - ค่าแนะนำ: `300`
  - ค่าที่จะใส่: `____________________________`

- `SLA_ALERT_TELEGRAM_ENABLED`
  - ค่าแนะนำ: `false`
  - ค่าที่จะใส่: `____________________________`

## 3. Frontend Environment Variables

ใช้กับ Vercel (scope = Production)

- `NEXT_PUBLIC_API_URL`
  - ต้องเป็น backend URL จริง ลงท้ายด้วย `/api/v1`
  - ตัวอย่าง: `https://my-api.koyeb.app/api/v1`
  - ค่าที่จะใส่: `____________________________`

- `NEXT_PUBLIC_LIFF_ID` **(จำเป็น — ไม่งั้น LIFF จะขึ้น "LIFF ID is not specified")**
  - เอาจาก LINE Developers Console → LIFF
  - ตัวอย่าง: `1234567890-abcdefgh`
  - ค่าที่จะใส่: `____________________________`

- `NEXT_PUBLIC_DEV_MODE`
  - production ให้ใส่ `false`
  - ค่าที่จะใส่: `____________________________`

## 4. LINE Settings

### Webhook URL

- `____________________________`

ตัวอย่าง:

```text
https://my-api.koyeb.app/api/v1/line/webhook
```

### LIFF URL

- `____________________________`

ตัวอย่าง:

```text
https://my-app.vercel.app/liff/service-request
```

## 5. Before Deploy

- [ ] มี GitHub repo และ branch `main` ล่าสุด
- [ ] สร้าง Supabase project แล้ว
- [ ] คัดลอก `DATABASE_URL` แล้ว
- [ ] สร้าง Upstash Redis แล้ว
- [ ] คัดลอก `REDIS_URL` แล้ว
- [ ] มี LINE token / secret / channel id แล้ว
- [ ] ตั้ง build command และ run command ใน Koyeb แล้ว
- [ ] กรอก backend env ครบ
- [ ] กรอก frontend env ครบ
- [ ] ตรวจว่า `NEXT_PUBLIC_API_URL` เป็น backend URL จริงและลงท้ายด้วย `/api/v1`
- [ ] **ตรวจว่า `NEXT_PUBLIC_LIFF_ID` มีค่า** (ไม่งั้น LIFF พัง)
- [ ] ตรวจว่า `BACKEND_CORS_ORIGINS` เป็น frontend URL จริง
- [ ] ตรวจว่า `SERVER_BASE_URL` เป็น backend URL จริง
- [ ] ตรวจว่า `ENCRYPTION_KEY` ไม่ว่าง
- [ ] ไม่ได้ใช้ `Procfile` หรือ `runtime.txt` สำหรับ Koyeb
- [ ] Koyeb region = `fra`, Supabase region = `eu-central-1`, Upstash region = `eu-central-1`

## 6. After Deploy

- [ ] เปิด backend health check ได้
- [ ] เปิด frontend ได้
- [ ] admin login ได้
- [ ] LINE webhook เข้า backend
- [ ] analytics page โหลดได้
- [ ] live chat ใช้งานได้

## 7. Health Check URLs

- Backend health:
  - `____________________________`

- Frontend home:
  - `____________________________`

- Admin page:
  - `____________________________`

ตัวอย่าง:

```text
https://my-api.koyeb.app/api/v1/health
https://my-app.vercel.app
https://my-app.vercel.app/admin
```

## 8. ห้ามลืม

- ห้ามตั้ง `ENVIRONMENT=development` ตอน production
- ห้ามปล่อย `ENCRYPTION_KEY` ว่าง
- ห้ามตั้ง `NEXT_PUBLIC_DEV_MODE=true` ตอน production
- ห้ามชี้ `NEXT_PUBLIC_API_URL` ไป URL ผิด
- ห้ามลืมเปลี่ยน `BACKEND_CORS_ORIGINS` หลังได้ Vercel URL จริง
- **ห้ามลืม `NEXT_PUBLIC_LIFF_ID` — ไม่งั้น LIFF pages จะพังทั้งหมด**

## 9. Region Config (Frankfurt — ทุกตัวอยู่โซนเดียวกัน)

เป้าหมาย: ลด latency ระหว่าง backend ↔ DB ↔ Redis ให้เหลือ single-digit ms

### Koyeb

- Region: `fra` (Frankfurt, DE)
- ตั้งตอนสร้าง service หรือ redeploy เข้า region ใหม่

### Supabase

- Region: `Frankfurt (eu-central-1)`
- Pooler hostname มักเป็น `aws-0-eu-central-1.pooler.supabase.com`
- ใช้ Session pooler (port 5432) หรือ Transaction pooler (port 6543) ตามที่ FastAPI ต้องการ
- รูปแบบ `DATABASE_URL`:
  - `postgresql+asyncpg://postgres.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`

### Upstash Redis

- Region: `eu-central-1` (Frankfurt)
- ใช้ TLS endpoint (`rediss://`) — port 6379
- รูปแบบ `REDIS_URL`:
  - `rediss://default:<token>@<name>-<id>.upstash.io:6379`

### Vercel Frontend (Edge / Server Components)

เพื่อให้ route ที่เรียก backend Koyeb (Frankfurt) วิ่งใกล้กัน ให้ตั้ง preferred region เป็น `fra1` ใน route handler / server component ที่ hit backend บ่อย:

```ts
// app/api/<route>/route.ts หรือ server component
export const runtime = 'edge'
export const preferredRegion = 'fra1'
```

หรือถ้าใช้ Node runtime: ตั้งใน `vercel.json`:

```json
{
  "regions": ["fra1"]
}
```

### Verify Latency

หลัง deploy ให้ SSH เข้า Koyeb shell (หรือเรียก health route ที่ ping DB + Redis) แล้วดู round-trip time:

- Koyeb → Supabase: ควร < 10 ms
- Koyeb → Upstash: ควร < 5 ms

ถ้า > 50 ms แสดงว่า service ไม่ได้อยู่ Frankfurt จริง — ตรวจ region config ใหม่
