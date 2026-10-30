# Database Migration Runbook (Local + Production Supabase)

## เหมาะกับใคร

เอกสารนี้สำหรับคนที่จะรัน Alembic migration กับฐานข้อมูลจริง (production Supabase)
หรือฐานข้อมูล local — รวมถึงขั้นตอนที่ต้องทำ **ก่อน** รัน เพื่อไม่ให้ migration ค้างกลางทาง

อ่านคู่กับ `DEPLOY_VERCEL_KOYEB_SUPABASE_UPSTASH_TH.md` (วิธี deploy ทั้งระบบ)

---

## สรุปสั้น

| เป้าหมาย | คำสั่ง |
|---|---|
| ดู revision ปัจจุบัน | `python scripts/db_target.py alembic --target local current` |
| อัปเดต database local | `python scripts/db_target.py alembic --target local upgrade head` |
| อัปเดต database production | `python scripts/db_target.py alembic --target remote upgrade head` |
| สร้าง migration ใหม่ | `python scripts/db_target.py alembic --target local revision --autogenerate -m "อธิบาย"` |
| ย้อน 1 revision | `python scripts/db_target.py alembic --target local downgrade -1` |

`--target` เลือกไฟล์ env ที่จะใช้:

- `local` → `backend/app/.env`
- `remote` → `backend/.env`

**ถ้าไม่มี `backend/.env` คำสั่ง `--target remote` จะไม่รู้จะต่อ database ไหน** — ดูหัวข้อถัดไป

---

## 1. เตรียม `backend/.env` สำหรับ production

`backend/.env` ถูก gitignore ไว้ (`.gitignore:2`) จึงไม่มีในรีโป — ต้องสร้างเองทุกครั้ง
บนเครื่องใหม่ (และ **ลบทิ้งเมื่อใช้เสร็จ** ถ้าเครื่องไม่ใช่เครื่องที่ดูแล production)

### ต้องมี key อะไร

| Key | ที่มา | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string | ต้องขึ้นต้น `postgresql+asyncpg://` และใช้ pooler port **5432** (session mode) ไม่ใช่ 6543 |
| `SECRET_KEY` | `secrets/secret-keys.txt` | ใช้ JWT |
| `ENCRYPTION_KEY` | `secrets/secret-keys.txt` | migration `a7b8c9d0e1f2` บังคับให้มี ไม่งั้นล้ม |
| `LINE_ID_HMAC_KEY` | `secrets/secret-keys.txt` | ใช้ backfill `line_user_id_hash` |
| `REDIS_URL` | Upstash | ไม่ใส่ก็ import ได้ แต่ production guard จะเตือน |
| `ENVIRONMENT` | ใส่ `production` | ⚠️ ดูหัวข้อ "กับดัก" ด้านล่าง |

### สร้างไฟล์

**PowerShell:**

```powershell
cd D:\genAI\jsk-app\backend
@"
DATABASE_URL=<ค่าวาก Supabase>
SECRET_KEY=<ค่าวาก secrets>
ENCRYPTION_KEY=<ค่าวาก secrets>
LINE_ID_HMAC_KEY=<ค่าวาก secrets>
REDIS_URL=<ค่าวาก Upstash>
ENVIRONMENT=production
"@ | Out-File -Encoding utf8 .env
```

**bash / Git Bash:**

```bash
cd /d/genAI/jsk-app/backend
cat > .env <<'EOF'
DATABASE_URL=<ค่าวาก Supabase>
SECRET_KEY=<ค่าวาก secrets>
ENCRYPTION_KEY=<ค่าวาก secrets>
LINE_ID_HMAC_KEY=<ค่าวาก secrets>
REDIS_URL=<ค่าวาก Upstash>
ENVIRONMENT=production
EOF
```

### ตรวจว่าต่อได้ก่อนทำอะไรทั้งนั้น

```bash
python scripts/db_target.py alembic --target remote current
```

ต้องเห็น revision (เช่น `f0a1b2c3d4e5`) ไม่ใช่ traceback

---

## 2. ก่อน upgrade production — 3 ด่านที่ต้องผ่าน

### ด่าน 1: ทำความรู้จักช่องว่าง

```bash
python -m alembic history -r <revision-ปัจจุบัน>:head
```

ถ้ามีเกิน ~5 ตัว **อย่าเพิ่งรัน** — ไปทำด่าน 2 และ 3 ก่อน

### ด่าน 2: replay ทั้งชุดบน database จำลอง

ห้ามทดลองกับ production ตรง ๆ ให้สร้าง database เปล่าในเครื่อง local:

```bash
# 1) สร้าง database ทดสอบ
python -c "
import asyncio, asyncpg
from dotenv import dotenv_values
u = dotenv_values('app/.env')['DATABASE_URL'].replace('postgresql+asyncpg://','postgresql://')
async def m():
    c = await asyncpg.connect(u.replace('/skn_app_db','/postgres'), timeout=10)
    await c.execute('DROP DATABASE IF EXISTS migtest_replay')
    await c.execute('CREATE DATABASE migtest_replay')
    await c.close()
asyncio.run(m())
"

# 2) ให้ alembic ชี้ที่ database ทดสอบ
#    สร้าง .env ชั่วคราวที่ DATABASE_URL ชี้ .../migtest_replay
#    (คัดลอก key อื่นจาก app/.env แล้วแก้เฉพาะ DATABASE_URL)

# 3) ไล่ไปถึง revision ที่ production อยู่
python -m alembic upgrade <revision-ปัจจุบันของ-production>

# 4) ไล่ให้สุด
python -m alembic upgrade head
```

ถ้าล้ม ให้แก้ migration แล้ว replay ใหม่ตั้งแต่ต้น — **อย่า** ข้ามไปรัน production

