# Region Migration: Colocate Stack in Frankfurt

## Problem Statement

Admin/operator ใช้งาน production dashboard (jsk-app.vercel.app) แล้วทุกอย่างช้ามาก — login ~3.5s, โหลดหน้า ~2-4s, เปลี่ยนเมนูช้า ทั้งที่ใช้เทคโนโลยีใหม่ (Next.js 16, FastAPI, async PostgreSQL) สาเหตุคือ Koyeb backend อยู่ Washington DC แต่ Supabase database อยู่ Mumbai ทำให้ทุก DB query เสีย ~500ms ต่อ roundtrip

## Evidence

- Health endpoint (DB + Redis ping): **~1.3s** consistently (warm requests)
- Login endpoint (DB query + bcrypt): **~3.5-4.2s**
- Swagger docs (no DB): **~1.2s** — Koyeb free tier base latency
- Koyeb header `x-koyeb-backend: was` confirms **Washington DC**
- Supabase connection string confirms **ap-south-1 (Mumbai)**
- Cross-region DB roundtrip measured at **~500ms** per query
- Same-region DB roundtrip expected: **~3-5ms** (100x improvement)

## Proposed Solution

ย้าย Supabase (database) และ Upstash (Redis) ไป Frankfurt region ให้อยู่ใกล้ Koyeb backend ที่จะย้ายไป Frankfurt เช่นกัน ลด inter-service latency จาก ~500ms เหลือ <5ms โดย Vercel frontend ยังอยู่ที่เดิม (CDN global)

## Key Hypothesis

We believe **colocating backend + database + Redis in Frankfurt** will **reduce all API response times by 5-10x** for **admin/operator users**.
We'll know we're right when **health check <200ms, login <1s, page load <1s**.

## What We're NOT Building

- Custom domain setup — ใช้ Koyeb free tier URL ไปก่อน
- Vercel region migration — CDN global อยู่แล้ว ไม่จำเป็น
- Database replication / multi-region — overkill สำหรับ scale ปัจจุบัน
- Application code changes — ปัญหาคือ infrastructure ไม่ใช่โค้ด

## Success Metrics

| Metric | Current | Target | How Measured |
|--------|---------|--------|--------------|
| Health check latency | ~1.3s | <200ms | `curl -w TTFB` to health endpoint |
| Login latency | ~3.5s | <1s | `curl -w Total` to login endpoint |
| Admin page load (perceived) | ~2-4s | <1s | Browser manual test |
| DB roundtrip | ~500ms | <5ms | Health endpoint TTFB delta |

## Open Questions

- [ ] Koyeb free tier Frankfurt — URL format จะเปลี่ยนเป็นอะไร?
- [ ] Supabase Frankfurt free tier — มี limitation ต่างจาก Mumbai ไหม?
- [ ] Upstash Frankfurt — region `eu-central-1` available ใน free tier?
- [ ] LINE webhook URL ต้องอัปเดตหลัง Koyeb URL เปลี่ยน

---

## Users & Context

**Primary User**
- **Who**: Admin และ Operator ที่ใช้ JSK Admin dashboard + Live Chat
- **Current behavior**: ล็อกอิน รอ 3-4 วินาที เปลี่ยนหน้า รอ 2-4 วินาที ทุกอย่างช้าจนรู้สึกได้
- **Trigger**: ใช้งาน production system ครั้งแรกหลัง deploy
- **Success state**: ใช้งานลื่นไหล ไม่รู้สึกว่ารอ

**Job to Be Done**
When ใช้งาน admin dashboard, I want to โหลดข้อมูลเร็ว, so I can ทำงานได้อย่างมีประสิทธิภาพ

**Non-Users**
- End users ที่ใช้ LINE OA (ไม่ได้เข้า admin dashboard)
- LIFF users — ใช้ Vercel CDN โดยตรง ไม่ค่อยกระทบ

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | สร้าง Supabase ใหม่ที่ Frankfurt (eu-central-1) | แก้ปัญหาหลัก DB latency |
| Must | Migrate schema (Alembic upgrade head) | ให้ DB ใหม่มีโครงสร้างครบ |
| Must | Migrate data จริง (admin user, geography, intents) | ให้ระบบทำงานได้ทันที |
| Must | สร้าง Upstash Redis ใหม่ที่ Frankfurt | Redis ต้องอยู่ใกล้ backend |
| Must | ย้าย Koyeb service ไป Frankfurt | Backend ต้องอยู่ region เดียวกับ DB |
| Must | อัปเดต env vars ทุกที่ (Koyeb, Vercel, GitHub) | ชี้ไป services ใหม่ |
| Must | อัปเดต LINE webhook URL | ให้ LINE ส่ง event มาถูกที่ |
| Should | ทดสอบ latency หลังย้าย | ยืนยันว่าเร็วขึ้นจริง |
| Could | ลบ Supabase/Upstash เดิม (Mumbai) | Cleanup หลังยืนยันว่าทุกอย่างทำงาน |
| Won't | Custom domain | ยังอยู่ช่วงทดสอบ ไม่จำเป็น |

### MVP Scope

ย้ายทุก service ไป Frankfurt + ยืนยัน health check <200ms + login <1s

### User Flow

```
Admin เปิด jsk-app.vercel.app/admin
  → Vercel serve static + proxy API ไป Koyeb (Frankfurt)
    → Koyeb query Supabase (Frankfurt) — <5ms roundtrip
      → Response กลับ <1s
```

---

## Technical Approach

**Feasibility**: **HIGH**

