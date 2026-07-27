# LINE User ID Display Masking (Approach 1 — UI Layer)

## Problem Statement

แม้ว่า storage layer จะ pseudonymize แล้ว (PR A/B merged, `LINE_ID_STORAGE_MODE=dual` บน prod) แต่ **admin panel ยังแสดง raw LINE user ID (`U` + hex 32 ตัว) ตรงๆ ให้ operator เห็นใน 10+ จุด** — โดยเฉพาะหน้า Live Chat (CustomerPanel แสดงเต็ม + ปุ่ม Copy), CreateChatSheet, Users, Friends, Chat Histories

การแสดง raw identifier ของประชาชนบนหน้าจอ operator = **PDPA exposure ในชั้น display** — ข้อมูลส่วนบุคคลถูกเปิดเผยต่อบุคคลที่สาม (admin staff) โดยไม่จำเป็น เพราะ operator ไม่เคยต้องใช้ raw ID ในการทำงานจริง (ใช้ display_name ตลอด)

นอกจากนี้ raw ID ยังรั่วผ่าน:
- Browser URL (`/admin/live-chat?chat=U4af4980...`, `/admin/friends/U4af4980...`)
- Clipboard (ปุ่ม Copy LINE ID)
- Export files (CSV/PDF มี column "line_user_id" เต็ม)
- localStorage keys (`livechat:notes:U4af4980...`)

## Evidence

- **Audit 2026-07-27** (Qoder Explore agents): ยืนยัน 10+ จุด frontend แสดง raw ID; backend ส่ง raw ID ในทุก API response + ทุก WS event payload
- **PRD line-id-pseudonymization.prd.md** ระบุชัด: "Display masking ใน UI (Approach 1) → แยกเป็นอีก PR (frontend-only, ทำคู่กันได้ — แนะนำให้ทำก่อนเพราะคุ้ม/เสี่ยงต่ำสุด)"
- **Operator workflow จริง**: ไม่เคยต้อง copy/paste raw LINE ID — การ debug ใช้ admin panel search (display_name) เท่านั้น; LINE push ใช้ backend internal resolve
- **Precedent**: chat-histories page ใช้ `lineUserId.substring(0, 8)...` (truncated) อยู่แล้ว — ยืนยันว่า truncated/masked display เป็นที่ยอมรับใน UI นี้

## Proposed Solution

**Frontend-only display masking** — ทุกจุดที่ render raw `line_user_id` ให้ operator เห็น เปลี่ยนเป็น:

1. **Primary**: `display_name` (มีอยู่แล้วในทุก context ที่แสดง ID)
2. **Fallback** (เมื่อไม่มี display_name): masked format `U＊＊＊＊...<last4>` (เช่น `U＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊98ab`) — ใช้ helper function เดียว `maskLineUserId(id: string): string`

### Changes by component:

| Component | ปัจจุบัน | เปลี่ยนเป็น |
|-----------|----------|-------------|
| `CustomerPanel.tsx:151` | แสดง raw เต็ม + Copy button | masked ID, **ลบ Copy button** |
| `CreateChatSheet.tsx:83` | raw ID รั่วเข้า `display_name` fallback | masked ID (กันรั่วทางอ้อมผ่าน render 200/222 + alt 195/217) |
| `CreateChatSheet.tsx:203,225` | raw เป็น subtitle | masked ID |
| `ConversationList.tsx:213` | fallback raw ใน search results | masked ID |
| `friends/page.tsx:420` | `substring(0,8)...` | masked ID (helper เดียวกัน) |
| `friends/page.tsx:395` | aria-label fallback raw เต็ม | masked ID (screen reader) |
| `friends/[lineUserId]/page.tsx:254` | raw เต็มใน header | masked ID |
| `friends/history/page.tsx:300` | `substring(0,12)...` | masked ID |
| `users/page.tsx:499` | `LINE:U12345678...` | `LINE:` + masked ID (คง ternary null-guard) |
| `users/[id]/page.tsx:295,443` | raw เต็ม 2 จุด | masked ID |
| `chat-histories/page.tsx:257,276,311,335` | `substring(0,8/12)...` + fallback | masked ID |
| `chat-histories/[lineUserId]/page.tsx:237` | raw เต็มเป็น subtitle | masked ID |
| `chat-histories/[lineUserId]/page.tsx:174,197` | export filename มี raw ID | sanitized display_name |
| Export filenames (CustomerPanel:212,218) | `${line_user_id}.csv` | `${display_name \|\| 'conversation'}.csv` (sanitize) |

