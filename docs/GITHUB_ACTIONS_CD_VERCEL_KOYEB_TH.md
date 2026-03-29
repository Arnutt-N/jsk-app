# GitHub Actions CD for JskApp

เอกสารนี้อธิบายการเปิดใช้ CD ผ่าน GitHub Actions สำหรับ stack ที่ repo นี้แนะนำ:

- Frontend: Vercel
- Backend: Koyeb
- Database: Supabase
- Redis: Upstash

workflow ที่เพิ่มคือ [`.github/workflows/cd.yml`](/.github/workflows/cd.yml)

## พฤติกรรมของ workflow

- auto deploy หลัง workflow `CI` สำเร็จบน `push` ไปที่ `main`
- auto deploy จะใช้ GitHub Environment ชื่อ `production`
- รองรับ `workflow_dispatch` เพื่อ deploy เองแบบ manual
- manual deploy เลือก environment ได้ `production` หรือ `staging`
- manual deploy เลือกได้ `all`, `frontend`, หรือ `backend`
- manual deploy ฝั่ง backend มี option `backend_skip_build` สำหรับ runtime-only redeploy
- auto deploy จะเช็ก scope จาก artifact ที่ CI สร้างไว้ แล้ว deploy เฉพาะส่วนที่มีการเปลี่ยนแปลงจริง
- ถ้า push รอบนั้นเปลี่ยนแค่ `frontend/**` จะไม่ยิง backend migration/deploy
- ถ้า push รอบนั้นเปลี่ยนแค่ `backend/**` จะไม่ยิง frontend deploy hook

## สิ่งที่ต้องตั้งค่าใน GitHub

ไปที่ `Settings -> Secrets and variables -> Actions`

### Secrets

- `VERCEL_DEPLOY_HOOK_URL`
- `KOYEB_TOKEN`
- `BACKEND_REMOTE_ENV_FILE`

### Variables

- `KOYEB_APP_NAME`
- `KOYEB_SERVICE_NAME`
- `KOYEB_ORGANIZATION_ID` (optional)
- `FRONTEND_HEALTHCHECK_URL` (optional แต่แนะนำ)
- `BACKEND_HEALTHCHECK_URL` (optional แต่แนะนำ)

## Template Files ที่กรอกค่าได้ทันที

- [BACKEND_REMOTE_ENV_FILE.production.example](/docs/examples/BACKEND_REMOTE_ENV_FILE.production.example)
- [BACKEND_REMOTE_ENV_FILE.staging.example](/docs/examples/BACKEND_REMOTE_ENV_FILE.staging.example)
- [GITHUB_ENVIRONMENT_VALUES.production-staging.example.md](/docs/examples/GITHUB_ENVIRONMENT_VALUES.production-staging.example.md)

ไฟล์พวกนี้ตั้งใจให้ใช้เป็นต้นแบบแล้วคัดลอก "เนื้อหา" ไปใส่ใน GitHub Environment secret ชื่อ `BACKEND_REMOTE_ENV_FILE`

## แนะนำให้ใช้ GitHub Environments

workflow นี้รองรับ environment-level secrets/variables โดยตรง

แนวทางที่แนะนำ:

1. สร้าง environment ชื่อ `production`
2. สร้าง environment ชื่อ `staging`
3. ใส่ secret/variable ชุดเดียวกันในแต่ละ environment แต่ใช้ค่าคนละชุด

ตัวอย่าง:

- `production` ใช้ Vercel production hook + Koyeb production service
- `staging` ใช้ Vercel preview/staging hook + Koyeb staging service

ถ้าตั้ง protection rules ไว้ GitHub จะบังคับ approval ก่อน deploy job เข้าถึง secrets ของ environment นั้น

## Release Gating ที่แนะนำสำหรับ Production

ไปที่ `Settings -> Environments -> production` แล้วตั้งค่า:

1. `Required reviewers`
2. `Deployment branches` ให้จำกัดเฉพาะ `main`
3. `Wait timer` ถ้าต้องการช่วงกันพลาดก่อนยิงจริง
4. `Prevent self-review` ถ้า workflow ของทีมคุณต้องการ separation of duties

ค่าตั้งต้นที่แนะนำ:

- Required reviewers: 1-2 คน
- Deployment branches: `main` only
- Wait timer: `5 minutes`
- Prevent self-review: เปิด ถ้าทีมต้องการ approval จากคนอื่นจริง

ผลคือ:

- auto deploy ไป `production` จะหยุดรอ approval ที่ environment gate
- manual deploy ไป `production` ก็ต้องผ่าน gate เดียวกัน
- `staging` จะเปิด reviewer gate หรือไม่ก็ได้ตามทีม