**Architecture Notes**
- Alembic dual-target (`db_target.py`) รองรับ remote migration อยู่แล้ว
- 27 migration files ครอบคลุม schema ทั้งหมด — `upgrade head` สร้าง schema ครบ
- มี sync scripts อยู่แล้ว: `sync_geography_to_supabase.py`, `sync_selected_tables_to_supabase.py`
- `seed_admin.py` สร้าง admin user ได้ทันที
- ไม่ต้องแก้ application code — แค่เปลี่ยน env vars

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Koyeb URL เปลี่ยน ลืมอัปเดตบางที่ | M | Checklist ครบทุก env var location |
| Data migration ไม่ครบ | L | ใช้ Alembic + seed scripts ที่มีอยู่ |
| Supabase Frankfurt ไม่มี free tier | L | เช็คก่อนสร้าง — Supabase มี free tier ทุก region |
| LINE webhook downtime | L | อัปเดต webhook URL หลังยืนยัน backend ready |

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Provision Frankfurt | สร้าง Supabase + Upstash ใหม่ที่ Frankfurt | complete | with 2 | - | `plans/region-migration-frankfurt-phase1-2.plan.md` |
| 2 | Prepare Migration | รวบรวม env vars + data export จาก DB เดิม | complete | with 1 | - | `plans/region-migration-frankfurt-phase1-2.plan.md` |
| 3 | Migrate Schema & Data | Run Alembic + seed + sync data ไป DB ใหม่ | complete | - | 1, 2 | - |
| 4 | Move Koyeb to Frankfurt | สร้าง/ย้าย Koyeb service ไป Frankfurt region | complete | - | 3 | - |
| 5 | Update All Env Vars | อัปเดต Vercel, GitHub secrets, LINE webhook | complete | - | 4 | - |
| 6 | Verify & Benchmark | ทดสอบ latency + functional test ทุกหน้า | complete | - | 5 | - |
| 7 | Cleanup | ลบ Supabase/Upstash/Koyeb เดิม | pending | - | 6 | - |

### Phase Details

**Phase 1: Provision Frankfurt**
- **Goal**: สร้าง Supabase project ใหม่ที่ eu-central-1 + Upstash Redis ใหม่ที่ Frankfurt
- **Scope**: สร้าง projects, จด connection strings
- **Success signal**: ได้ DATABASE_URL และ REDIS_URL ใหม่

**Phase 2: Prepare Migration**
- **Goal**: เตรียมข้อมูลที่ต้อง migrate + รวบรวม env vars ที่ต้องอัปเดต
- **Scope**: Export data สำคัญ, checklist env vars ทุก location
- **Success signal**: มี checklist ครบ + data export พร้อม

**Phase 3: Migrate Schema & Data**
- **Goal**: DB ใหม่มี schema + data ครบเหมือนเดิม
- **Scope**: `alembic upgrade head` + `seed_admin.py` + sync geography/intents
- **Success signal**: `verify_db.py` ผ่าน, admin login ได้

**Phase 4: Move Koyeb to Frankfurt**
- **Goal**: Backend ทำงานที่ Frankfurt, ชี้ไป DB/Redis ใหม่
- **Scope**: สร้าง/เปลี่ยน Koyeb service region + ใส่ env vars ใหม่
- **Success signal**: Health check ผ่าน, TTFB <200ms

**Phase 5: Update All Env Vars**
- **Goal**: ทุก service ชี้ไป infrastructure ใหม่
- **Scope**: Vercel NEXT_PUBLIC_API_URL, GitHub secrets, LINE webhook, CORS
- **Success signal**: Frontend เรียก backend ได้, LINE webhook ทำงาน

**Phase 6: Verify & Benchmark**
- **Goal**: ยืนยันว่าทุกอย่างทำงานและเร็วขึ้น
- **Scope**: Latency benchmark, functional test ทุกหน้า admin + live chat
- **Success signal**: Health <200ms, Login <1s, ทุกหน้าทำงานปกติ

**Phase 7: Cleanup**
- **Goal**: ลบ resources เดิมที่ไม่ใช้แล้ว
- **Scope**: ลบ Supabase Mumbai, Upstash เดิม
- **Success signal**: ไม่มี orphan resources

### Parallelism Notes

Phase 1 (Provision) และ Phase 2 (Prepare) ทำพร้อมกันได้เพราะไม่มี dependency ต่อกัน ที่เหลือต้องทำตามลำดับ

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Target region | Frankfurt | Washington DC | ใกล้ไทยกว่า ~180ms vs ~250ms |
| Vercel region | ไม่ย้าย | fra1 | CDN global อยู่แล้ว, rewrite proxy ผ่าน edge |
| Migration approach | Fresh DB + Alembic | pg_dump/restore | สะอาดกว่า, ใช้ tooling ที่มี |
| Data migration | Selective (admin + reference data) | Full dump | ช่วงทดสอบ data น้อย, seed scripts มีอยู่แล้ว |

---

## Research Summary

**Infrastructure Context**
- Koyeb free tier: Frankfurt (`fra`) และ Washington DC (`was`) เท่านั้น
- Supabase: มี `eu-central-1` (Frankfurt) ใน free tier
- Upstash: มี `eu-central-1` ใน free tier
- Measured cross-region latency: ~500ms per DB roundtrip
- Expected same-region latency: ~3-5ms

**Technical Context**
- Alembic migration system พร้อม (27 migrations, dual-target support)
- 28 SQLAlchemy models registered properly
- Sync scripts มีอยู่แล้ว (geography, selected tables)
- seed_admin.py พร้อมใช้
- ไม่ต้องแก้ application code — env vars only

---

*Generated: 2026-04-05*
*Status: DRAFT - ready for execution*
