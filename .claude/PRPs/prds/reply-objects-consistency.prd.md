# Reply-Objects System: Consistency & Completeness Audit

## Problem Statement

ระบบ reply-objects มีความไม่สอดคล้องระหว่าง backend model, API endpoints, response parser, และ frontend UI ในหลายจุด — ทำให้ admin สามารถสร้าง reply object บางประเภท (VIDEO, AUDIO, IMAGEMAP) ได้แต่ไม่สามารถใช้งานจริงได้ เพราะ response_parser ไม่รองรับ นอกจากนี้ broadcast ไม่สามารถอ้างอิง reply objects ได้ และ frontend auto-replies page ใช้ URL ที่ทำให้เข้าใจผิด

## Evidence

1. **response_parser.py รองรับแค่ 5 จาก 8 types** — VIDEO, AUDIO, IMAGEMAP ถูกสร้างได้แต่ resolve ไม่ได้ (silent fail)
2. **Broadcast ไม่รองรับ reply objects** — ต้อง compose content ใหม่ทุกครั้ง ไม่สามารถอ้างอิง `$object_id` ได้
3. **Frontend reply-objects dropdown มี 7 types แต่ model มี 8** — IMAGEMAP หายไปจาก dropdown
4. **Auto-reply responses ใน frontend มีแค่ 5 types** — หายไป audio, location, imagemap, template
5. **MatchType enum ไม่ตรงกัน** — AutoReply มี 3 values, Intent มี 4 (missing STARTS_WITH)
6. **URL `/admin/auto-replies` ทำให้เข้าใจผิด** — จริงๆ จัดการ Intent Categories ไม่ใช่ auto_replies table
7. **Broadcast MULTI type รองรับแค่ text/image/flex** — sticker, video, audio, location ถูกละเลย
8. **quick_reply และ coupon message types ไม่มีในระบบเลย**

## Proposed Solution

ปรับปรุงความสอดคล้องของระบบ reply-objects ให้ครบทุก layer — เพิ่ม message types ที่ขาด (TEMPLATE, QUICK_REPLY), แก้ response_parser ให้รองรับทุก type, เพิ่มการอ้างอิง reply-object ใน broadcast, และปรับ frontend ให้ตรงกับ backend

## Key Hypothesis

We believe การปรับปรุงความสอดคล้องของ reply-objects system จะลดความสับสนของ admin และป้องกัน silent failures เมื่อใช้ reply objects บางประเภท เราจะรู้ว่าถูกต้องเมื่อ admin สามารถสร้าง reply object ทุกประเภทและใช้งานได้จริงใน auto-reply และ broadcast

## What We're NOT Building

- **New message types (coupon, imagemap builder UI)** — ใช้ raw JSON payload editor ต่อไป
- **Visual template builder** — ยังใช้ JSON editor
- **Migration ของ legacy AutoReply data** — ยังคง backward compatibility
- **Real-time preview** — ยังใช้ preview_url แบบ static

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Message types ที่ resolve ได้จริง | 8/8 types | Manual test ทุก type ผ่าน webhook |
| Reply object引用ใน broadcast | ใช้ได้ | ส่ง broadcast ด้วย `$object_id` สำเร็จ |
| Frontend dropdown ครบ | ตรงกับ backend model | เปรียบเทียบ enum values |
| response_parser coverage | 100% | Unit tests ทุก type |

## Open Questions (Resolved)

- [x] Broadcast 引用 reply objects → ใช้ `$object_id` syntax (consistent กับ auto-reply)
- [x] TEMPLATE message type → เพิ่มใน ReplyObject model ให้ครบทุกรายการ
- [x] quick_reply → เพิ่มเป็น message type ใน ReplyObject

---

## Users & Context

**Primary User**
- **Who**: Admin/Operator ที่จัดการ chatbot responses และ broadcast messages
- **Current behavior**: สร้าง reply objects บางประเภทแล้วพบว่าใช้ไม่ได้จริง
- **Trigger**: ต้องการ reuse message template ใน broadcast แต่ทำไม่ได้
- **Success state**: สร้าง reply object 任何类型 → ใช้ได้ใน auto-reply AND broadcast

**Job to Be Done**
When ต้องการส่ง message template เดิมซ้ำใน broadcast, I want to 引用 reply object ที่มีอยู่แล้ว, so I can ประหยัดเวลาและลดความผิดพลาด

**Non-Users**
- LINE end-users (ไม่เห็น reply objects โดยตรง)
- Developer ที่ไม่เกี่ยวกับ chatbot system

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | response_parser รองรับ VIDEO, AUDIO, IMAGEMAP | ป้องกัน silent failure |
| Must | Frontend reply-objects dropdown ครบ 8 types | ตรงกับ backend model |
| Must | Frontend auto-replies response types ครบ | ลดความสับสน |
| Should | Broadcast 引用 reply objects ได้ | อำนวยความสะดวก |
| Should | MatchType enum 统一 | ลด bug จาก enum mismatch |
| Could | quick_reply message type | เพิ่ม LINE feature coverage |
| Won't | coupon/imagemap builder UI | ใช้ JSON editor ต่อไป |

