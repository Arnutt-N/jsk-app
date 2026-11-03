# Session Summary — claude_code (Claude Fable 5) — 2026-11-01T11:11:00+07:00

**Branch**: `chore/next-16-4-3-cve`  **HEAD**: `e6769f5`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20261101-1111.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Claude Fable 5 |
>

---

## สรุปสำหรับคุณ (อ่านอันนี้พอ)

**เรื่องที่ทำ:** อัปเกรด Next.js เพื่อปิดช่องโหว่ critical แล้วเจอว่า lint พัง 54 จุด
จึงเขียน PRD + PRP plan เพื่อแบ่งงานแก้เป็นสองเฟส

| ขั้น | ผล |
|---|---|
| อัป `next` 16.1.1 → **16.4.3** | `npm audit --omit=dev`: **4 critical → 0 critical** |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ `Compiled successfully in 68s` |
| `npm run lint` | ❌ **54 errors / 42 ไฟล์** (rule ใหม่จาก plugin) |
| PRD + PRP plan | ✅ เขียนเสร็จ แต่ **ยังไม่ validate** |
| `/prp-validate-plan` | ⏳ reviewers รัน 25+ นาที ยังไม่ส่งผล |

**ยังไม่ commit อะไรเลย** — `package.json`, `package-lock.json`, และ docs 2 ไฟล์ยังเป็น working tree

**สิ่งที่ต้องทำต่อทันที:** เก็บผล reviewer 2 ตัว (sonnet + opus) แล้วปิด Phase 3-6 ของ `/prp-validate-plan`

---

## Objective

ปิดช่องโหว่ production dependencies แบบ critical โดยไม่ทิ้ง lint แดงไว้ข้างหลัง

## Cross-Platform Context

- ต่อจาก session `2026-10-31T21:56` ซึ่งปิดงาน branch cleanup + reviewer suggestions ของ PR #301
- session ก่อนหน้า merge PR #307 (`outputFileTracingRoot`) และ #308 (calendar test date-independent)
- ยังไม่มี checkpoint ของ session `20261031-0000` ในระบบ (บันทึกไว้ใน summary ก่อนหน้าแล้ว)

## Completed

### 1. พบช่องโหว่ critical

`npm audit --omit=dev` บน `main` (`e6769f5`): **4 critical / 16 high** ใน production deps
สามตัวเป็น Next.js 16.1.1 เอง:

| Advisory | ประเภท |
|---|---|
| `GHSA-9g9p-9gw9-jx7f` | DoS ผ่า​น Image Optimizer `remotePatterns` |
| `GHSA-h25m-26qc-wcjf` | DoS ผ่าน RSC deserialization |
| `GHSA-ggv3-7p47-pfv8` | HTTP request smuggling ใน `rewrites` |

ตัวที่สี่ (`tinypool`) เป็น dev-only ไม่นับ
แอปมี `/api/v1` rewrites ใน `next.config.js` → ช่อง smuggling เกี่ยวข้องตรง ไม่ใช่ทฤษฎี

### 2. อัปเกรดแล้วได้ผลตามเป้า

`next` + `eslint-config-next` → `16.4.3` (advisory range คือ `9.3.4-canary.0 - 16.4.0`)

| Gate | ผล |
|---|---|
| `npm audit --omit=dev` | 4 critical → **0 critical** (เหลือ 3 high ที่เป็น dev chain) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | `✓ Compiled successfully in 68s` |

### 3. เจอ blocker: lint 54 errors

`next@16.4.3` ดึง `eslint-plugin-react-hooks@7.1.1` ผ่าน `eslint-config-next` (range `^7.0.0`)
7.1.1 เปิด `react-hooks/set-state-in-effect` เป็น **error** ที่ recommended preset

```
✖ 61 problems (54 errors, 7 warnings)
  53  react-hooks/set-state-in-effect
   1  react-hooks/immutability
```

54 errors ใน **42 ไฟล์** — ไม่ใช่บั๊กใหม่ แต่เป็นรูป "fetch ตอน mount" ที่ใช้ทั้งแอป

**กับดักที่ทดสอบแล้ว:** pin `eslint-config-next` กลับเป็น 16.1.1 **ไม่ช่วย** เพราะ plugin
resolve จาก `^7.0.0` เป็น 7.1.1 อยู่ดี — รัน lint ด้วย version ผสมแล้วยังได้ 54 errors เท่าเดิม

### 4. Probe rule เพื่อหาทางแก้ที่ถูกต้อง

ทดสอบกับ plugin ที่ติดตั้งจริงด้วย flat config ชั่วคราว (ลบไฟล์ probe แล้ว):

