# PRP Plan — PR #218 debt-mediation review fixes (REV 6)

**PRD:** `.claude/PRPs/prds/pr-218-review-fix.prd.md`  
**Findings:** `.claude/PRPs/findings/pr-218-debt-mediation-findings.md`  
**Branch:** `fix/pr-218-review-fixes`  
**Complexity:** M  
**Date:** 2026-08-31  
**REV 6** — loop 4 FAIL: Task 3 test import `DebtMediationResponse`; keep existing `validateStep` gates; F08 query after step-1 nav; inline issue-button classNames; F11 whitespace wizard test; CI `npm run build` documented.

## Metadata

| Key | Value |
|-----|-------|
| Source PRD | `.claude/PRPs/prds/pr-218-review-fix.prd.md` |
| Findings | F01–F19 accepted; deferred listed in NOT Building |
| Base | `feat/liff-debt-mediation` @ `d7def8f` |
| Dependencies | none beyond existing FastAPI/Pydantic v2/SQLAlchemy 2/Vitest |

## Summary

Harden the unreleased LIFF ขอแก้หนี้ write path so amount/label/phone/province contracts cannot 500 or silently mis-store before merge.

## Files to Change

| File | Tasks |
|------|-------|
| `backend/app/schemas/debt_mediation_liff.py` | 1 |
| `backend/tests/test_liff_debt_mediation.py` | 1, 2, 3 |
| `backend/app/models/debt_mediation.py` | 2 |
| `backend/alembic/versions/b8c9d0e1f2a3_add_debt_mediation_requests.py` | 2 |
| `backend/app/api/v1/endpoints/liff.py` | 3 |
| `frontend/lib/liff/submit-debt-mediation.ts` | 4 |
| `frontend/app/liff/debt-mediation/page.tsx` | 4 |
| `frontend/app/liff/debt-mediation/__tests__/page.test.tsx` | 4 |
| `frontend/lib/liff/__tests__/submit-debt-mediation.test.ts` | 5 |

## NOT Building

- Admin debt-mediation UI / rich-menu entry
- `create_audit_log` on LIFF create
- Dropping `LIFF_STRICT_MODE` body fallback
- Radix dialog / `next/head` / enum-class merge
- TestClient 429 for this route
- SQL CHECK constraints
- New Alembic revision
- PEP8-only import reshuffle (`enum`/`re` order)
- Logging the empty `isInClient` catch after submit (`page.tsx:239`)

---

## Known Facts (verified)

- Amount: `debt_amount: Decimal = Field(gt=0)` `backend/app/schemas/debt_mediation_liff.py:42`; ORM `Numeric(14, 2)` `backend/app/models/debt_mediation.py:48`.
- Phone backend: `_PHONE_PATTERN = re.compile(r"^\+?\d{9,15}$")` schema:11; JS `PHONE_DIGITS = /^\+?\d{9,15}$/` `submit-debt-mediation.ts:6` (both Unicode `\d` today). UI `maxLength={10}` `page.tsx:494`. Placeholder `0xx-xxx-xxxx`.
- FK: `user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)` model:34; migration `b8c9d0e1f2a3` L57 no ON DELETE. Precedent: `backend/app/models/audit_log.py:18` `ForeignKey("users.id", ondelete="SET NULL")`.
- JSONB: `details = Column(JSONB, default=dict)` model:62; migration L80 `nullable=True` no server_default.
- Submitter click: `onClick={() => setField('submitter_type', opt.value)}` `page.tsx:441`.
- Issue labels (copy these verbatim into Python frozensets):

```
DEBTOR:
  ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้
  ทำสัญญา/ข้อตกลงที่ลักษณะเป็นอาชญากรรม (ถูกหลอก สัญญาไม่ชอบด้วยกฎหมาย)
  ถูกข่มขู่/หนวกหู จากบุคคลอื่น
  รายได้ไม่เพียงพอจะชำระหนี้
  ผู้ไกล่เกลี่ยติดต่อเจ้าหนี้ไม่ได้
CREDITOR:
  ลูกหนี้ไม่มีเงินจ่ายหนี้
  ลูกหนี้ปฏิเสธว่าไม่ได้เป็นหนี้
  ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้
  ลูกหนี้หลบหนีหนี้
OTHER: อื่น ๆ
```

SOURCE: `page.tsx:49-64`. Schema already has `ISSUE_OTHER_LABEL = "อื่น ๆ"` at `debt_mediation_liff.py:9` — keep it; do not redeclare.

