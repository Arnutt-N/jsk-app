# Session Summary — claude_code — 2026-07-08T21:16:00+07:00

**Branch**: `main`  **HEAD**: `d8ed435`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260708-2116.json`

## Objective
ใช้ **systematic-debugging** แก้ปัญหา auto-scroll ที่แก้หลายรอบแล้วยังไม่ได้ (3899f86 + cac74f8) → หา root cause แทนการ patch ต่อเนื่อง

## Completed

### ✅ Phase 1: Root Cause Investigation (d8ed435)

**Problem identified:**
1. **Line 166:** `useEffect(..., [selectedId, messages.length])` 
   - `messages.length` ใน dependency → fire ทุกครั้งที่ messages เปลี่ยน
   - ซ้ำซ้อนกับ useEffect อีกตัว (line 146-151) ที่ทำหน้าที่เดียวกัน
   - Race condition: useEffect fire ก่อน messages render เสร็จ
   
2. **Line 161:** `setTimeout(() => { scroll... }, 100)` 
   - Hard-code 100ms ไม่เพียงพอสำหรับ messages เยอะ (>100 items)
   - Variable-height bubbles ใช้เวลา render มากกว่า
   - `scrollHeight` ยังไม่อัพเดตเป็นค่าสูงสุด → scroll ไม่ถึงล่าง

**Root cause confirmed:**
- User คลิกยูสเซอร์ใหม่ → `selectedId` เปลี่ยน → useEffect fire
- Messages load → `messages.length` เปลี่ยน → useEffect fire **อีกรอบ**
- `setTimeout(100)` run ก่อน layout complete → `scrollHeight` ยังไม่เต็ม
- จบลงที่ scroll ไปไม่ถึงล่างสุด (ยิ่ง messages เยอะ ยิ่งชัดเจน)

### ✅ Fix 1: ลบ messages.length ออกจาก dependency
```typescript
// Before: [selectedId, messages.length] ❌
// After:  [selectedId] ✅
}, [selectedId]);
```
- Fire เฉพาะตอนเปลี่ยน conversation (ไม่ fire ซ้ำตอน messages load)
- useEffect อีกตัว (line 146) handle auto-scroll สำหรับ messages ใหม่อยู่แล้ว

### ✅ Fix 2: เปลี่ยน setTimeout เป็น double requestAnimationFrame
```typescript
// Before: setTimeout(() => { scroll... }, 100) ❌
// After:  double rAF ✅
const rafId1 = requestAnimationFrame(() => {
  const rafId2 = requestAnimationFrame(() => {
    container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
  });
});
```
**Why double rAF:**
- rAF รอบแรก: รอ browser schedule repaint
- rAF รอบสอง: รอ layout/paint phase เสร็จจริง → `scrollHeight` อัพเดตแล้ว
- เชื่อถือได้กว่า hard-code timeout (ไม่ต้องเดาว่าควรรอนานแค่ไหน)
- รองรับ variable-height messages ได้ทุกขนาด

### ✅ Proper cleanup
```typescript
return () => {
  cancelAnimationFrame(rafId1);
  const rafId2 = (rafId1 as any).rafId2;
  if (rafId2) cancelAnimationFrame(rafId2);
};
```

## Changed Files
```
frontend/app/admin/live-chat/_components/ChatArea.tsx | +16 -7 lines
  - Remove messages.length from useEffect dependency (line 175)
  - Replace setTimeout with double requestAnimationFrame (line 159-173)
  - Add proper cleanup for nested rAF
```

## Verification
- ✅ `npx tsc --noEmit` → pass (0 errors)
- ⏳ ESLint running in background
- ⏳ Manual test pending: push → Vercel deploy → test บน production

## Next Steps
- **Push to trigger Vercel deployment**:
  ```bash
  git push
  ```
- **Manual test on production** (https://jsk-app.vercel.app/admin/live-chat):
  1. คลิกยูสเซอร์ที่มีแชทเยอะ (>100 messages) เช่น `U693cb72c4dff8525756775d5fce45296`
  2. Verify scroll ลงล่างสุดทันที (ไม่ค้างครึ่งทาง)
  3. เช็ค console logs → แสดง `scrollHeight` เต็มค่า และ fire เพียงครั้งเดียว
  4. Verify unread divider แสดงเมื่อ `unread_count > 0`

## Blockers
- _none_

## Notes
- **Why systematic-debugging skill:** หลัง 3+ rounds ของ quick fixes (3899f86, cac74f8) ยังไม่แก้ได้ → ต้องหา root cause แทน patch
- **Previous attempts failed because:**
  - 3899f86: เพิ่ม `setTimeout(100)` แต่ยังมี race condition จาก `messages.length` dep
  - cac74f8: force sort + เพิ่ม debug logs แต่ไม่ได้แก้ timing issue
- **This fix addresses root cause:**
  - ลบ dependency ที่ทำให้ fire ซ้ำ
  - ใช้ browser-native timing (rAF) แทน arbitrary timeout
  - สอดคล้องกับ systematic-debugging Phase 1-4 (investigate → pattern → hypothesis → implement)
- **Related useEffect:** line 146-151 ยังทำงานตามเดิม (auto-scroll เมื่อ messages เพิ่มและ user อยู่ใกล้ล่าง)

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
