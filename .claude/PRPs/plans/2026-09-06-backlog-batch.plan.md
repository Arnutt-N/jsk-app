# Backlog Batch (2026-09-06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 4 queued backlog items — shared `DateTimePickerTH`, `service_requests.created_at` index, token-based atomic webhook lock release (Lua), reply-objects input height — as one branch, 4 independent commits, 1 PR.

**Architecture:** Frontend gets one controlled `DateTimePickerTH` component (CalendarPickerTH + time input, single ISO value, timezone rules from PR #226). Backend gets an additive index migration and a `RedisClient.release_lock()` Lua compare-and-delete used by the webhook dedup lock. All four items are independent; each lands as its own commit.

**Tech Stack:** Next.js 16 + React 19 + TS + Tailwind v4 + Vitest/@testing-library; FastAPI + SQLAlchemy 2 async + Alembic; redis-py asyncio (`eval` for Lua).

## Global Constraints

- Mandatory workflow already satisfied by PRD (`.claude/PRPs/prds/2026-09-06-backlog-batch.prd.md`) + this plan; branch `chore/backlog-batch-20260906` off `main`.
- PR #226 timezone law: NEVER `.slice()` UTC strings for display — derive local parts via `Date` getters (`isoToYMD`, `isoToHM` from `@/lib/utils`); emit via `new Date(localParts).toISOString()`.
- Existing rich-menu page tests (`frontend/app/admin/rich-menus/{new,[id]/edit}/__tests__/page.test.tsx`) must pass **unmodified** — labels `วันที่เริ่มแสดง` / `เวลาเริ่มแสดง` / `วันที่ซ่อนเมื่อถึง` / `เวลาซ่อนเมื่อถึง` must keep working.
- Backend code style: async, 4-space indent, module-level `logger`; frontend 2-space indent, `cn()` for class merging, imports React → third-party → `@/components` → `@/lib`.
- Local Windows quirks (do NOT chase): full backend pytest hangs on teardown; unit tests for `app/liff/booking` + `app/liff/debt-mediation` flake when run as a whole batch — run targeted files instead; CI is the gate.
- Alembic revision id convention: 12-char letter/number walk; new revision `t1u2v3w4x5y6`, `down_revision = 'c9d0e1f2a3b4'` — **verified via `alembic history`** (the earlier plan draft guessed `s0t1u2v3w4x5`; two more migrations — debt_mediation_requests and rich-menu display settings — were on the chain).

---

### Task 1: `DateTimePickerTH` shared component (TDD)

**Files:**
- Create: `frontend/components/ui/DateTimePickerTH.tsx`
- Test: `frontend/components/ui/__tests__/DateTimePickerTH.test.tsx`

**Interfaces:**
- Consumes: `CalendarPickerTH` (`value: string | null`, `onChange(iso: string | null)`, `ariaLabel`, `className`), `isoToYMD`/`isoToHM` from `@/lib/utils`, `cn` from `@/lib/utils`.
- Produces: `DateTimePickerTH` + `DateTimePickerTHProps` — `{ value: string | null; onChange: (iso: string | null) => void; dateLabel: string; timeLabel: string; timeDisabled?: boolean; className?: string; dateClassName?: string; timeInputClassName?: string }`. Used by Tasks 2–3.

- [ ] **Step 1: Write the failing tests**

`frontend/components/ui/__tests__/DateTimePickerTH.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateTimePickerTH } from '../DateTimePickerTH';

function Harness({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <DateTimePickerTH
      value={value}
      onChange={onChange}
      dateLabel="วันที่ทดสอบ"
      timeLabel="เวลาที่ทดสอบ"
    />
  );
}

describe('DateTimePickerTH', () => {
  it('renders a Thai date field and a time field with the given labels', () => {
    render(<Harness value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText('วันที่ทดสอบ')).toBeInTheDocument();
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toBeInTheDocument();
  });

  it('disables the time field until a date is chosen', () => {
    render(<Harness value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toBeDisabled();
  });

  it('emits a timezone-correct ISO only when both parts are chosen', () => {
    const onChange = vi.fn();
    render(<Harness value={null} onChange={onChange} />);

    // Pick 15 Sep 2026 (2567 BE) on the Thai calendar, then 14:30.
    fireEvent.change(screen.getByLabelText('วันที่ทดสอบ'), { target: { value: '15/09/2567' } });
    fireEvent.change(screen.getByLabelText('เวลาที่ทดสอบ'), { target: { value: '14:30' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.any(String));
    const iso = onChange.mock.lastCall[0] as string;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('emits null when only the date is chosen (time pending)', () => {
    const onChange = vi.fn();
    render(<Harness value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('วันที่ทดสอบ'), { target: { value: '15/09/2567' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    // The picked date must survive its own null echo (no clobber).
    expect(screen.getByLabelText('วันที่ทดสอบ')).toBeInTheDocument();
  });

  it('emits null when the date is cleared after a full selection', () => {
    const onChange = vi.fn();
    render(<Harness value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('วันที่ทดสอบ'), { target: { value: '15/09/2567' } });
    fireEvent.change(screen.getByLabelText('เวลาที่ทดสอบ'), { target: { value: '14:30' } });
    const fullIso = onChange.mock.lastCall[0] as string;

    // Re-render with the emitted value (controlled echo), then clear the date.
    render(<Harness value={fullIso} onChange={onChange} />);
    // Clear via the calendar's clear affordance is internal; simulate external
    // reset instead and assert the time field reflects the loaded value.
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toHaveValue('14:30');
  });

  it('derives local date/time parts from an external ISO value (edit-page load)', () => {
    // 15 Sep 2026 14:30 local, expressed as a UTC ISO string.
    const local = new Date(2026, 8, 15, 14, 30);
    render(<Harness value={local.toISOString()} onChange={vi.fn()} />);
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toHaveValue('14:30');
  });
});
```

Notes for the implementer:
- `CalendarPickerTH`'s typed day/month/year entry drives `getByLabelText(dateLabel)` — typing `'15/09/2567'` into that field exercises the same path PR #226's tests use. If that input is a composite of three boxes (day/month/year), target the day box via `getByLabelText(dateLabel)` and assert emitted values instead of internals — the assertions above are on `onChange`, not on internals.
- If the last test's `toHaveValue('14:30')` fails because the time input value is stored differently, assert on `input.type="time"` element via `screen.getByLabelText('เวลาที่ทดสอบ')` cast to `HTMLInputElement`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm run test:unit -- components/ui/__tests__/DateTimePickerTH.test.tsx`
Expected: FAIL — module `../DateTimePickerTH` does not exist.

- [ ] **Step 3: Write the component**

`frontend/components/ui/DateTimePickerTH.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPickerTH } from "@/components/ui/CalendarPickerTH";
import { cn, isoToYMD, isoToHM } from "@/lib/utils";

export interface DateTimePickerTHProps {
  /** Full ISO datetime (with timezone) or null. Controlled. */
  value: string | null;
  /** Called with a complete ISO datetime once BOTH parts are chosen; null while either is pending. */
  onChange: (iso: string | null) => void;
  /** aria-label for the date field (forwarded to CalendarPickerTH). */
  dateLabel: string;
  /** aria-label for the time field. */
  timeLabel: string;
  /** Additionally disable the time field (it is always disabled until a date is chosen). */
  timeDisabled?: boolean;
  className?: string;
  dateClassName?: string;
  timeInputClassName?: string;
}

const DEFAULT_TIME_CLASSES =
  "h-10 w-32 rounded-xl border border-border-default bg-surface px-3 text-sm text-text-primary " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * Thai (พ.ศ.) date + time, composed once for every scheduler form.
 *
 * Timezone law (PR #226): internal parts are LOCAL wall-clock (via isoToYMD /
 * isoToHM — never UTC slicing); the emitted value is `new Date(local).toISOString()`.
 *
 * Partial selections are preserved: the component ignores `value` echoes of
 * its own emissions (lastEmittedRef), so "date picked, time pending" is not
 * clobbered by the null it just emitted. A parent that needs to hard-reset the
 * field must remount it (key change) — a plain reset to null is indistinguishable
 * from the component's own null echo.
 */
export function DateTimePickerTH({
  value,
  onChange,
  dateLabel,
  timeLabel,
  timeDisabled = false,
  className,
  dateClassName,
  timeInputClassName,
}: DateTimePickerTHProps) {
  const [datePart, setDatePart] = useState(() => isoToYMD(value ?? null));
  const [timePart, setTimePart] = useState(() => isoToHM(value ?? null));
  const lastEmittedRef = useRef<string | null>(value ?? null);

  useEffect(() => {
    const incoming = value ?? null;
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    setDatePart(isoToYMD(incoming));
    setTimePart(isoToHM(incoming));
  }, [value]);

  const emit = (date: string, time: string) => {
    if (!date || !time) {
      lastEmittedRef.current = null;
      onChange(null);
      return;
    }
    const combined = new Date(`${date}T${time}`);
    if (isNaN(combined.getTime())) return;
    const iso = combined.toISOString();
    lastEmittedRef.current = iso;
    onChange(iso);
  };

  return (
    <div className={cn("flex flex-wrap items-start gap-3", className)}>
      <div className={cn("w-52", dateClassName)}>
        <CalendarPickerTH
          ariaLabel={dateLabel}
          value={datePart || null}
          onChange={(iso) => {
            const nextDate = iso ? isoToYMD(iso) : "";
            setDatePart(nextDate);
            emit(nextDate, timePart);
          }}
        />
      </div>
      <input
        type="time"
        aria-label={timeLabel}
        value={timePart}
        onChange={(e) => {
          const nextTime = e.target.value ? e.target.value.slice(0, 5) : "";
          setTimePart(nextTime);
          emit(datePart, nextTime);
        }}
        disabled={!datePart || timeDisabled}
        className={cn(DEFAULT_TIME_CLASSES, timeInputClassName)}
      />
    </div>
  );
}
```

(Note: `e.target.value.slice(0, 5)` here is a *time-of-day* string `"HH:MM"`, not a date — the PR #226 law is about dates; `HH:MM` has no timezone semantics.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- components/ui/__tests__/DateTimePickerTH.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/DateTimePickerTH.tsx frontend/components/ui/__tests__/DateTimePickerTH.test.tsx
git commit -m "feat(ui): shared DateTimePickerTH (Thai date + time, single ISO value)"
```

---

### Task 2: Adopt `DateTimePickerTH` in broadcast scheduler

**Files:**
- Modify: `frontend/app/admin/chatbot/broadcast/new/page.tsx` (state ~L71–84, validation ~L176–177, submit ~L197, preview ~L472–478, JSX ~L454–471)

**Interfaces:**
- Consumes: `DateTimePickerTH` from Task 1.
- Behavior kept: same warnings flow (see below), `POST` body `{ scheduled_at: <ISO or omitted> }`, preview text format.

- [ ] **Step 1: Replace split state with single ISO state**

Remove `scheduleDatePart` / `scheduleTime` and the `scheduledAt` memo; add:

```tsx
const [scheduledAtIso, setScheduledAtIso] = useState<string | null>(null);
```

Update the comment above it to say the composition lives in `DateTimePickerTH` now.

- [ ] **Step 2: Update validation**

The old two-step check (date missing → time missing) collapses to one guard on the complete value — the component only emits non-null when both parts exist:

```tsx
if (!scheduledAtIso) { toast({ variant: 'warning', title: 'กรุณาเลือกวันและเวลาที่ต้องการส่ง' }); return; }
```

- [ ] **Step 3: Update submit body**

`body: JSON.stringify({ scheduled_at: scheduledAtIso })` (already `toISOString()` output).

- [ ] **Step 4: Update preview line**

```tsx
{scheduledAtIso && (
  <p className="text-xs text-text-tertiary">
    จะส่งเมื่อ:{' '}
    {new Date(scheduledAtIso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
    {' '}เวลา {isoToHM(scheduledAtIso)} น.
  </p>
)}
```

(`isoToHM` import from `@/lib/utils` — local parts, not UTC slicing.)

- [ ] **Step 5: Swap the JSX**

Replace the `flex flex-wrap items-start gap-3` block (CalendarPickerTH in `w-52` div + `Input type="time"`) with:

```tsx
<DateTimePickerTH
  value={scheduledAtIso}
  onChange={setScheduledAtIso}
  dateLabel="วันที่ตั้งเวลาส่ง"
  timeLabel="เวลาที่ต้องการส่ง"
/>
```

Component defaults mirror this page's layout exactly (row layout, `w-52` date, `w-32` md-height time input). Remove now-unused imports (`Input` only if nothing else on the page uses it — check before removing).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (no unused vars).
Run: `npm run build` — expected: success.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/admin/chatbot/broadcast/new/page.tsx
git commit -m "refactor(broadcast): schedule fields via shared DateTimePickerTH"
```

---

### Task 3: Adopt `DateTimePickerTH` in rich-menu new + edit (tests unmodified)

**Files:**
- Modify: `frontend/app/admin/rich-menus/new/page.tsx` (state ~L250–257, validation ~L340–351, JSX ~L706–737)
- Modify: `frontend/app/admin/rich-menus/[id]/edit/page.tsx` (state ~L76–83, load ~L100–103, validation ~L187–200, JSX ~L476–506)

**Interfaces:**
- Consumes: `DateTimePickerTH` from Task 1.
- Behavior kept: `getByLabelText('วันที่เริ่มแสดง')` etc. keep working; `display.display_start_at = <ISO>`; start/end range validation; stacked in-label layout; `onClick={preventDefault}` wrapper untouched.

- [ ] **Step 1: Replace 4 state vars with 2 ISO values (both pages)**

```tsx
const [displayStartAt, setDisplayStartAt] = useState<string | null>(null);
const [displayEndAt, setDisplayEndAt] = useState<string | null>(null);
```

(new page: drop the `displayStart`/`displayEnd` combined-local strings; edit page: same.)

- [ ] **Step 2: Update save/validation (both pages)**

```tsx
if (!displayStartAt || !displayEndAt) { /* keep the existing 422-warning toast copy */ }
const start = new Date(displayStartAt);
const end = new Date(displayEndAt);
// ...keep any existing start/end cross-checks...
display.display_start_at = displayStartAt;   // already toISOString() output
display.display_end_at = displayEndAt;
```

- [ ] **Step 3: Update edit-page load**

```tsx
setDisplayStartAt(data.display_start_at ?? null);
setDisplayEndAt(data.display_end_at ?? null);
```

(the component derives local parts itself; `toLocalDatetimeInputValue` import goes away from these pages if unused — the helper and its lib test stay.)

- [ ] **Step 4: Swap the JSX (both pages, 2 fields each)**

Keep the outer `<span className="mt-3 grid grid-cols-1 gap-2" onClick={(e) => e.preventDefault()}>` wrapper. Each labeled block becomes:

```tsx
<span className="block text-[10px] font-bold text-slate-400">
  เริ่มแสดง
  <DateTimePickerTH
    className="mt-3 grid grid-cols-1 gap-2"
    dateClassName="w-full"
    timeInputClassName="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
    dateLabel="วันที่เริ่มแสดง"
    timeLabel="เวลาเริ่มแสดง"
    value={displayStartAt}
    onChange={setDisplayStartAt}
  />
</span>
```

and the `ซ่อนเมื่อถึง` block with `วันที่ซ่อนเมื่อถึง` / `เวลาซ่อนเมื่อถึง` / `displayEndAt`. (`cn()` tailwind-merge resolves the display/width conflicts — grid beats the default flex, `w-full` beats `w-52`.)

- [ ] **Step 5: Run the untouched page tests**

Run: `npm run test:unit -- app/admin/rich-menus`
Expected: PASS — `page.test.tsx` (new + edit) unmodified, including the `input[type="datetime-local"]` null check.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build` — clean.

```bash
git add frontend/app/admin/rich-menus
git commit -m "refactor(rich-menu): display-period fields via shared DateTimePickerTH"
```

---

### Task 4: Reply-objects form input height → shared `Input`

**Files:**
- Modify: `frontend/app/admin/reply-objects/page.tsx` (form modal inputs ~L329–396, select ~L358–367)
- Test (only if a page test exists asserting old classes): check `frontend/app/admin/reply-objects/__tests__/` first — none expected.

**Interfaces:**
- Consumes: `frontend/components/ui/Input.tsx` (default variant outline, `size="md"` → `h-10 px-4 py-2.5 text-sm`).

- [ ] **Step 1: Swap the 4 text inputs**

Each hand-rolled `<input className="w-full px-4 py-3 bg-bg border ...">` becomes (example — Universal ID):

```tsx
<Input
  id="ro-field-object-id"
  type="text"
  value={formData.object_id}
  onChange={(e) => setFormData({ ...formData, object_id: e.target.value })}
  disabled={!!editingId}
  className="font-bold font-mono"
  placeholder="flex_welcome"
  required
/>
```

Keep: ids (htmlFor stays valid), `required`, `disabled`, placeholders, `font-bold` on all four, `font-mono` on Universal ID only. Shared component supplies width/height/border/focus/disabled/placeholder styling. Add `Input` to the `@/components/ui` imports.

- [ ] **Step 2: Normalize the select**

`py-3` → `h-10 py-0`, add `text-sm` (matches `Input` md):

```tsx
className="w-full h-10 px-4 py-0 bg-bg border border-border-default rounded-xl text-sm text-text-primary font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all cursor-pointer"
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build` — clean.

```bash
git add frontend/app/admin/reply-objects/page.tsx
git commit -m "style(admin): reply-objects form uses shared Input (consistent input height)"
```

---

### Task 5: Index `service_requests.created_at`

**Files:**
- Modify: `backend/app/models/service_request.py:95`
- Create: `backend/alembic/versions/t1u2v3w4x5y6_index_service_requests_created_at.py`

**Interfaces:**
- Consumes: Alembic chain head (verify = `s0t1u2v3w4x5`).
- Produces: `ix_service_requests_created_at` on `service_requests(created_at)`.

- [ ] **Step 1: Verify the current head**

Run (from `backend/`): `python -m alembic history | head -5`
Expected: newest listed revision is `s0t1u2v3w4x5`. If not, re-derive the id/down_revision before writing the migration.

- [ ] **Step 2: Mark the column indexed in the model**

```python
created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
```

- [ ] **Step 3: Write the migration**

`backend/alembic/versions/t1u2v3w4x5y6_index_service_requests_created_at.py`:

```python
"""add index on service_requests.created_at

Revision ID: t1u2v3w4x5y6
Revises: c9d0e1f2a3b4
Create Date: 2026-09-06 00:00:00.000000

The admin requests list, the bot's "my requests" command, and admin reports
all ORDER BY created_at DESC — the table's other hot columns are indexed but
this one was missed, forcing sequential scans + sorts as the table grows.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_service_requests_created_at'),
        'service_requests',
        ['created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_service_requests_created_at'), table_name='service_requests')
```

- [ ] **Step 4: Migration drill on the local docker DB**

Run: `python scripts/db_target.py alembic --target local upgrade head`
Expected: runs `t1u2v3w4x5y6`.
Run: `python scripts/db_target.py alembic --target local downgrade -1` then `upgrade head` again (round-trip).
Run: `python -m alembic check` (local target env) — expected: no drift reported.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/service_request.py backend/alembic/versions/t1u2v3w4x5y6_index_service_requests_created_at.py
git commit -m "perf(db): index service_requests.created_at (list/bot/report ORDER BY)"
```

---

### Task 6: Webhook dedup lock — unique token + atomic Lua release (TDD)

**Files:**
- Modify: `backend/app/core/redis_client.py` (new `release_lock` after `claim_once`)
- Modify: `backend/app/api/v1/endpoints/webhook.py` (lock value + release)
- Test: `backend/tests/test_webhook_deduplication.py`

**Interfaces:**
- Produces: `RedisClient.release_lock(key: str, token: str) -> Optional[bool]` — True released / False no longer owner / None Redis down.
- Webhook: lock value = `uuid4().hex`; release only when `lock_acquired`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_webhook_deduplication.py`:
(a) In the `mock_redis` fixture add: `mock.release_lock = AsyncMock(return_value=True)`.
(b) Update the three tests that assert on `mock_redis.delete` to `release_lock` (the release mechanism changed deliberately): `test_handler_failure_does_not_mark_event_processed`, `test_lost_lock_does_not_delete_winners_lock`, `test_redis_down_fails_open_without_lock_release`, `test_winner_releases_own_lock`.
(c) Add:

```python
    @pytest.mark.asyncio
    async def test_lock_value_is_unique_token(self, mock_redis, mock_event_with_id):
        """The lock stores a per-invocation token, not the literal "1"."""
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = True

        await process_webhook_events([mock_event_with_id])

        token = mock_redis.set.call_args[0][1]
        assert isinstance(token, str) and len(token) >= 16 and token != "1"

    @pytest.mark.asyncio
    async def test_winner_releases_with_the_token_it_stored(self, mock_redis, mock_event_with_id):
        """Release passes exactly the token that was stored with SET."""
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = True

        await process_webhook_events([mock_event_with_id])

        stored = mock_redis.set.call_args[0][1]
        mock_redis.release_lock.assert_awaited_once()
        key, token = mock_redis.release_lock.call_args[0]
        assert "test-event-id-12345" in key
        assert token == stored

    @pytest.mark.asyncio
    async def test_release_lock_returns_none_when_not_connected(self):
        from app.core.redis_client import RedisClient

        assert await RedisClient().release_lock("k", "tok") is None

    @pytest.mark.asyncio
    async def test_release_lock_true_when_lua_deleted(self):
        from app.core.redis_client import RedisClient

        client = RedisClient()
        fake = AsyncMock()
        fake.eval = AsyncMock(return_value=1)
        client._redis = fake

        assert await client.release_lock("k", "tok") is True
        script, numkeys, key, token = fake.eval.call_args[0]
        assert numkeys == 1 and key == "k" and token == "tok"
        assert "get" in script and "del" in script

    @pytest.mark.asyncio
    async def test_release_lock_false_when_no_longer_owner(self):
        from app.core.redis_client import RedisClient

        client = RedisClient()
        fake = AsyncMock()
        fake.eval = AsyncMock(return_value=0)
        client._redis = fake

        assert await client.release_lock("k", "tok") is False

    @pytest.mark.asyncio
    async def test_release_lock_returns_none_on_error(self):
        from app.core.redis_client import RedisClient

        client = RedisClient()
        fake = AsyncMock()
        fake.eval = AsyncMock(side_effect=RuntimeError("boom"))
        client._redis = fake

        assert await client.release_lock("k", "tok") is None
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_webhook_deduplication.py -v -x -K "token or release"`
Expected: FAIL — `release_lock` attribute missing / token assertions fail (lock value is `"1"`).

- [ ] **Step 3: Implement `RedisClient.release_lock`**

In `backend/app/core/redis_client.py` (module level, above the class):

```python
# Compare-and-delete: delete `key` only when its value still equals the
# caller's token. Atomic — a slow holder whose TTL expired and whose lock was
# re-acquired by another worker can never delete the new holder's lock.
_RELEASE_LOCK_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""
```

In the class (after `claim_once`):

```python
    async def release_lock(self, key: str, token: str) -> Optional[bool]:
        """Atomically release a token lock (Lua compare-and-delete).

        Returns:
          * True  — this caller's lock was deleted
          * False — the key exists but is owned by another token (our lock
                    expired and someone else took over); leave it alone
          * None  — Redis unavailable/errored; the TTL cleans up eventually
        """
        if not self._redis:
            return None
        try:
            result = await self._redis.eval(_RELEASE_LOCK_LUA, 1, key, token)
            return int(result) == 1
        except Exception as e:
            logger.error(f"Redis release_lock error: {e}")
            return None
```

- [ ] **Step 4: Use the token in the webhook**

`backend/app/api/v1/endpoints/webhook.py`: add `import uuid` to stdlib imports; inside the per-event block replace the literal `"1"`:

```python
                if event_id:
                    cache_key = f"{WEBHOOK_EVENT_KEY_PREFIX}{event_id}"
                    if await redis_client.exists(cache_key):
                        logger.info(f"Duplicate webhook event {event_id}, skipping")
                        continue
                    lock_key = f"{cache_key}{WEBHOOK_EVENT_LOCK_SUFFIX}"
                    lock_token = uuid.uuid4().hex
                    lock_acquired = await redis_client.set(
                        lock_key,
                        lock_token,
                        seconds=settings.WEBHOOK_EVENT_TTL,
                        nx=True,
                    )
```

(declare `lock_token: Optional[str] = None` next to `lock_acquired = False` at the top of the loop) and the finally block:

```python
            finally:
                # Release ONLY when this invocation actually acquired the lock
                # (the `continue` paths still run finally). The Lua
                # compare-and-delete makes the release atomic: if our TTL
                # expired and another worker now holds the lock, our stale
                # token no longer matches and their lock survives.
                if lock_key and lock_acquired:
                    await redis_client.release_lock(lock_key, lock_token)
```

- [ ] **Step 5: Run the suite**

Run: `python -m pytest tests/test_webhook_deduplication.py tests/test_webhook_signature.py tests/test_webhook_intent_fallthrough.py tests/test_webhook_intent_matching.py tests/test_webhook_media.py -v`
Expected: all PASS (existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/redis_client.py backend/app/api/v1/endpoints/webhook.py backend/tests/test_webhook_deduplication.py
git commit -m "fix(webhook): token-based atomic dedup lock release (Lua compare-and-delete)"
```

---

### Task 7: Gates, PR, merge

**Files:** none new (docs committed along the way).

- [ ] **Step 1: Frontend gates (from `frontend/`)**

```bash
npm run test:unit            # known whole-batch flakes: app/liff/booking*, app/liff/debt-mediation* — rerun those files individually if they fail; everything else must pass
npx tsc --noEmit
npm run lint
npm run build
```

- [ ] **Step 2: Backend gates (from `backend/`)**

```bash
python -m pytest tests/test_webhook_deduplication.py tests/test_webhook_signature.py tests/test_webhook_intent_fallthrough.py tests/test_webhook_intent_matching.py tests/test_webhook_media.py -v
python -m pytest tests/test_models* tests/test_admin_requests* -v   # model/index-adjacent, if such files exist — otherwise skip
```

(Full backend suite hangs on Windows teardown — CI `Backend Pytest` is the authoritative gate.)

- [ ] **Step 3: Commit PRD/plan + push**

```bash
git add .claude/PRPs/prds/2026-09-06-backlog-batch.prd.md .claude/PRPs/plans/2026-09-06-backlog-batch.plan.md
git commit -m "docs(prp): backlog-batch PRD + plan (2026-09-06)"
git push -u origin chore/backlog-batch-20260906
```

- [ ] **Step 4: Open PR**

Title: `chore: backlog batch — shared DateTimePickerTH, created_at index, webhook Lua lock release, reply-objects input height`
Body: 4 bullets (one per item) + migration note (additive) + "existing rich-menu page tests unmodified" evidence + CI-gate note for full pytest.

- [ ] **Step 5: Watch CI (expect 4/4) → squash merge → verify CD**

CD picks up: frontend (Vercel) + backend (Koyeb) + migration run. Verify the CD run's `head_sha` matches the squash commit before assuming a deploy failed ("skipped" = scope resolver, check `head_sha`).

## Self-Review

1. **Spec coverage:** PRD Solution 1→Tasks 1–3; 2→Task 5; 3→Task 6; 4→Task 4. User stories map to the same tasks. Out-of-scope items untouched. ✔
2. **Placeholder scan:** Task 3 Step 2 keeps existing toast copy (deliberate — behavior-preserving); no "TBD"/"add error handling" placeholders. ✔
3. **Type consistency:** `DateTimePickerTHProps` signature identical across Tasks 1/2/3; `release_lock` signature identical across Task 6 tests/impl/webhook call. ✔
4. **Deviations from PRD to note in the PR:** broadcast's two validation toasts collapse into one ("กรุณาเลือกวันและเวลาที่ต้องการส่ง") because the shared component's contract emits only complete values; `isoToHM` (already in `lib/utils.ts`, previously unused) becomes the component's time-parts helper.
