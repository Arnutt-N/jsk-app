# PR #228 Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three accepted review findings (F1 missing component tests, F2 select background token, F3 backend release-failure test) with no production behavior changes except one Tailwind class.

**Architecture:** Two test-only tasks (frontend component test additions; one backend dedup test) and one one-class style fix. Each lands as its own commit on `fix/review-pr228-followups`.

**Tech Stack:** Vitest + @testing-library/react (frontend), pytest + pytest-asyncio with the existing `mock_redis` fixture (backend), Tailwind v4 (style).

## Global Constraints

- Binding spec: `.claude/PRPs/findings/2026-09-06-pr228-review-findings.md` (F1–F3 accepted; R1–R5 rejected with reasons — do NOT touch them).
- Do not weaken any existing test or assertion; only add.
- Existing command set: frontend from `frontend/` (`npm run test:unit -- <path>`, `npx tsc --noEmit`, `npm run lint`, `npm run build`); backend from `backend/` (`./venv/Scripts/python.exe -m pytest tests/test_webhook_deduplication.py -v`).
- Known local flakes (do not chase): `app/liff/booking` + `app/liff/debt-mediation` whole-batch timeouts; backend full-suite teardown hang — CI is the gate.

---

### Task 1 (F1): DateTimePickerTH missing-behavior tests

**Files:**
- Modify: `frontend/components/ui/__tests__/DateTimePickerTH.test.tsx` (append 2 tests inside the describe block)

**Interfaces:**
- Consumes: `DateTimePickerTH` props `{ value, onChange, timeDisabled, dateLabel, timeLabel }`; `isoToYMD`/`isoToHM` return `''` for invalid date strings (frontend/lib/utils.ts — already shipped behavior, this pins it at the component seam).

- [ ] **Step 1: Add the failing-then-passing tests**

Append inside `describe('DateTimePickerTH', ...)`:

```tsx
  it('timeDisabled keeps the time field disabled even after a date is chosen', async () => {
    render(
      <DateTimePickerTH
        value={null}
        onChange={vi.fn()}
        timeDisabled
        dateLabel="วันที่ทดสอบ"
        timeLabel="เวลาที่ทดสอบ"
      />,
    );
    typeThaiDate();
    await waitFor(() =>
      expect(screen.getByLabelText('เวลาที่ทดสอบ')).toBeDisabled(),
    );
    // The date side stays interactive — timeDisabled must not leak into it.
    expect((screen.getByLabelText('วันที่ทดสอบ') as HTMLInputElement).value).toBe('15');
  });

  it('degrades an invalid value to empty parts without crashing', () => {
    render(<StaticHarness value="not-an-iso-string" onChange={vi.fn()} />);
    expect((screen.getByLabelText('วันที่ทดสอบ') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('เวลาที่ทดสอบ') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toBeDisabled();
  });
```

(Uses the existing `StaticHarness` and `typeThaiDate()` helpers already at the top of the file — no new imports needed.)

- [ ] **Step 2: Run**

Run: `npm run test:unit -- components/ui/__tests__/DateTimePickerTH.test.tsx`
Expected: PASS (8 tests). These pin shipped behavior — if either FAILS, that is a real F1 bug: fix the component, not the test, and record it as a deviation.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/__tests__/DateTimePickerTH.test.tsx
git commit -m "test(ui): pin DateTimePickerTH timeDisabled + invalid-value degradation"
```

---

### Task 2 (F2): reply-objects select background token

**Files:**
- Modify: `frontend/app/admin/reply-objects/page.tsx` (the `ro-field-object-type` select className)

**Interfaces:** none (single class swap).

- [ ] **Step 1: Change the class**

In the select's className, replace `bg-bg` with `bg-surface` (the rest — `h-10 px-4 py-0 text-sm font-bold appearance-none ...` — stays exactly as shipped by PR #228).

- [ ] **Step 2: Validate**

Run: `npm run test:unit -- app/admin/reply-objects/__tests__/ReplyObjectsPage.integration.test.tsx && npx tsc --noEmit && npm run lint`
Expected: 11 tests PASS, tsc clean, 0 lint errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/reply-objects/page.tsx
git commit -m "style(admin): reply-objects select uses bg-surface like the shared Input"
```

---

### Task 3 (F3): backend release-failure-swallowed test

**Files:**
- Modify: `backend/tests/test_webhook_deduplication.py` (append 1 test in `TestWebhookDeduplication`)

**Interfaces:**
- Consumes: existing `mock_redis` fixture (its `release_lock` is `AsyncMock(return_value=True)` — override per-test with `mock_redis.release_lock = AsyncMock(return_value=None)`), `process_webhook_events`, `mock_event_with_id` fixture.

- [ ] **Step 1: Add the test**

```python
    @pytest.mark.asyncio
    async def test_release_failure_is_swallowed(self, mock_redis, mock_event_with_id):
        """A Redis error at release time must not fail event processing.

        release_lock returns None on error (its tri-state contract); the
        finally block ignores it and the event is still marked processed.
        The lock's TTL is the eventual cleanup.
        """
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = True
        mock_redis.release_lock = AsyncMock(return_value=None)

        await process_webhook_events([mock_event_with_id])

        mock_redis.setex.assert_awaited_once()
        mock_redis.release_lock.assert_awaited_once()
```

- [ ] **Step 2: Run**

Run: `./venv/Scripts/python.exe -m pytest tests/test_webhook_deduplication.py -v`
Expected: PASS (22 tests).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_webhook_deduplication.py
git commit -m "test(webhook): pin release-failure swallowing in dedup lock finally"
```

---

### Task 4: Gates, PR, merge

- [ ] **Step 1: Full frontend gates** — `npm run test:unit` (liff flakes → rerun individually), `npx tsc --noEmit`, `npm run lint`, `npm run build`. All pass.
- [ ] **Step 2: Backend scoped suite** — `./venv/Scripts/python.exe -m pytest tests/test_webhook_deduplication.py tests/test_booking_migration.py -v`. PASS.
- [ ] **Step 3: Commit findings + PRD + plan docs, push, open PR** `fix: PR #228 review follow-ups (F1–F3)`, watch CI 4/4, squash-merge, verify CD.

## Validation Commands summary

| Task | Command | Expected |
|---|---|---|
| 1 | `npm run test:unit -- components/ui/__tests__/DateTimePickerTH.test.tsx` | 8 pass |
| 2 | reply-objects integration + tsc + lint | 11 pass / clean / 0 err |
| 3 | `pytest tests/test_webhook_deduplication.py -v` | 22 pass |

## Acceptance Criteria

- F1: both new tests exist and pass; no existing assertion touched.
- F2: select background token = `bg-surface`; integration test unmodified-pass.
- F3: release-failure test exists and passes; no production code change.
- No Critical/High anywhere (G3 input state: none found in review).