# LINE User ID Display Masking — Implementation Plan

> **For agentic workers:** Implement task-by-task, run validation after each task. Frontend-only — zero backend changes.

**Goal:** ลบ raw LINE user ID (`U` + hex 32) ออกจากทุก display point ใน admin UI — แทนด้วย masked format `U＊＊＊＊...<last4>` เมื่อไม่มี display_name

**Architecture:** เพิ่ม pure helper `maskLineUserId()` ใน `frontend/lib/mask.ts` + unit tests แล้วเปลี่ยนทุก JSX render point ที่แสดง raw ID ให้เรียก helper — ไม่แตะ API calls, WS payloads, React keys, route params, Zustand state

**Tech Stack:** Next.js/React + TypeScript; Vitest + @testing-library/react

## Global Constraints

- **Frontend-only**: `git diff --stat main -- backend/` ต้องว่าง
- **ไม่เปลี่ยน API contract**: ทุก fetch/WS call ยังส่ง/รับ raw `line_user_id` เหมือนเดิม
- **ไม่เปลี่ยน internal identifiers**: React keys, Zustand `selectedId`, URL params, localStorage keys คงเดิม
- **Masked format**: `U＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊98ab` — first char + fullwidth `＊` × (len-5) + last 4
- **UI text เป็นภาษาไทย** (labels); code เป็นอังกฤษ
- **Baseline tests**: frontend unit 409+ pass, `npm run build` pass, `npm run lint` 0 new errors

---

## File Structure

- `frontend/lib/mask.ts` — **สร้างใหม่**: `maskLineUserId(id: string | null | undefined): string`
- `frontend/lib/__tests__/mask.test.ts` — **สร้างใหม่**: unit tests (null, short, normal 33-char, non-U prefix)
- `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` — line 151 display + line 78 copy (ลบ) + lines 212,218 export filenames
- `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` — line 83 data fallback + lines 203, 225
- `frontend/app/admin/live-chat/_components/ConversationList.tsx` — line 213 search fallback
- `frontend/app/admin/friends/page.tsx` — line 395 aria-label + line 420
- `frontend/app/admin/friends/[lineUserId]/page.tsx` — line 254
- `frontend/app/admin/friends/history/page.tsx` — line 300
- `frontend/app/admin/users/page.tsx` — line 499
- `frontend/app/admin/users/[id]/page.tsx` — lines 295, 443
- `frontend/app/admin/chat-histories/page.tsx` — lines 257, 276, 311, 335
- `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` — line 109 fallback + line 237 + lines 174,197 export filenames

---

## Task 1: Helper + Unit Tests (TDD)

**Files:**
- Create: `frontend/lib/mask.ts`
- Create: `frontend/lib/__tests__/mask.test.ts`

**Interfaces:**
- `maskLineUserId(id: string | null | undefined): string`
  - `null`/`undefined`/`''` → `'-'`
  - length ≤ 6 → `'＊'.repeat(6)`
  - normal → `id[0] + '＊'.repeat(id.length - 5) + id.slice(-4)`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { maskLineUserId } from '../mask'