- Province fetch: `page.tsx:110-121` `logger.error('Provinces fetch error:', err)` only. Badge: `page.tsx:374-376` `variant={provinces.length > 0 ? "success" : "warning"}` text Online / Connecting... Badge `variant` keys: success, warning, danger (`Badge.tsx:16-24`) — **no `failed` variant**.
- Schema tests: `pytest.raises(Exception)` at `test_liff_debt_mediation.py:67,72,82,94,101,107,122,124,129,134`. Pattern: `from pydantic import ValidationError` + `with pytest.raises(ValidationError):` `test_service_request_liff_validation.py:12,46`.
- 201: `liff.py:327` `line_user_id=line_user_id`. Handler `-> Any` `liff.py:266`. Token branch: `if x_liff_id_token:` then `verify_liff_token` `liff.py:270-271`; missing token strict 401 `liff.py:279-281`.
- Booking pressed: `frontend/app/liff/booking/page.tsx:595` `aria-pressed={serviceType === service}`.
- Session: `SESSION_EXPIRED_MESSAGE` `frontend/lib/liff/session-expired.ts:1-2`. Helper 401 test: `submit-debt-mediation.test.ts` 401 case; sister assert `upload-media.test.ts:71`.
- Page test harness: `jsonResponse` L8-13; `stubFetch(overrides?: { submitStatus?: number; submitBody?: unknown })` L29-46 — provinces success list; POST uses `submitStatus`/`submitBody`. Extend `stubFetch` with `provincesOk?: boolean` (default true); when false, provinces URL returns 500.
- `tsconfig.json:31-36` includes `**/*.tsx`.
- `_mock_db()` in `test_liff_debt_mediation.py` MagicMock `commit`/`refresh`/`add`.
- Amount input: `page.tsx:503-512` `type="number" min="0" step="0.01"` no `max`.
- `full_name="   "` already rejected by `_blank` at schema:96-98 — Task 1 test is a pin (`match="full_name must not be blank"`), not a new RED.
- React import today: `import { useState, useEffect } from 'react'` `page.tsx:3`. `Button` is already imported from `@/components/ui/Button`. Header (badge) is **outside** `<form>` (`page.tsx:362-379` vs form at `page.tsx:402`).
- Issue option arrays are `string[]` (`DEBTOR_ISSUE_OPTIONS` / `CREDITOR_ISSUE_OPTIONS`). Submitter/debt-type options are `{ value, label, description }`. Do not use `opt.value` on issue buttons.

---

## Task 1 — Schema contracts (F01 F02 F05 F09 F10 F12 F15 F19)

**ACTION:** Tighten Create/Response so overflow, Unicode digits, cross-path labels, and overlong text 422; 201 schema has no LINE id.

**IMPLEMENT:** `backend/app/schemas/debt_mediation_liff.py`

Keep the existing `ISSUE_OTHER_LABEL = "อื่น ๆ"` at line 9. Do not redeclare it.

```python
_PHONE_PATTERN = re.compile(r"^\+?[0-9]{9,15}$")

DEBTOR_ISSUE_CATEGORIES = frozenset({
    "ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้",
    "ทำสัญญา/ข้อตกลงที่ลักษณะเป็นอาชญากรรม (ถูกหลอก สัญญาไม่ชอบด้วยกฎหมาย)",
    "ถูกข่มขู่/หนวกหู จากบุคคลอื่น",
    "รายได้ไม่เพียงพอจะชำระหนี้",
    "ผู้ไกล่เกลี่ยติดต่อเจ้าหนี้ไม่ได้",
    ISSUE_OTHER_LABEL,
})
CREDITOR_ISSUE_CATEGORIES = frozenset({
    "ลูกหนี้ไม่มีเงินจ่ายหนี้",
    "ลูกหนี้ปฏิเสธว่าไม่ได้เป็นหนี้",
    "ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้",
    "ลูกหนี้หลบหนีหนี้",
    ISSUE_OTHER_LABEL,
})

debt_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
sub_district: Optional[str] = Field(default=None, max_length=100)
interest_rate: Optional[str] = Field(default=None, max_length=80)
issue_category: str = Field(min_length=1, max_length=200)
issue_other: Optional[str] = Field(default=None, max_length=500)
```

In `_require_path_fields` after the existing strip/blank checks, add:

```python
allowed = (
    DEBTOR_ISSUE_CATEGORIES
    if self.submitter_type == SubmitterType.DEBTOR
    else CREDITOR_ISSUE_CATEGORIES
)
if self.issue_category not in allowed:
    raise ValueError("issue_category is not valid for this submitter_type.")
if self.submitter_type == SubmitterType.CREDITOR:
    self.interest_rate = None
```

Remove `line_user_id` from `DebtMediationResponse` only (keep it on `DebtMediationCreate`).

**MIRROR:** `backend/tests/test_liff_debt_mediation.py` — add/replace **before** schema edits if doing TDD; current `test_phone_letters_rejected` already exists.