### MVP Scope

1. แก้ response_parser ให้รองรับ VIDEO, AUDIO, IMAGEMAP
2. เพิ่ม IMAGEMAP ใน frontend dropdown
3. เพิ่ม audio, location, imagemap, template ใน auto-reply response types
4. เพิ่ม reply-object引用ใน broadcast compose

### User Flow

```
Admin สร้าง reply object (VIDEO type)
  → บันทึกสำเร็จ
  → ไปที่ auto-reply → เพิ่ม response → เลือก type = video
  → ใช้ $object_id reference
  → User ส่ง keyword → ได้รับ video message จริง
  → ไปที่ broadcast → compose → 引用 $object_id
  → ส่ง broadcast → User ได้รับ video message
```

---

## Technical Approach

**Feasibility**: HIGH — เป็นการแก้ไข code ที่มีอยู่ ไม่ใช่สร้างใหม่

**Architecture Notes**
- response_parser.py `build_message_from_object()` ต้องเพิ่ม cases สำหรับ VIDEO, AUDIO, IMAGEMAP
- Broadcast compose UI ต้องเพิ่ม reply-object picker หรือ $object_id input
- Frontend dropdowns ต้อง sync กับ backend enums

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| IMAGEMAP payload format ซับซ้อน | MEDIUM | ใช้ raw JSON editor ต่อไป |
| Broadcast reply-object resolution ช้า | LOW | Cache reply objects |
| Legacy AutoReply data สูญหาย | LOW | ไม่ touch legacy data |

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Fix response_parser | เพิ่ม VIDEO, AUDIO, IMAGEMAP handling | complete | - | - | `.claude/PRPs/reports/reply-objects-consistency.phase1-report.md` |
| 2 | Sync frontend types | ปรับ dropdowns ให้ตรง backend | complete | - | - | `.claude/PRPs/reports/reply-objects-consistency.phase2-5-report.md` |
| 3 | Broadcast reply-objects | เพิ่ม $object_id support ใน broadcast | complete | - | 1 | `.claude/PRPs/reports/reply-objects-consistency.phase2-5-report.md` |
| 4 | MatchType unification | 统一 MatchType enum | complete | with 2 | - | `.claude/PRPs/reports/reply-objects-consistency.phase2-5-report.md` |
| 5 | Tests & validation | Unit tests + manual verification | complete | - | 1,2,3,4 | `.claude/PRPs/reports/reply-objects-consistency.phase2-5-report.md` |

### Phase Details

**Phase 1: Fix response_parser**
- **Goal**: VIDEO, AUDIO, IMAGEMAP objects ใช้ได้จริง
- **Scope**: `backend/app/services/response_parser.py` — เพิ่ม 3 cases ใน `build_message_from_object()`
- **Success signal**: `$video_test` reference → user ได้รับ video message

**Phase 2: Sync frontend types**
- **Goal**: Frontend dropdowns ตรงกับ backend enums
- **Scope**: reply-objects page (เพิ่ม IMAGEMAP), auto-replies page (เพิ่ม audio, location, imagemap, template)
- **Success signal**: ทุก type ใน dropdown ตรงกับ backend model

**Phase 3: Broadcast reply-objects**
- **Goal**: Broadcast สามารถ引用 reply objects ได้
- **Scope**: broadcast compose UI + broadcast service
- **Success signal**: ส่ง broadcast ด้วย `$object_id` → user ได้รับ message

**Phase 4: MatchType unification**
- **Goal**: ทุกระบบใช้ MatchType เดียวกัน
- **Scope**: backend models + frontend dropdowns
- **Success signal**: STARTS_WITH ใช้ได้ทั้ง legacy และ intent systems

**Phase 5: Tests & validation**
- **Goal**: ยืนยันทุก type ทำงานได้จริง
- **Scope**: Unit tests + manual E2E test
- **Success signal**: 8/8 message types resolve ได้, broadcast 引用 ได้

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| IMAGEMAP UI | Raw JSON editor | Visual builder | ซับซ้อนเกินไปสำหรับ MVP |
| Legacy AutoReply | Keep as-is | Migrate to intents | Backward compatibility |
| Broadcast reference | $object_id syntax | Picker UI | Consistent กับ auto-reply |

---

## Research Summary

**Codebase Context**
- response_parser.py รองรับ 5/8 types (VIDEO, AUDIO, IMAGEMAP ขาด)
- Frontend reply-objects dropdown มี 7/8 types (IMAGEMAP ขาด)
- Frontend auto-replies response types มี 5/9 types (audio, location, imagemap, template ขาด)
- Broadcast ไม่รองรับ reply object references เลย
- MatchType enum: AutoReply 3 values, Intent 4 values

---

*Generated: 2026-05-31*
*Status: DRAFT - needs validation*