### NOT changed (คง raw ID ไว้ภายใน):
- React keys, selection state, Zustand store keys — internal เท่านั้น ไม่แสดง
- API call parameters (`/conversations/${lineUserId}/...`) — API contract ไม่เปลี่ยน
- WS JOIN_ROOM / TYPING payloads — protocol ไม่เปลี่ยน
- Browser URL `?chat=` param — เปลี่ยนเป็น internal conversation identifier ต้องทำ backend ด้วย (แยก PR — Approach 4B)
- localStorage keys — คง key เดิม (เปลี่ยนแล้ว notes เดิมหาย = data loss โดยไม่จำเป็น; raw ID ใน key เห็นได้แค่ DevTools บนเครื่อง operator; แยก PR ได้)

### Helper:

```typescript
// frontend/lib/mask.ts
export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return '-'
  if (id.length <= 6) return '＊＊＊＊＊＊'
  return `${id[0]}${'＊'.repeat(id.length - 5)}${id.slice(-4)}`
}
```

ใช้ fullwidth asterisk (＊) เพื่อให้ชัดว่าเป็น masking ไม่ใช่ redacted block

## Key Hypothesis

We believe **การแทนที่ raw LINE user ID ด้วย masked format ในทุก display point** will **หยุดการเปิดเผย personal identifier ของประชาชนต่อ operator ผ่าน UI (PDPA display-layer compliance) โดยไม่กระทบ workflow จริง** for **admin panel ของระบบบริการประชาชนที่ต้อง comply PDPA**

We'll know we're right when **ไม่มี raw `U[0-9a-f]{32}` ปรากฏเป็น visible text ใน admin UI ใดๆ (grep + manual check ทุกหน้า), operator ยังทำงานได้ปกติ (search, open chat, export), และ test suite pass เท่าเดิม**

## What We're NOT Building

- **Backend API response masking** — API ยังคืน raw `line_user_id` (contract ไม่เปลี่ยน; admin-only + JWT protected; เปลี่ยน = Approach 4B แยก PR ใหญ่)
- **WS payload changes** — room routing ยังใช้ raw ID (architectural, แยก)
- **URL param changes** — `/admin/friends/[lineUserId]` routes ยังใช้ raw (ต้องเปลี่ยน backend endpoint ด้วย — แยก)
- **DB query read-cutover** — มี approved plan แยกแล้ว (windy-brook-smew.md, 8 phases)
- **CSV/PDF export content masking** — export ยัง include raw ID column (operator data export = intentional feature; ถ้าจะ mask ต้องตัดสินใจ policy แยก)
- **LIFF pages** — end-user เห็น ID ของตัวเอง (ไม่ใช่ third-party disclosure)
- **Access control / audit logging** — แยก (Approach 2)

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Raw LINE ID visible ใน admin UI | 0 จุด | grep `line_user_id` ใน JSX render + manual check ทุกหน้า |
| Frontend unit tests | pass เท่าเดิม (409+) | `npm run test:unit` |
| Frontend build | pass | `npm run build` |
| ESLint | 0 new errors | `npm run lint` |
| Operator workflow | ไม่กระทบ (search, open chat, claim, export) | manual smoke test |
| Backend diff | 0 files | `git diff --stat main -- backend/` |

## Open Questions

- [x] **Masked format** → decided: `U＊＊＊＊...<last4>` (fullwidth asterisk, เก็บ first char + last 4 สำหรับ visual identification)
- [x] **Copy button** → decided: **ลบปุ่มออก** — masked value ไม่มีประโยชน์ที่จะ copy; ถ้าต้อง reveal raw ID ในอนาคต = reveal flow + audit log (Approach 2 แยก PR)
- [x] **localStorage notes keys** → decided: **คง key เดิม** (ไม่ทำ data loss; raw ID ใน localStorage key เห็นได้แค่ DevTools บนเครื่อง operator = minor risk, แยก PR ได้)

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-27 | Frontend-only scope | PRD เดิมแนะนำ; เสี่ยงต่ำสุด; ไม่กระทบ API contract; ทำขนาน read-cutover ได้ |
| 2026-07-27 | masked format เก็บ first char + last 4 | balance ระหว่าง privacy กับ visual identification (operator แยก user ได้จาก 4 ตัวท้าย) |
| 2026-07-27 | ไม่เปลี่ยน URL params / localStorage | ต้องเปลี่ยน backend ด้วย + data loss; แยก PR ถ้าจำเป็น |
| 2026-07-27 | ลบ Copy LINE ID button ออก (review R2) | best practice: masked value ไม่มีประโยชน์ที่จะ copy; reveal flow + audit log = แยก PR (Approach 2) |
| 2026-07-27 | localStorage notes keys คงเดิม (review R2) | ไม่ทำ data loss; raw ID ใน key เห็นได้แค่ DevTools บนเครื่อง operator = minor risk |