```python
from pydantic import ValidationError

def test_amount_overflow_rejected():
    with pytest.raises(ValidationError, match="decimal"):
        DebtMediationCreate(**_debtor_payload(debt_amount="1e20"))

def test_amount_inf_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="inf"))

def test_amount_subcent_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="0.001"))

def test_amount_numeric_boundary_passes():
    obj = DebtMediationCreate(**_debtor_payload(debt_amount="999999999999.99"))
    assert obj.debt_amount  # 12 integer + 2 frac digits OK

def test_phone_thai_digits_rejected():
    with pytest.raises(ValidationError, match="เบอร์โทร"):
        DebtMediationCreate(**_debtor_payload(phone_number="๐๘๑๒๓๔๕๖๗๘"))

def test_debtor_issue_from_creditor_list_rejected():
    with pytest.raises(ValidationError, match="issue_category"):
        DebtMediationCreate(**_debtor_payload(issue_category="ลูกหนี้หลบหนีหนี้"))

def test_creditor_interest_rate_cleared():
    obj = DebtMediationCreate(**_creditor_payload(interest_rate="ร้อยละ 5"))
    assert obj.interest_rate is None

def test_overlong_issue_other_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(issue_category="อื่น ๆ", issue_other="x" * 501))

def test_whitespace_full_name_rejected():
    with pytest.raises(ValidationError, match="full_name"):
        DebtMediationCreate(**_debtor_payload(full_name="   "))
```

Replace all `pytest.raises(Exception)` with `pytest.raises(ValidationError)`. Drop `resp.line_user_id` assertions.

**VALIDATE:** `cd backend && python -m pytest tests/test_liff_debt_mediation.py -q`

**GOTCHA:** `max_digits=14` counts both sides; fixture `20000` is 5 digits — pass. `999999999999.99` is 14 digits — pass. `10000000000000` is 15 — reject. Pass `allow_inf_nan=False` explicitly.

**Finding coverage:** F01 F02 F05 F09 F10 F12 F15 F19.

---

## Task 2 — Model + migration `b8c9d0e1f2a3` (F09 F13 F14)

**ACTION:** Match SQL lengths, SET NULL FK, JSONB `{}` default. No new revision.

**IMPLEMENT:** `backend/app/models/debt_mediation.py`

At top of `debt_mediation.py` add `text` to the existing sqlalchemy import (this module has **no** `sa` alias):

```python
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Numeric, String, text
```

Then:

```python
user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
full_name = Column(String(200), nullable=False)
phone_number = Column(String(20), nullable=False)
province = Column(String(100), nullable=False)
sub_district = Column(String(100), nullable=True)
counterparty_name = Column(String(200), nullable=False)
interest_rate = Column(String(80), nullable=True)
issue_category = Column(String(200), nullable=False)
issue_other = Column(String(500), nullable=True)
details = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
```

Leave `debt_amount` / `debt_type` / `status` as they are. Do **not** write `sa.text` in this file.

Migration `b8c9d0e1f2a3` already has `from alembic import op` / `import sqlalchemy as sa`. There the `sa.` prefix **is** correct. Edit in place (same lengths as the model):

```python
sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
sa.Column("full_name", sa.String(200), nullable=False),
sa.Column("phone_number", sa.String(20), nullable=False),
sa.Column("province", sa.String(100), nullable=False),
sa.Column("sub_district", sa.String(100), nullable=True),
sa.Column("counterparty_name", sa.String(200), nullable=False),
sa.Column("interest_rate", sa.String(80), nullable=True),
sa.Column("issue_category", sa.String(200), nullable=False),
sa.Column("issue_other", sa.String(500), nullable=True),
sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
```

Keep `create_type=False` on `debtparty` / `debttype` / `requeststatus`.

**MIRROR:** Append to `backend/tests/test_liff_debt_mediation.py` (do not edit `test_booking_migration.py`):

```python
import importlib.util
from pathlib import Path

_DM_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "b8c9d0e1f2a3_add_debt_mediation_requests.py"
)

def _load_dm_migration():
    spec = importlib.util.spec_from_file_location("_dm_migration", _DM_MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def test_debt_mediation_revision_chain():
    dm_migration = _load_dm_migration()
    assert dm_migration.revision == "b8c9d0e1f2a3"
    assert dm_migration.down_revision == "s0t1u2v3w4x5"

def test_debt_mediation_migration_sql_contracts():
    src = _DM_MIGRATION.read_text(encoding="utf-8")
    assert 'ondelete="SET NULL"' in src or "ondelete='SET NULL'" in src
    assert "'{}'::jsonb" in src
    assert "sa.String(200)" in src or "String(200)" in src
```

Do not change `test_booking_migration.py:72`.

**VALIDATE:** `cd backend && python -m pytest tests/test_liff_debt_mediation.py tests/test_booking_migration.py -q`

**GOTCHA:** Keep `create_type=False` on `debtparty`/`debttype`/`requeststatus`. If local DB already applied the old revision, `alembic downgrade -1 && upgrade head` — not required for CI.

**Finding coverage:** F09 F13 F14.

---

## Task 3 — Handler (F06 F12 F16)

**ACTION:** Typed 201 without LINE id; prove 401 does not write.

**IMPLEMENT:** `backend/app/api/v1/endpoints/liff.py` — change the handler signature from `) -> Any:` to `) -> DebtMediationResponse:` (`DebtMediationResponse` is already imported in this file). Delete the `line_user_id=line_user_id,` keyword from the `DebtMediationResponse(...)` constructor (currently `liff.py:327`). Do not change the identity / `verify_liff_token` branches.