ถ้าคุณอยากให้ `staging` เร็ว:

- ไม่ต้องตั้ง required reviewers
- จำกัด branch ตามที่ต้องการ หรือเปิดให้ manual dispatch ใช้ทดสอบได้

## ตัวอย่างการ map ค่าแยกตาม Environment

### production

- `VERCEL_DEPLOY_HOOK_URL` = production frontend hook
- `KOYEB_APP_NAME` = production app
- `KOYEB_SERVICE_NAME` = production backend service
- `FRONTEND_HEALTHCHECK_URL` = `https://YOUR-FRONTEND.vercel.app/`
- `BACKEND_HEALTHCHECK_URL` = `https://YOUR-BACKEND.koyeb.app/api/v1/health`
- `BACKEND_REMOTE_ENV_FILE` = ใช้ template production แล้วกรอกค่าจริง

### staging

- `VERCEL_DEPLOY_HOOK_URL` = staging/preproduction frontend hook
- `KOYEB_APP_NAME` = staging app
- `KOYEB_SERVICE_NAME` = staging backend service
- `FRONTEND_HEALTHCHECK_URL` = `https://YOUR-STAGING-FRONTEND.vercel.app/`
- `BACKEND_HEALTHCHECK_URL` = `https://YOUR-STAGING-BACKEND.koyeb.app/api/v1/health`
- `BACKEND_REMOTE_ENV_FILE` = ใช้ template staging แล้วกรอกค่าจริง

## `BACKEND_REMOTE_ENV_FILE` คืออะไร

secret นี้คือเนื้อหาเต็มของ `backend/.env` สำหรับ production database target ที่ GitHub Actions จะใช้ตอนรัน Alembic migration

ตัวอย่างโครง:

```env
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/postgres
SECRET_KEY=...
ENCRYPTION_KEY=...
REDIS_URL=redis://default:password@host:6379
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
LINE_LOGIN_CHANNEL_ID=...
SERVER_BASE_URL=https://YOUR-BACKEND.koyeb.app
ADMIN_URL=https://YOUR-FRONTEND.vercel.app
BACKEND_CORS_ORIGINS=["https://YOUR-FRONTEND.vercel.app"]
```

อย่างน้อยต้องมีค่าที่ทำให้ Alembic/Settings boot ได้สำเร็จ โดยเฉพาะ `DATABASE_URL`

ข้อสำคัญ:

- secret นี้ควรอยู่ใน GitHub Environment ไม่ใช่ repo-level secret ถ้าคุณแยก `production/staging`
- ค่า `ENVIRONMENT` ใน secret นี้ควรเป็น `production` ทั้ง production และ staging ถ้าต้องการปิด dev-mode behavior ใน runtime/migration

## Health Check Variables ใช้ทำอะไร

workflow นี้มี smoke checks หลัง deploy ทั้ง frontend และ backend

ตั้งค่าได้ดังนี้:

```env
FRONTEND_HEALTHCHECK_URL=https://YOUR-FRONTEND.vercel.app/
BACKEND_HEALTHCHECK_URL=https://YOUR-BACKEND.koyeb.app/api/v1/health
```

หมายเหตุ:

- ถ้าไม่ตั้งค่า workflow จะ `warning` และข้าม smoke check
- ถ้าตั้งค่าแล้ว URL ตอบไม่ผ่านตาม retry policy job จะ fail

## วิธีหา Vercel Deploy Hook

อ้างอิง: Vercel Deploy Hooks documentation

1. เปิด Vercel project ของ frontend
2. ไปที่ `Settings -> Git`
3. สร้าง Deploy Hook สำหรับ branch `main`
4. คัดลอก URL มาใส่เป็น secret `VERCEL_DEPLOY_HOOK_URL`

หมายเหตุ:

- Vercel ระบุว่า Deploy Hook ใช้ได้กับ project ที่เชื่อม Git repository อยู่แล้ว
- URL นี้มีสิทธิ์ trigger production deploy ได้ ควรเก็บเป็น secret

## วิธีเตรียม Koyeb

อ้างอิง: Koyeb docs สำหรับ git deployment และ CLI

1. สร้าง/เชื่อม backend service บน Koyeb ให้ deploy จาก repo นี้ branch `main`
2. ตั้งค่า app name และ service name ให้แน่นอน
3. สร้าง API token ใน Koyeb แล้วเก็บเป็น secret `KOYEB_TOKEN`
4. นำชื่อ app/service ไปใส่ใน GitHub variables

workflow นี้จะใช้คำสั่งลักษณะนี้:

```bash
koyeb services redeploy "$KOYEB_SERVICE_NAME" \
  --app "$KOYEB_APP_NAME" \
  --token "$KOYEB_TOKEN" \
  --wait \
  --wait-timeout 15m \
  --use-cache
```

