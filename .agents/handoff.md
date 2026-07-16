# Handoff — 2026-07-16 (post-PR-2B-merge)

> **สถานะปัจจุบัน:** PR 2B Frontend Auth Migration merged เข้า main (`228e8f8`) แล้ว ทุก CI check ผ่านครบ

---

## สิ่งที่เสร็จล่าสุด

| PR | สถานะ | Commit บน main |
|---|---|---|
| PR 2A round-1 (#133) | ✅ Merged | Cookie Backend Foundation (P1.1a) — refresh rotation, family tracking, ws-ticket, dual-mode |
| PR 2A round-2 (#134) | ✅ Merged | ปิด review findings |
| PR 2B (#135) | ✅ Merged | Frontend cookie auth migration — CSRF+credentials, /auth/me bootstrap, single-flight refresh, Bearer→cookie migration, WS ticket auth, multi-tab sync, กันไว้ด้วย `NEXT_PUBLIC_COOKIE_AUTH` (default off) |

**Main branch:** `228e8f8` (origin/main sync แล้ว)
**Backend:** เป็น `COOKIE_AUTH_MODE=bearer` บน production (default เดิม)

---

## สิ่งที่ต้องทำต่อ (Roadmap)

### 1. Production Rollout (ทำในขึ้นบน production — ไม่ต้อง PR)

ขั้นตอนตาม PRD §Rollout:

1. **ขั้นตอน 1-2 (ทำได้เลย):** deploy main ใหม่ (ตอนนี้ merge แล้ว → CI จะ deploy อัตโนมัติ)
2. **ขั้นตอน 3 (dual mode):** flip `COOKIE_AUTH_MODE=dual` บน backend production + deploy backend
3. **ขั้นตอน 4 (cookie mode บน frontend):** flip `NEXT_PUBLIC_COOKIE_AUTH=true` บน frontend production + deploy frontend
4. **ขั้นตอน 5:** สังเกต 3-5 วัน

### 2. PR 2C — Cookie-Only Hardening (เริ่มได้เมื่อ production เสภียด)

- เปลี่ยน backend `COOKIE_AUTH_MODE=cookie` บล็อก Bearer ทั้งหมด
- ลบ `NEXT_PUBLIC_COOKIE_AUTH` flag ออกจาก frontend → cookie path กลายเป็น default
- Bearer→cookie migration ทำหน้าที่ cleanup
- SameSite=Strict + `__Host-` prefix (ตาม plan)

### 3. NEW-3 (Carry-over จาก PR 2A → PR 2B → PR 2C)

**LIVE_CHAT WebSocket ข้าม origin** ต้องใช้ ticket auth (ไม่ใช่ cookie ตรงๆ) — ค้างมาตั้งแต่ PR 2A round-2 เพราะ server จริงมี origin ต่างจาก frontend และ cookie ถูก SameSite=Lax บล็อก

**แนวทางแก้:**
ใช้ URL query param แทน header (FastAPI WS อ่านจาก query ได้):

```python
# backend/app/api/v1/endpoints/live_chat.py
from fastapi import WebSocket, Query
@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, ticket: str = Query(...)):
    payload = verify_ws_ticket(ticket)
    ...
```

Frontend connecting:
```js
const ws = new WebSocket(`wss://.../ws?ticket=${ticket}`);
```

**ทำตอนไหม:** รอ confirm จาก DIRECTOR/HEAD ว่า production architecture มี cross-origin WebSocket จริงหรือไม่

---

## บันทึกเพิ่มเติม

- ESLint ยัง lint ไฟล์ minified/build output (column numbers ใหญ่ถึง 8000+) — pre-existing issue ไม่ใช่ของ PR 2B แต่ควรเพิ่ม `.next/` ใน `.eslintignore`
- `git reset --hard origin/main` ต้องใช้เมื่อ local main ติด cache เก่า

**สร้างโดย:** Cline Agent (Arnutt-N/jsk-app)
**วันที่:** 2026-07-16