**MIRROR:** `backend/tests/test_liff_debt_mediation.py`

Change the schema import at line 16 to:

```python
from app.schemas.debt_mediation_liff import (
    DebtMediationCreate,
    DebtMediationResponse,
    SubmitterType,
)
```

Then:

```python
@pytest.mark.asyncio
async def test_invalid_token_does_not_write():
    db = _mock_db()
    with patch.object(liff, "verify_liff_token", new=AsyncMock(side_effect=HTTPException(status_code=401, detail="Invalid LIFF ID token"))):
        with pytest.raises(HTTPException) as exc:
            await liff.create_debt_mediation_request(
                DebtMediationCreate(**_debtor_payload()),
                db=db,
                x_liff_id_token="tok",  # non-null so verify runs (liff.py:270)
            )
    assert exc.value.status_code == 401
    db.add.assert_not_called()

@pytest.mark.asyncio
async def test_missing_token_rejected_in_strict_mode():
    db = _mock_db()
    with patch.object(liff.settings, "LIFF_STRICT_MODE", True):
        with pytest.raises(HTTPException) as exc:
            await liff.create_debt_mediation_request(
                DebtMediationCreate(**_debtor_payload()), db=db, x_liff_id_token=None
            )
    assert exc.value.status_code == 401
    assert exc.value.detail == "LIFF ID token required"
    db.add.assert_not_called()
```

Remove `resp.line_user_id` expects. Add:

```python
assert "line_user_id" not in DebtMediationResponse.model_json_schema()["properties"]
```

Unverified-mode test still may set `added.details == {"source": "LIFF-unverified"}`.

**VALIDATE:** `cd backend && python -m pytest tests/test_liff_debt_mediation.py -q`

**GOTCHA:** Invalid-token test **must** pass `x_liff_id_token="tok"`; `None` hits the strict-mode branch and never calls verify.

**Finding coverage:** F06 F12 F16.

---

## Task 4 — LIFF page + JS phone (F02 F03 F04 F08 F09 F11 F17 F18 + F01 UI max + F07 + F06-wizard + F10-js)

**ACTION:** Client matches schema; province errors are Thai; labels associated.

**IMPLEMENT:** two production files.

### 4.1 `frontend/lib/liff/submit-debt-mediation.ts`

Change only line 6 to ASCII digits:

```ts
const PHONE_DIGITS = /^\+?[0-9]{9,15}$/
```

Leave `normalizePhone` / `isValidPhone` / `formatLiffSubmitError` unchanged.

### 4.2 `frontend/app/liff/debt-mediation/page.tsx`

Replace the React import:

```ts
import { useState, useEffect, useCallback } from 'react'
```

Add state next to `provinces`:

```ts
type ProvinceLoad = 'loading' | 'ok' | 'failed'
const [provinceLoad, setProvinceLoad] = useState<ProvinceLoad>('loading')
```

Replace the existing `useEffect` at `page.tsx:110-124` with **one** `loadProvinces` in `useCallback` (empty deps) and **one** effect that depends on it. Do not nest a second fetch function inside the effect.

```ts
const loadProvinces = useCallback(async () => {
    setProvinceLoad('loading')
    try {
        const res = await fetch(`/api/v1/locations/provinces`)
        if (!res.ok) {
            throw new Error(`Failed to load provinces: ${res.status} ${res.statusText}`)
        }
        const data: unknown = await res.json()
        if (!Array.isArray(data)) {
            throw new Error('Invalid provinces payload')
        }
        setProvinces(data as Province[])
        setProvinceLoad('ok')
        setError(null)
    } catch (err: unknown) {
        logger.error('Provinces fetch error:', err)
        setProvinces([])
        setProvinceLoad('failed')
        setError('ไม่สามารถโหลดรายชื่อจังหวัดได้ กรุณาลองใหม่')
    }
}, [])

useEffect(() => {
    void loadProvinces()
}, [loadProvinces])
```

Header badge + retry (`page.tsx:373-377`). Retry lives in the header (outside `<form>`). Visible copy of the retry button **must** be exactly `ลองใหม่` so `getByRole('button', { name: 'ลองใหม่' })` matches.

```tsx
<div className="flex items-center gap-2">
    <Badge
        variant={provinceLoad === 'ok' ? 'success' : provinceLoad === 'failed' ? 'danger' : 'warning'}
        className="h-6"
    >
        {provinceLoad === 'ok' ? 'Online' : provinceLoad === 'failed' ? 'โหลดไม่สำเร็จ' : 'Connecting...'}
    </Badge>
    {provinceLoad === 'failed' && (
        <Button type="button" variant="outline" size="sm" onClick={() => void loadProvinces()}>
            ลองใหม่
        </Button>
    )}
</div>
```

Do **not** invent a Badge `failed` variant — use `variant="danger"`.

Submitter `onClick` (`page.tsx:441`) — reset path-specific fields. Do not mutate `prev`:

```tsx
onClick={() => {
    setFormData(prev => ({
        ...prev,
        submitter_type: opt.value,
        issue_category: '',
        issue_other: '',
        interest_rate: '',
    }))
    setFieldErrors(prev => {
        const next = { ...prev }
        delete next.issue_category
        delete next.issue_other
        delete next.interest_rate
        return next
    })
}}
aria-pressed={formData.submitter_type === opt.value}
```

Debt-type buttons (`page.tsx:558-577`):

```tsx
aria-pressed={formData.debt_type === opt.value}
```

Issue buttons — `issueOptions` is `string[]`. Loop variable is the label string. The Other button uses `ISSUE_OTHER_LABEL`. Copy the className strings below (they already exist at `page.tsx:632-646`); only add `aria-pressed`.

```tsx
{issueOptions.map(opt => (
    <button
        key={opt}
        type="button"
        aria-pressed={formData.issue_category === opt}
        onClick={() => setField('issue_category', opt)}
        className={`text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.99] text-sm font-medium ${formData.issue_category === opt
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
    >
        {opt}
    </button>
))}
<button
    type="button"
    aria-pressed={formData.issue_category === ISSUE_OTHER_LABEL}
    onClick={() => setField('issue_category', ISSUE_OTHER_LABEL)}
    className={`text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.99] text-sm font-medium ${formData.issue_category === ISSUE_OTHER_LABEL
        ? 'border-primary bg-primary/5 text-primary'
        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
        }`}
>
    อื่น ๆ
</button>
```

Do **not** write `opt.value` on issue buttons.

Labeled controls — add `htmlFor` on the existing `<label>` and matching `id` on the control. On error: `aria-invalid={true}` and `aria-describedby` pointing at the existing error `<p>`.

| Label text | htmlFor / id | maxLength / extra | error p id |
|------------|--------------|-------------------|------------|
| ชื่อ-สกุล | `dm-full-name` | `maxLength={200}` | `dm-full-name-err` |
| หมายเลขโทรศัพท์ | `dm-phone` | `maxLength={20}` | `dm-phone-err` |
| ยอดหนี้สิน (บาท) | `dm-amount` | `max="999999999999.99"` (keep `min="0" step="0.01"`) | `dm-amount-err` |
| จังหวัดที่อาศัย | `dm-province` | (select) | `dm-province-err` |
| ตำบลที่อาศัย | `dm-subdistrict` | `maxLength={100}` | (optional field, no required err) |
| ชื่อเจ้าหนี้ / ชื่อลูกหนี้ | `dm-counterparty` | `maxLength={200}` | `dm-counterparty-err` |
| อัตราดอกเบี้ย | `dm-interest` | `maxLength={80}` | `dm-interest-err` |
| ระบุประเด็น | `dm-issue-other` | `maxLength={500}` | `dm-issue-other-err` |

Example for phone (apply the same pattern to the other rows):

```tsx
<label htmlFor="dm-phone" className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
    หมายเลขโทรศัพท์ <span className="text-red-500">*</span>
</label>
<input
    id="dm-phone"
    type="tel"
    name="phone_number"
    value={formData.phone_number}
    onChange={handleChange}
    maxLength={20}
    aria-invalid={Boolean(fieldErrors.phone_number) || undefined}
    aria-describedby={fieldErrors.phone_number ? 'dm-phone-err' : undefined}
    className={`${inputBaseClass} ${fieldErrors.phone_number ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'}`}
    placeholder="0xx-xxx-xxxx"
    required