ถ้า manual dispatch แล้วเลือก `backend_skip_build=true` จะเติม `--skip-build`

## Production DB Migration Job

ก่อน backend deploy workflow จะรัน job migration ก่อนเสมอเมื่อ scope มี `backend`

แนวทางคือ:

1. checkout commit ที่ผ่าน CI
2. ติดตั้ง backend dependencies
3. เขียน secret `BACKEND_REMOTE_ENV_FILE` ลง `backend/.env`
4. รัน:

```bash
python scripts/db_target.py show --target remote
python scripts/db_target.py alembic --target remote upgrade head
```

ถ้า migration ไม่ผ่าน backend deploy จะไม่เริ่ม

## Smoke Check Jobs

หลัง deploy จะมี smoke check แยกตาม service:

- frontend: `curl` ไปที่ `FRONTEND_HEALTHCHECK_URL`
- backend: `curl` ไปที่ `BACKEND_HEALTHCHECK_URL`

frontend ใช้ retry นานกว่า backend เพราะ Vercel deploy hook เป็น async และ deployment อาจยังไม่ ready ทันที

## แนะนำให้ปิด auto deploy ฝั่ง Koyeb

Koyeb ระบุว่า git-driven services จะ auto redeploy ทุกครั้งที่มี push ไป branch ที่ track อยู่โดย default

ถ้าจะให้ GitHub Actions เป็นตัว gate production deploy หลัง CI:

1. เปิด Koyeb service
2. ไปที่ `Settings -> Source`
3. ปิด `Autodeploy`

ถ้าไม่ปิด จะได้ทั้ง:

- provider-side auto deploy จาก Koyeb
- GitHub Actions CD deploy อีกรอบ

ซึ่งทำให้ deploy ซ้ำ

## เรื่อง Vercel auto deploy

Vercel ก็รองรับ deploy จาก Git push โดยตรงอยู่แล้ว ถ้า project นี้ถูกผูกให้ production deploy จาก Git อยู่ก่อนหน้า อาจเกิด production deploy ซ้ำกับ Deploy Hook ได้

แนวทางใช้งานที่แนะนำมี 2 แบบ:

1. ใช้ GitHub Actions workflow นี้เป็น production gate หลัก
2. หรือคง Vercel Git auto deploy ไว้ แล้วใช้ workflow นี้เฉพาะ backend

ถ้าต้องการลดความซ้ำซ้อนที่สุด ให้ทบทวน production deployment path ของ frontend ให้เหลือทางเดียว

## สิ่งที่ workflow นี้ยังไม่ได้ทำ

- ยังไม่ได้ sync environment variables ให้ provider
- ยังไม่ได้ทำ preview/staging deployment แยก environment

สำหรับโปรเจ็กต์นี้ ผมตั้งใจให้ CD รอบแรกปลอดภัยและเปิดใช้ได้ง่ายก่อน:

- CI ต้องเขียวก่อน
- production DB migration ต้องผ่านก่อน backend deploy
- deploy เฉพาะส่วนที่เปลี่ยนจริง
- deploy production ได้จาก GitHub Actions
- ไม่บังคับเปลี่ยนวิธี build ของแต่ละ provider

## การใช้งานแบบ manual

ไปที่ `Actions -> CD -> Run workflow`

เลือกได้:

- `environment=production` หรือ `environment=staging`
- `target=all`
- `target=frontend`
- `target=backend`

และถ้า deploy backend แบบ config/runtime only:

- เปิด `backend_skip_build=true`

## Activation Checklist

- [ ] frontend project บน Vercel พร้อมใช้งาน
- [ ] backend service บน Koyeb พร้อมใช้งาน
- [ ] ใส่ `VERCEL_DEPLOY_HOOK_URL`
- [ ] ใส่ `KOYEB_TOKEN`
- [ ] ใส่ `BACKEND_REMOTE_ENV_FILE`
- [ ] ใส่ `KOYEB_APP_NAME`
- [ ] ใส่ `KOYEB_SERVICE_NAME`
- [ ] ใส่ `FRONTEND_HEALTHCHECK_URL`
- [ ] ใส่ `BACKEND_HEALTHCHECK_URL`
- [ ] สร้าง GitHub Environments: `production`, `staging`
- [ ] ตั้ง required reviewers / wait timer / branch restriction ใน `production`
- [ ] ปิด Koyeb Autodeploy ถ้าจะให้ GitHub Actions เป็น production gate
- [ ] merge workflow นี้เข้า `main`
- [ ] ทดสอบ `workflow_dispatch` ก่อนปล่อย auto deploy
