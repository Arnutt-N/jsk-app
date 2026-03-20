---
description: How to migrate and set up the development environment on WSL2 (Ubuntu)
---

# 🚀 วิธีทำให้โปรเจกต์เร็วแรง 10 เท่าใน WSL

หากคุณพบปัญหา **"ช้า"** หรือ **"Hot Reload ไม่ทำงาน"** สาเหตุหลักคือการวางไฟล์ไว้ที่ไดรฟ์ Windows (`/mnt/d/...`)

## 💡 วิธีแก้ที่ถูกต้อง (Native WSL)

ทำตามขั้นตอนด้านล่างนี้เพียงครั้งเดียว เพื่อให้แอปทำงานได้เร็วที่สุด (ใช้ Turbopack ได้เต็มประสิทธิภาพ)

### 1. ย้ายไฟล์เข้าไปใน Linux
เปิด WSL แล้วรันคำสั่งนี้เพื่อย้ายโปรเจกต์ไปไว้ที่ Home folder ของ Linux:
```bash
# สร้างโฟลเดอร์สำหรับโปรเจกต์
mkdir -p ~/projects
WIN_REPO="${WIN_REPO:-/mnt/d/path/to/skn-app}"
WSL_REPO="${WSL_REPO:-$HOME/projects/skn-app}"

# Copy ไฟล์จากเครื่องปัจจุบัน (Drive D) ไปยัง Linux
cp -r "$WIN_REPO" "$WSL_REPO"

# เข้าไปยังโฟลเดอร์ใหม่
cd "$WSL_REPO"
```

### 2. ลง Dependencies ใหม่ (ใน Linux)
ในระบบ Linux ต้องใช้ node_modules ของ Linux เองเพื่อให้ทำงานได้เร็ว:
```bash
# ฝั่ง Frontend
cd frontend
rm -rf node_modules
npm install

# ฝั่ง Backend (ใช้ uv เพื่อความเร็วสูงสุด)
cd ../backend
rm -rf venv_linux

# ติดตั้ง uv (ถ้ายังไม่มี)
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.cargo/env

# สร้าง venv และลง lib ด้วย uv (เร็วกว่า pip 10-100 เท่า)
uv venv venv_linux
source venv_linux/bin/activate
uv pip install -r requirements.txt
```

### 3. เปิด VS Code จาก Linux
คุณยังสามารถใช้ VS Code บน Windows แก้โค้ดได้เหมือนเดิม แต่ต้องต่อผ่าน WSL:
```bash
WSL_REPO="${WSL_REPO:-$HOME/projects/skn-app}"
cd "$WSL_REPO"
code .
```

### 4. รันแอป (จะเร็วขึ้นทันตาเห็น!)
```bash
# Frontend
cd frontend && npm run dev
```

---

> [!IMPORTANT]
> **ทำไมถึงดีกว่า?**
> เมื่อไฟล์อยู่ในระบบ Linux โดยตรง WSL จะใช้ **Native File System Events** ทำให้ Next.js ตรวจเจอการเปลี่ยนโค้ดได้ "ทันที" โดยไม่ต้องใช้ Polling (ไม่กิน CPU) และรัน Turbopack ได้เร็วที่สุดครับ