/>
{fieldErrors.phone_number && <p id="dm-phone-err" className="text-red-500 text-[10px] mt-1">{fieldErrors.phone_number}</p>}
```

`validateStep` — **surgical conversion only**. Keep the existing `switch` and these gates **unchanged** (same conditions, same Thai copy) at `page.tsx:152-161`:

- case 0: `if (!formData.submitter_type) errors.submitter_type = 'กรุณาเลือกสถานะผู้ยื่นคำขอ'`
- case 1: `if (!formData.debt_amount || Number(formData.debt_amount) <= 0) errors.debt_amount = 'กรุณาระบุยอดหนี้สิน'`
- case 1: `if (!formData.debt_type) errors.debt_type = 'กรุณาเลือกประเภทหนี้'`

Add a local helper next to the switch:

```ts
const blank = (s: string) => !s.trim()
```

Replace **only** these truthy string checks with `blank(...)` (do not rewrite the switch, do not change error copy):

- case 1: `if (!formData.full_name)` → `if (blank(formData.full_name))`
- case 1: `if (!formData.phone_number)` → `if (blank(formData.phone_number))` (keep the `else if (!isValidPhone(formData.phone_number))` branch)
- case 1: `if (!formData.province)` → `if (blank(formData.province))`
- case 2: `if (!formData.counterparty_name)` → `if (blank(formData.counterparty_name))`
- case 2: `if (isDebtor && !formData.interest_rate)` → `if (isDebtor && blank(formData.interest_rate))`
- case 2: `if (!formData.issue_category)` → `if (blank(formData.issue_category))`
- case 2: `&& !formData.issue_other` → `&& blank(formData.issue_other)`

Replace `buildPayload` in full (no omitted fields):

```ts
const buildPayload = (): DebtMediationPayload => ({
    submitter_type: formData.submitter_type as SubmitterType,
    full_name: formData.full_name.trim(),
    phone_number: normalizePhone(formData.phone_number),
    province: formData.province.trim(),
    sub_district: formData.sub_district.trim() || null,
    debt_amount: formData.debt_amount,
    debt_type: formData.debt_type as DebtType,
    counterparty_name: formData.counterparty_name.trim(),
    interest_rate: isDebtor ? (formData.interest_rate.trim() || null) : null,
    issue_category: formData.issue_category.trim(),
    issue_other: formData.issue_category === ISSUE_OTHER_LABEL
        ? (formData.issue_other.trim() || null)
        : null,
    line_user_id: profile?.userId || null,
})
```

JSON parse in `submitData`:

```ts
const data: unknown = JSON.parse(resText)
```

then `formatLiffSubmitError(data)` unchanged.

**MIRROR:** `frontend/app/liff/debt-mediation/__tests__/page.test.tsx`

Change `fillStep2` to accept an optional phone (default keeps existing tests green):

```ts
async function fillStep2(
  user: ReturnType<typeof userEvent.setup>,
  phone = '0812345678',
) {
  await user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), 'สมชาย ใจดี')
  await user.type(screen.getByPlaceholderText('0xx-xxx-xxxx'), phone)
  await user.type(screen.getByPlaceholderText('0.00'), '20000')
  await user.selectOptions(screen.getByRole('combobox'), 'สกลนคร')
}
```

Extend `stubFetch`:

```ts
function stubFetch(overrides: { submitStatus?: number; submitBody?: unknown; provincesOk?: boolean } = {}) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/locations/provinces')) {
      if (overrides.provincesOk === false) return jsonResponse({ detail: 'fail' }, 500)
      return jsonResponse([
        { PROVINCE_ID: 74, PROVINCE_THAI: 'สกลนคร', PROVINCE_ENGLISH: 'Sakon Nakhon' },
        { PROVINCE_ID: 1, PROVINCE_THAI: 'กรุงเทพมหานคร', PROVINCE_ENGLISH: 'Bangkok' },
      ])
    }
    if (u.includes('/liff/debt-mediation') && init?.method === 'POST') {
      const status = overrides.submitStatus ?? 201
      const body = overrides.submitBody ?? { id: 9, status: 'PENDING' }
      return jsonResponse(body, status)
    }
    throw new Error(`Unexpected fetch: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}
```

Add these tests (keep existing walks). For walks that reach step 3 then submit, type counterparty (and debtor interest) **before** ยื่นคำขอ — `fillStep2` only fills name/phone/amount/province.

1. Submitter switch (F02). `fillStep2` is called **once**. `onClick` เจ้าหนี้ resets `issue_category` / `issue_other` / `interest_rate` only — **not** `counterparty_name`.
   - ลูกหนี้ → ถัดไป → `fillStep2(user)` → หนี้นอกระบบ → ถัดไป
   - `user.type(screen.getByPlaceholderText('ระบุชื่อเจ้าหนี้ (บุคคลหรือสถาบัน)'), 'นายทุนตลาดทอน')`
   - `user.type(screen.getByPlaceholderText('เช่น ร้อยละ 5 ต่อเดือน'), 'ร้อยละ 20 ต่อเดือน')`
   - `chooseDebtorIssue(user)`
   - click `กลับ` twice (step 2 → 1 → 0)
   - click เจ้าหนี้
   - ถัดไป → ถัดไป (do **not** call `fillStep2` again; step-1 fields would append)
   - expect `ข้อมูลลูกหนี้`; placeholder `ระบุชื่อลูกหนี้` still has `นายทุนตลาดทอน`
   - click `ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้` (must re-select; debtor issue was cleared)
   - ยื่นคำขอ → ยืนยันคำขอ
   - payload `submitter_type === 'CREDITOR'`, `issue_category === 'ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้'`, `interest_rate === null`

2. Dashed phone: `fillStep2(user, '081-234-5678')` then the same step-3 debtor fills as the existing success walk (`ระบุชื่อเจ้าหนี้` + interest + `chooseDebtorIssue`); payload `phone_number === '0812345678'`.

3. `+66`: `fillStep2(user, '+66812345678')` then the same step-3 debtor fills; payload `phone_number === '+66812345678'`. Requires `maxLength={20}` first.

4. Call `stubFetch({ provincesOk: false })` **before** `render` (same order as the existing 422 test at `page.test.tsx:191-194`). Then `findByText('ไม่สามารถโหลดรายชื่อจังหวัดได้ กรุณาลองใหม่')`; badge `โหลดไม่สำเร็จ`; `getByRole('button', { name: 'ลองใหม่' })`. Click `ลองใหม่`; `fetchMock` calls whose URL includes `/locations/provinces` must be `>= 2`.

5. Wizard 401 (F06): call `stubFetch({ submitStatus: 401 })` **before** `render`, then the full debtor walk (ลูกหนี้ → fillStep2 → หนี้นอกระบบ → counterparty + interest + `chooseDebtorIssue` → ยื่นคำขอ → ยืนยันคำขอ). `findByText(SESSION_EXPIRED_MESSAGE)`. Import `SESSION_EXPIRED_MESSAGE` from `@/lib/liff/session-expired`. Do **not** stub after the walk — `beforeEach` already stubs 201.

6. Replace `getByRole('button', { name: 'อื่น ๆ', exact: true })` with `getByRole('button', { name: /^อื่น ๆ$/ })`.

7. F08 + F17 — two asserts, two moments (submitter buttons unmount when leaving step 0):
   - after `render`, click `getByRole('button', { name: /^ลูกหนี้/ })` (still step 0) → `expect(screen.getByRole('button', { name: /^ลูกหนี้/ })).toHaveAttribute('aria-pressed', 'true')` (F17)
   - then click `ถัดไป` (name input exists only at `step === 1`, `page.tsx:463-479`) → `expect(screen.getByLabelText(/ชื่อ-สกุล/)).toBeInTheDocument()` (F08)
   - New walks use `/^ลูกหนี้/` and `/^หนี้นอกระบบ/` because the buttons include description text.

8. F11: ลูกหนี้ → ถัดไป → `user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), '   ')` plus phone/amount/province/`หนี้นอกระบบ` like `fillStep2` but spaces-only name → ถัดไป → `กรุณาระบุชื่อ-สกุล` still on step 1.

**VALIDATE:**  
`cd frontend && npx vitest run app/liff/debt-mediation lib/liff/__tests__/submit-debt-mediation.test.ts`  
`cd frontend && npx tsc --noEmit`  
`cd frontend && npx eslint app/liff/debt-mediation/page.tsx app/liff/debt-mediation/__tests__/page.test.tsx lib/liff/submit-debt-mediation.ts lib/liff/__tests__/submit-debt-mediation.test.ts`

**GOTCHA:** `userEvent.type('+66812345678')` needs `maxLength={20}` first. Badge uses `variant="danger"` not `failed`. `useCallback` with `[]` is stable so the `[loadProvinces]` effect runs once on mount; retry calls `loadProvinces` from onClick and does not retrigger the effect. After submitter switch, never re-type filled step-1 fields. Wizard 401/province-fail tests must `stubFetch` **before** `render`. `loadProvinces` success **must** `setError(null)` or retry leaves the Thai Alert under an Online badge. Invalid-token **handler** tests are Task 3, not this file.

**Finding coverage:** F01-UI F02 F03 F04 F06-wizard F07 F08 F09 F10-js F11 F17 F18.

---

## Task 5 — Helper 401 string + ASCII phone pin (F06 F10-js)

**ACTION:** Pin helper error text to the wizard string; pin JS phone regex to ASCII digits.

**IMPLEMENT:** `frontend/lib/liff/__tests__/submit-debt-mediation.test.ts` only (production phone regex is Task 4.1).

Extend the **existing** `../session-expired` import (do not add a second import from the same module). Today it is `import { SessionExpiredError, isSessionExpired } from '../session-expired'`. Change to:

```ts
import { SessionExpiredError, isSessionExpired, SESSION_EXPIRED_MESSAGE } from '../session-expired'
```

In the existing 401 test, add:

```ts
expect((err as Error).message).toBe(SESSION_EXPIRED_MESSAGE)
```

Add:

```ts
it('accepts ASCII local and +66 phones and rejects Thai digits', () => {
  expect(isValidPhone('0812345678')).toBe(true)
  expect(isValidPhone('081-234-5678')).toBe(true)
  expect(isValidPhone('+66812345678')).toBe(true)
  expect(isValidPhone('๐๘๑๒๓๔๕๖๗๘')).toBe(false)
})
```

SOURCE for the 401 pin: `frontend/lib/liff/__tests__/upload-media.test.ts:3-7,71`.

**MIRROR:** N/A — this task *is* the test. No additional production file.

**VALIDATE:** `cd frontend && npx vitest run lib/liff/__tests__/submit-debt-mediation.test.ts`

**Finding coverage:** F06 F10-js.

---

## Validation Commands

```
cd backend && python -m pytest tests/test_liff_debt_mediation.py tests/test_booking_migration.py -q
cd frontend && npx vitest run app/liff/debt-mediation lib/liff/__tests__/submit-debt-mediation.test.ts
cd frontend && npx tsc --noEmit
cd frontend && npx eslint app/liff/debt-mediation/page.tsx app/liff/debt-mediation/__tests__/page.test.tsx lib/liff/submit-debt-mediation.ts lib/liff/__tests__/submit-debt-mediation.test.ts
```

Project build script (exists in `frontend/package.json`, run by CI `.github/workflows/ci.yml`): `cd frontend && npm run build`. Do **not** run `npm run build` or full pytest as a local Windows gate (websocket hang / long next build). Local static gate is `npx tsc --noEmit`. CI Linux runs `npm run build`. F18 regression is `tsc --noEmit` after `const data: unknown = JSON.parse(resText)`.

## Testing Strategy

### Input / expected (unit)

| Input | Expected |
|-------|----------|
| `debt_amount=1e20` | ValidationError |
| `debt_amount=inf` | ValidationError |
| `debt_amount=0.001` | ValidationError |
| `debt_amount=20000` | pass |
| `debt_amount=999999999999.99` | pass |
| Thai-digit phone | ValidationError match เบอร์โทร |
| JS `isValidPhone('๐๘๑๒๓๔๕๖๗๘')` | `false` |
| `081-234-5678` | `0812345678` |
| `+66812345678` | stored as-is |
| DEBTOR + `ลูกหนี้หลบหนีหนี้` | ValidationError issue_category |
| CREDITOR + interest string | `interest_rate is None` |
| `full_name="   "` | ValidationError full_name |
| `issue_other` 501 chars | ValidationError |
| verify 401 with token `"tok"` | HTTP 401, `db.add` not called |
| missing token strict | 401 detail `LIFF ID token required`, no add |
| wizard POST 401 (stub **before** render) | `SESSION_EXPIRED_MESSAGE` |
| `provincesOk: false` before render | Thai load error + danger badge + `ลองใหม่`; click retry → provinces fetch `>= 2` |
| submitter switch (type counterparty+interest on debtor path first) | CREDITOR payload, creditor issue label, `interest_rate` null |
| wizard `full_name` of three spaces then ถัดไป | stays on step 1; `กรุณาระบุชื่อ-สกุล` |
| after ลูกหนี้ + ถัดไป | `getByLabelText(/ชื่อ-สกุล/)` found; ลูกหนี้ `aria-pressed=true` |

### Edge-case checklist

- [ ] F05: all former `Exception` catches are `ValidationError`
- [ ] F08: `getByLabelText(/ชื่อ-สกุล/)`
- [ ] F09: 501-char `issue_other` 422; inputs have maxLength
- [ ] F13: migration source contains `ondelete="SET NULL"`
- [ ] F14: migration source contains `'{}'::jsonb`
- [ ] F17: `aria-pressed` on submitter uses `opt.value`; on issue uses the string label
- [ ] F01: `inf` rejected; 12+2 digit boundary passes
- [ ] F07: no `exact: true` in page tests
- [ ] Unique alembic head remains `b8c9d0e1f2a3`
- [ ] F02: switch walk types counterparty+interest before `กลับ`; does not call `fillStep2` twice
- [ ] F04: `loadProvinces` success calls `setError(null)`
- [ ] F06-wizard: `stubFetch({ submitStatus: 401 })` before `render`
- [ ] F09: model `counterparty_name = Column(String(200))` matches migration
- [ ] F11: spaces-only ชื่อ-สกุล blocked by `blank()`
- [ ] F16: test file imports `DebtMediationResponse`; handler annotated `-> DebtMediationResponse`
- [ ] F18: `const data: unknown = JSON.parse(resText)` type-checks under `tsc --noEmit`

## Acceptance Criteria

- [ ] B7: F01–F19 each appear in a Task Finding coverage line; deferred items are in NOT Building including PEP8 and empty isInClient catch
- [ ] Scoped pytest + vitest + tsc + eslint green
- [ ] No admin/rich-menu/audit/new revision files
- [ ] JS and Python phone patterns both `[0-9]`

## Risks

| Risk | Mitigation |
|------|------------|
| `max_digits` rejects `20000` | 5 digits; fixture stays |
| Label drift | Strings inlined in this plan from `page.tsx:49-64` |
| Local DB already on old `b8c9d0e1f2a3` | downgrade -1 then upgrade; CI uses fresh Postgres |
| htmlFor collisions | `dm-` prefix |
| 401 test uses `x_liff_id_token=None` | GOTCHA: must pass `"tok"` |
| Badge `failed` variant missing | use `danger` |
| Infinite useEffect on retry | `useCallback` + `[loadProvinces]`; retry is onClick only |
| Re-typing after submitter switch appends | switch test must not call `fillStep2` twice; DO type counterparty+interest once on the debtor path before `กลับ` |
| Issue `aria-pressed={opt.value}` | issue options are strings; use `=== opt` / `=== ISSUE_OTHER_LABEL` |
| Wizard 401 stub after walk hits 201 | stub `submitStatus: 401` before `render` like `page.test.tsx:191` |
| Retry success leaves Thai Alert | `setError(null)` on `loadProvinces` success |
| Model/migration length drift on counterparty | both `String(200)` |

## Before / after

- Before: public POST 500 on amount overflow; UI truncates phones; cross-path issue stored; province outage looks like a skipped field.
- After: 422 with numeric/label/length caps; phones match API including `+66`; path labels enforced both sides; load errors in Thai with retry.