| Probe | รูปแบบ | ผล |
|---|---|---|
| C | `setState` ตรงๆ ใน effect | ❌ |
| E | `useCallback` fetcher, setState หลัง `await` | ❌ |
| H | plain `async function` ใน component body | ❌ |
| I | fetcher ที่เริ่มด้วย sync `setLoading` | ❌ |
| K | `useEffectEvent` wrapper | ❌ |
| L / M | ย้าย `setLoading` ไป click handler | ❌ |
| A / B | setState ใน nested async / `.then` ใน effect body | ✅ |
| G | async fn **ประกาศใน** effect body | ✅ |
| J | `await Promise.resolve()` บรรทัดแรกของ fetcher | ✅ |
| N | effect-local async fn + `reloadKey` สำหรับ refetch | ✅ |

**Probe N คือรูปแบบที่เลือก** — ผ่าน rule และยัง refetch ได้จริง
Probe J ผ่านแต่ **ปฏิเสธ** เพราะเป็นการหลอก linter ไม่ได้แก้อะไร
พร้อมกันนั้น cancellation guard ที่เพิ่มเข้ามาปิด race condition ตอน unmount ที่มีอยู่เดิม

### 5. เขียน PRD + PRP plan

| ไฟล์ | บรรทัด |
|---|---|
| `.claude/PRPs/prds/2026-11-01-next-16-4-3-react-hooks-rule.prd.md` | 173 |
| `.claude/PRPs/plans/2026-11-01-next-16-4-3-react-hooks-rule.plan.md` | 218 |

การแบ่งเฟสคำนวณจากโค้ดจริง ไม่ใช่ประมาณ:

| Phase | ไฟล์ | errors | เกณฑ์ |
|---|---|---|---|
| Phase 1 | **9** | 12 | fetcher มี call site เดียว |
| Phase 2 | **33** | 42 | fetcher ถูกเรียกซ้ำจากปุ่ม/pagination/post-save |

Phase 2 แบ่งย่อยเป็น Group A (refetch 1 จุด, 20 ไฟล์), B (2 จุด, 7 ไฟล์), C (หนัก, 6 ไฟล์)
โดย Group C ที่ต้องระวังที่สุด: `files/page.tsx` (5 fetchers), `lib/booking/store.ts`
(`loadSlots` 7 refs ใต้ LIFF flow), `WalkinBookingDialog.tsx`

## In Progress / Next Steps

1. **เก็บผล reviewer แล้วปิด `/prp-validate-plan`** — Phase 3 (consensus) → Phase 4 (score) →
   Phase 5 (report ที่ `.claude/PRPs/plan_reviews/`) → Phase 6 (output)
   ถ้าผลหายไปกับ session ให้รันใหม่ **อย่าเดา verdict**
2. ถ้าแผนผ่าน → implement Phase 1 (9 ไฟล์) แล้วเปิด PR
3. จากนั้น Phase 2 ตามลำดับ Group A → B → C ทีละ commit

## Blockers

- **Reviewers ค้าง** — sonnet + opus รัน 25+ นาที ยังไม่ส่ง verdict
- **ยังไม่ commit** — ทั้ง upgrade และ docs อยู่ใน working tree ถ้า session หายจะเสียงาน

## Deferred / Known limits

- ช่องโหว่ dev-only 3 ตัว (`tinypool`, `@vitest/mocker`, `jsdom` chain) ต้องรอ Vitest 5 ซึ่งเป็น major
- Test coverage ของ surface ที่แก้หนามาก: 42 ไฟล์มี test แค่ 7
  (`admin/bookings`, `admin/requests`, `admin/rich-menus` ×3, `liff/debt-mediation`,
  `components/ui/CalendarPickerTH`) — อีก 35 ไฟล์กันด้วย tsc/lint/build/Playwright smoke
  ซึ่งไม่ครอบ CRUD
- 1 ใน 54 errors ไม่ใช่ rule นี้: `app/liff/service-request/page.tsx:75` เป็น
  `react-hooks/immutability` — use-before-declare จริง ต้องแก้แยก

## Environment notes for the next agent

- run vitest: `node frontend/node_modules/vitest/vitest.mjs run --root frontend <path>`
  (`npx vitest` ใช้ไม่ได้บนเครื่องนี้)
- ผล test ทั้งชุดในเครื่องไม่น่าเชื่อถือ — CI คือผู้ตัดสิน
- `git show <rev>:<path>` ที่ path มี `/` ต้อง `export MSYS_NO_PATHCONV=1`
- `npm run build` เขียนทับ `frontend/next-env.d.ts` (build artifact) — revert ไม่ต้อง commit
- `handoff-new.cjs` รายงาน `validator: FAIL` เพราะหา `python` ไม่เจอใน subshell PATH
  ไม่ใช่ validation fail จริง — รัน `python .agents/scripts/validate_handoff_state.py --platform claude_code` ตรงๆ ได้ PASS

## Iron rule reminder (user-mandated 2026-10-13)

No key, token, password, or secret appears in this handoff, the checkpoint, the
PR body, or any log from this session. Secrets were handled by presence/count
checks only. Cite this rule in every handoff.