### ด่าน 3: ตรวจข้อมูลที่ migration จะบังคับ

บาง migration มี guard ที่จะหยุดถ้าข้อมูลยังไม่พร้อม ตัวอย่างที่เคยเจอ:

| Migration | Guard | แก้ด้วย |
|---|---|---|
| `d5e6f7g8h9i0` | user ที่มี `line_user_id` ต้องมี `line_user_id_hash` | `python scripts/backfill_line_id_hash.py --apply` |
| `d5e6f7a8b9c0` | ต้องมี `ENCRYPTION_KEY` | ใส่ค่านี้ใน `.env` |

ดู guard ของ migration ใหม่ได้จากฟังก์ชัน `_assert_*` ในไฟล์นั้น

---

## 3. รัน upgrade

```bash
python scripts/db_target.py alembic --target remote upgrade head
```

- migration ที่สำเร็จแล้วจะถูก commit แยกทีละตัว → ถ้าล้มกลางทาง database จะค้างที่ตัวสุดท้ายที่สำเร็จ **ไม่เสียข้อมูล**
- ดูว่าไปถึงไหน: `python scripts/db_target.py alembic --target remote current`
- รันต่อได้ทันทีหลังแก้สาเหตุ (alembic ไม่รันซ้ำตัวที่สำเร็จแล้ว)

### ตรวจหลัง upgrade

```bash
python -c "
import asyncio, asyncpg
from dotenv import dotenv_values
u = dotenv_values('.env')['DATABASE_URL'].replace('postgresql+asyncpg://','postgresql://')
async def m():
    c = await asyncpg.connect(u, timeout=15)
    print('rev:', await c.fetchval('select version_num from alembic_version'))
    print('tables:', await c.fetchval(\"select count(*) from information_schema.tables where table_schema='public'\"))
    await c.close()
asyncio.run(m())
"
```

---

## 4. กับดักที่เจอมาแล้วจริง

### `ENVIRONMENT=production` ทำให้ script ที่ไม่ต้องใช้ LINE ล้ม

`app/core/config.py:302` สร้าง `settings` แล้วเรียก `enforce_production_guards()`
ทันทีตอน import — ถ้า `ENVIRONMENT=production` แล้วขาด `LINE_LOGIN_CHANNEL_ID`,
`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` จะได้:

```
RuntimeError: Unsafe production configuration:
- LINE_LOGIN_CHANNEL_ID must be set in production for LIFF token verification.
...
```

**อย่าเพิ่ม bypass ใน config** (จะกลายเป็นช่องโหว่ถาวร) — สำหรับ script บำรุงรักษา
ให้ override เฉพาะตอนรัน:

```bash
ENVIRONMENT=development python scripts/backfill_line_id_hash.py --apply
```

`LINE_ID_HMAC_KEY` ถูกอ่านก่อน fallback เสมอ hash ที่ได้จึงยังถูกต้อง

### `sa.Enum(create_type=False)` ไม่ทำงาน

ถ้าเขียน migration แบบนี้:

```python
sa.Column("role", sa.Enum("A", "B", name="userrole", create_type=False))  # ผิด
```

SQLAlchemy จะยัง emits `CREATE TYPE` → `DuplicateObjectError` บน database ที่มี type อยู่แล้ว
ต้องใช้:

```python
from sqlalchemy.dialects import postgresql
sa.Column("role", postgresql.ENUM("A", "B", name="userrole", create_type=False))  # ถูก
```

`create_type` เป็น attribute ของ `postgresql.ENUM` เท่านั้น `sa.Enum` ไม่มี (ตรวจได้ด้วย
`getattr(sa.Enum(name='x'), 'create_type', 'ABSENT')`)

### Pooler port

Supabase มี 2 port:

- **5432** — session mode ใช้กับ alembic / asyncpg ได้ ✅
- **6543** — transaction mode ใช้กับ migration ไม่ได้ (prepared statement ไม่รอดข้าม transaction)

### DNS ล่มกลางทาง

ถ้าเจอ `socket.gaierror: [Errno 11001] getaddrinfo failed` หรือ `Could not resolve host: github.com`
ให้ตรวจ DNS ทั้งเครื่องก่อน (`nslookup github.com`) — เป็นปัญหาที่เครื่อง ไม่ใช่ที่ Supabase
ลอง `ipconfig /flushdns` หรือรอแล้วลองใหม่

---

## 5. หลังใช้เสร็จ

```bash
rm backend/.env
```

`backend/.env` มี `SECRET_KEY` และ `ENCRYPTION_KEY` ของ production แบบ plaintext —
ถ้าเครื่องนี้ไม่ใช่เครื่องที่ดูแล production ควรลบทิ้ง ค่าจริงยังอยู่ใน `secrets/secret-keys.txt`
(ไฟล์นั้นก็ gitignore ไว้เช่นกัน)

---

## ภาคผนวก: คำสั่งด่วน

```bash
# production อยู่ revision ไหน
python scripts/db_target.py alembic --target remote current

# production ตามหลังกี่ตัว
python -m alembic history -r $(python scripts/db_target.py alembic --target remote current 2>/dev/null | tail -1):head | wc -l

# ตรวจว่า migration ใหม่จะบังคับอะไร
grep -n "_assert_" alembic/versions/<ไฟล์>.py

# ตรวจ enum มีค่าอะไร
python -c "
import asyncio, asyncpg
from dotenv import dotenv_values
u = dotenv_values('.env')['DATABASE_URL'].replace('postgresql+asyncpg://','postgresql://')
async def m():
    c = await asyncpg.connect(u, timeout=15)
    print([r['enumlabel'] for r in await c.fetch(\"select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='userrole' order by enumsortorder\")])
    await c.close()
asyncio.run(m())
"
```