describe('maskLineUserId', () => {
  it('returns dash for null/undefined/empty', () => {
    expect(maskLineUserId(null)).toBe('-')
    expect(maskLineUserId(undefined)).toBe('-')
    expect(maskLineUserId('')).toBe('-')
  })

  it('masks short IDs entirely', () => {
    expect(maskLineUserId('U1234a')).toBe('＊＊＊＊＊＊')
  })

  it('masks a real LINE user ID keeping first char and last 4', () => {
    const id = 'U4af4980abcdef1234567890abcdef98ab'
    const result = maskLineUserId(id)
    expect(result).toBe('U' + '＊'.repeat(id.length - 5) + '98ab')
    expect(result).not.toContain('4af4980')
  })

  it('preserves output length equal to input length', () => {
    const id = 'U4af4980abcdef1234567890abcdef98ab'
    expect(maskLineUserId(id).length).toBe(id.length)
  })
})
```

- [ ] **Step 2: Implement helper**

```typescript
export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return '-'
  if (id.length <= 6) return '＊'.repeat(6)
  return `${id[0]}${'＊'.repeat(id.length - 5)}${id.slice(-4)}`
}
```

- [ ] **Step 3: Validate** — `npm run test:unit -- lib/__tests__/mask.test.ts`

---

## Task 2: Live Chat Components

**Files:**
- Modify: `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`
- Modify: `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx`
- Modify: `frontend/app/admin/live-chat/_components/ConversationList.tsx`

- [ ] **Step 1: CustomerPanel.tsx**
  - Import `maskLineUserId` from `@/lib/mask`
  - Line ~151: `{currentChat.line_user_id}` → `{maskLineUserId(currentChat.line_user_id)}`
  - Line ~78: **ลบ Copy button + handler ออกทั้งชุด** (clipboard.writeText + button element) — masked value ไม่มีประโยชน์ที่จะ copy; ถ้าต้อง reveal raw ID ในอนาคต = reveal flow + audit log (แยก PR)
  - Lines ~212,218: export filename → sanitize display_name fallback:
    ```typescript
    const exportBase = (currentChat.display_name || 'conversation').replace(/[^\w\u0E00-\u0E7F-]/g, '_')
    ```
    ใช้ `exportBase` แทน `currentChat.line_user_id` ใน filename

- [ ] **Step 2: CreateChatSheet.tsx**
  - Line ~83: data-level fallback `display_name: (item.display_name as string) || (item.line_user_id as string)` → `|| maskLineUserId(item.line_user_id as string)` (กัน raw ID รั่วเข้า display_name ที่ render ที่ lines 200/222 + alt text 195/217)
  - Line ~203: `{user.line_user_id}` → `{maskLineUserId(user.line_user_id)}`
  - Line ~225: `{selectedUser.line_user_id}` → `{maskLineUserId(selectedUser.line_user_id)}`

- [ ] **Step 3: ConversationList.tsx**
  - Line ~213: `{result.display_name || result.line_user_id}` → `{result.display_name || maskLineUserId(result.line_user_id)}`

- [ ] **Step 4: Validate** — `npm run build` (type check) + grep confirm no raw render เหลือใน 3 ไฟล์

---

## Task 3: Friends Pages

**Files:**
- Modify: `frontend/app/admin/friends/page.tsx`
- Modify: `frontend/app/admin/friends/[lineUserId]/page.tsx`
- Modify: `frontend/app/admin/friends/history/page.tsx`

- [ ] **Step 1: friends/page.tsx**
  - Line ~420: `{friend.line_user_id.substring(0, 8)}...` → `{maskLineUserId(friend.line_user_id)}`
  - Line ~395: aria-label fallback `friend.display_name || friend.line_user_id` → `friend.display_name || maskLineUserId(friend.line_user_id)` (screen reader อ่าน raw ID เต็ม)

- [ ] **Step 2: friends/[lineUserId]/page.tsx**
  - Line ~254: `{lineUserId}` → `{maskLineUserId(lineUserId)}`
  - GOTCHA: route param ยังเป็น raw — เปลี่ยนเฉพาะ render

- [ ] **Step 3: friends/history/page.tsx**
  - Line ~300: `{event.line_user_id.substring(0, 12)}...` → `{maskLineUserId(event.line_user_id)}`

- [ ] **Step 4: Validate** — `npm run build`

---

## Task 4: Users + Chat Histories Pages

**Files:**
- Modify: `frontend/app/admin/users/page.tsx`
- Modify: `frontend/app/admin/users/[id]/page.tsx`
- Modify: `frontend/app/admin/chat-histories/page.tsx`
- Modify: `frontend/app/admin/chat-histories/[lineUserId]/page.tsx`

- [ ] **Step 1: users/page.tsx**
  - Line ~499: คง ternary null-guard ไว้: `` u.username || (u.line_user_id ? `LINE:${maskLineUserId(u.line_user_id)}` : '-') ``
    (GOTCHA: ถ้าแทนตรงๆ โดยไม่คง ternary → null case จะได้ `LINE:-`)

- [ ] **Step 2: users/[id]/page.tsx**
  - Line ~295: `LINE: {userData.line_user_id}` → `LINE: {maskLineUserId(userData.line_user_id)}`
  - Line ~443: `{userData.line_user_id}` → `{maskLineUserId(userData.line_user_id)}`

- [ ] **Step 3: chat-histories/page.tsx**
  - Line ~276: `{lineUserId.substring(0, 8)}...` → `{maskLineUserId(lineUserId)}`
  - Line ~335: `{conv.line_user_id.substring(0, 8)}...` → `{maskLineUserId(conv.line_user_id)}`
  - Display name fallback (~257, ~311): `lineUserId.substring(0, 12)` → `maskLineUserId(lineUserId)`

- [ ] **Step 4: chat-histories/[lineUserId]/page.tsx**
  - Line ~237: `subtitle={lineUserId}` → `subtitle={maskLineUserId(lineUserId)}`
  - Line ~109: `detail.display_name || lineUserId.substring(0, 12)` → `detail.display_name || maskLineUserId(lineUserId)`
  - Lines ~174,197: export filenames `chat-${lineUserId}-...` → ใช้ sanitized display name:
    ```typescript
    const exportBase = (displayName || 'chat').replace(/[^\w\u0E00-\u0E7F-]/g, '_')
    ```
    แล้วใช้ `` `chat-${exportBase}-${date}.txt` `` / `.csv`

- [ ] **Step 5: Validate** — `npm run build`

---

## Task 5: Final Validation + Sweep

- [ ] **Step 1: Full test suite** — `npm run test:unit` (expect 409+ pass)
- [ ] **Step 2: Lint** — `npm run lint` (0 new errors)
- [ ] **Step 3: Build** — `npm run build`
- [ ] **Step 4: Grep sweep** — confirm ไม่มี JSX render point ที่แสดง raw ID เหลือ:
  ```bash
  # ใน frontend/app/ + frontend/components/ — หา render ที่ reference line_user_id โดยไม่ผ่าน mask
  grep -rn "line_user_id" frontend/app frontend/components --include="*.tsx" | grep -v "maskLineUserId" | grep -v "// " | grep -v "fetch\|api\|url\|URL\|key=\|selectedId\|optionId\|router\|href\|params\|localStorage"
  ```
  ผลลัพธ์ที่เหลือต้องเป็น internal use เท่านั้น (keys, API calls, params) — ไม่ใช่ display text
- [ ] **Step 5: Backend diff check** — `git diff --stat main -- backend/` = ว่าง

---

## Validation Summary

| Check | Command | Expected |
|-------|---------|----------|
| Unit tests | `npm run test:unit` | 409+ pass (รวม mask tests ใหม่) |
| Lint | `npm run lint` | 0 new errors |
| Build | `npm run build` | success |
| No raw ID rendered | grep sweep | เฉพาะ internal use เท่านั้น |
| Backend untouched | `git diff --stat main -- backend/` | empty |
