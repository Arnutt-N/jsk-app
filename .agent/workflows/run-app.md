---
description: คำสั่งสำหรับเริ่มต้นรัน Backend และ Frontend ใน WSL (Native Speed)
---

# 🚀 การรันแอปพลิเคชันใน WSL (Native Mode)

**เพื่อความเร็วและเสถียรที่สุด** เราจะรันแอปบน **Native Filesystem** (ใน `~/projects/skn-app`) แทนการรันตรงๆ จาก Drive D:

> [!IMPORTANT]
> **ก่อนเริ่ม:** 
> 1. เปิด **Docker Desktop** (ใน Windows) ให้เรียบร้อย
> 2. เริ่มต้นรันจากคำสั่งด้านล่างนี้เสมอ

---

## 🟢 1. สำหรับครั้งแรก (First Run / Full Reset)

**ใช้คำสั่งนี้เมื่อ:** ต้องการสร้างโฟลเดอร์ใหม่ หรือ Reset สภาพแวดล้อมใหม่ทั้งหมด

```bash
WIN_REPO="${WIN_REPO:-/mnt/d/path/to/skn-app}" && \
WSL_REPO="${WSL_REPO:-$HOME/projects/skn-app}" && \
mkdir -p "$WSL_REPO" && \
rsync -av --exclude 'node_modules' --exclude '.next' "$WIN_REPO/frontend" "$WSL_REPO/" && \
rsync -av --exclude 'venv' --exclude 'venv_linux' --exclude '__pycache__' --exclude '.pytest_cache' "$WIN_REPO/backend" "$WSL_REPO/" && \
cd "$WSL_REPO/frontend" && \
npm install && \
npm run dev
```

---

## 🔄 2. สำหรับรันประจำวัน (Daily Run / Update Code)

**ใช้คำสั่งนี้เมื่อ:** ต้องการอัปเดตโค้ดล่าสุดจาก Windows ไป WSL และรันแอป (โดยไม่ลบ dependencies)

```bash
# Sync โค้ดล่าสุด > สั่งรัน Frontend
WIN_REPO="${WIN_REPO:-/mnt/d/path/to/skn-app}" && \
WSL_REPO="${WSL_REPO:-$HOME/projects/skn-app}" && \
rsync -av --exclude 'node_modules' --exclude '.next' "$WIN_REPO/frontend" "$WSL_REPO/" && \
rsync -av --exclude 'venv' --exclude 'venv_linux' --exclude '__pycache__' --exclude '.pytest_cache' "$WIN_REPO/backend" "$WSL_REPO/" && \
cd "$WSL_REPO/frontend" && \
npm install && \
npm run dev
```

---

## 🟡 3. รัน Backend แยก (ถ้าต้องการ)

ถ้าต้องการดู Log Backend แยกอีกหน้าต่าง ให้เปิด Terminal ใหม่แล้วรัน:

```bash
# Auto-install uv if missing
if ! command -v uv &> /dev/null; then curl -LsSf https://astral.sh/uv/install.sh | sh && source $HOME/.cargo/env; fi && \
WSL_REPO="${WSL_REPO:-$HOME/projects/skn-app}" && \
cd "$WSL_REPO/backend" && \
source venv_linux/bin/activate && \
uv pip install -r requirements.txt && \
python run.py --target local --host 0.0.0.0
```

---

## 🔵 4. รัน Database (ทำครั้งเดียว)

```bash
docker-compose up -d db redis
```

---

## 🔗 ช่องทางการเข้าถึง
- **Frontend App:** [http://localhost:3000](http://localhost:3000) (เร็วปรู๊ดปร๊าด)
- **Backend API:** [http://localhost:8000/docs](http://localhost:8000/docs)
