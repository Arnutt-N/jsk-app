---
name: skn-liff-form
description: >
  Extends, modifies, or debugs the LIFF service request wizard in SKN App — a
  4-step mobile form for LINE users (not admins) that runs inside the LINE app
  using the LIFF SDK. Use when asked to "add LIFF form field", "modify LIFF wizard step",
  "add topic category", "fix LIFF SDK init", "add file upload to LIFF", "LIFF form not submitting",
  "add step to LIFF form", "แก้ไขฟอร์ม LIFF", "เพิ่มขั้นตอน LIFF", "เพิ่มหัวข้อคำร้อง",
  "LIFF ยื่นไม่ได้", "ฟอร์มส่งไม่ผ่าน", "dropdown จังหวัด".
  Do NOT use for backend LIFF endpoints (skn-liff-data), LINE webhook (skn-webhook-handler),
  or admin service request management (skn-service-request).
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: Next.js 16, React, TypeScript, @line/liff SDK v2.
  LIFF form runs at /liff/service-request. Needs NEXT_PUBLIC_LIFF_ID env var.
  Geography tables must be seeded in DB (see skn-liff-data GAP-3).
metadata:
  author: SKN App Team
  version: 1.1.0
  project: skn-app
  category: frontend
  tags: [liff, mobile, line, service-request, form, hooks]
  pr202-refactor: shared hooks/lib extraction synced into this skill
  related-skills:
    - skn-liff-data
    - skn-service-request
    - skn-admin-component
  documentation: ./references/liff_form_reference.md
---

# skn-liff-form

The LIFF service request wizard is a mobile-first, Thai-language form for citizens
to submit service requests directly from LINE. It is the primary public-facing
entry point — NOT part of the admin panel. Since PR #202 (`d259efe`) the shared
LIFF plumbing (SDK init, auto-close countdown, cascade fetches, submit POST)
lives in reusable hooks/helpers under `frontend/hooks` + `frontend/lib/liff`;
each page keeps its own step UI, formData, and validation.

---

## CRITICAL: Project-Specific Rules

1. **Layered structure since PR #202** — Step UI, `formData`, and `validateStep`
   stay inline in each `page.tsx`. Shared behavior lives in four modules:
   - `frontend/hooks/useLiffInit.ts` — init / login redirect / profile / idToken / isInLineApp
   - `frontend/hooks/useAutoCloseCountdown.ts` — success-screen countdown → `onClose`
   - `frontend/lib/liff/location-cascade.ts` — `fetchDistricts` / `fetchSubDistricts`
   - `frontend/lib/liff/submit-service-request.ts` — POST wrapper (`x-liff-id-token`, 401 message)
   Adding a field/step → edit `page.tsx` directly. Changing init/close/cascade/
   submit semantics → edit the module above. Both hooks have unit tests in
   `frontend/hooks/__tests__/` — keep them green (`npm run test:unit`).

2. **Location cascade: two separate state layers** — IDs are NOT stored in `formData`.
   Use `selectedProvinceId` and `selectedDistrictId` (integers) for API cascade calls.
   Store Thai name strings in `formData.province`, `formData.district`, `formData.sub_district`.
   The backend expects names like `"สกลนคร"`, not integer IDs.
   ```ts
   // Right:
   formData.province = "สกลนคร"    // Thai name → sent to backend
   selectedProvinceId = 1          // integer ID → used for next-level fetch only
   ```

3. **LIFF SDK loads via layout, then `useLiffInit` drives it** — `liff/layout.tsx`
   loads `https://static.line-scdn.net/liff/edge/2/sdk.js` with `strategy="beforeInteractive"`.
   Pages never inline `liff.init` — they call `useLiffInit({ getLiff })` where
   `getLiff` returns the bundled import (`() => liff`) on the wizard or
   `() => window.liff` (script-injected) on `request-v2` / `service-request-single`.
   `NEXT_PUBLIC_LIFF_ID` must be set.

4. **`liff.isInClient()` controls close behavior** — Inside LINE app: `liff.closeWindow()`.
   Outside LINE app: `window.close()` (may silently fail if not opened by a script).

5. **TOPIC_OPTIONS is hardcoded in-file** — `const TOPIC_OPTIONS: Record<string, string[]>`
   maps category name → subcategory list. This is NOT fetched from the backend.
   To add or change topics, edit this constant directly.

6. **`formData.attachments` is `Array<{id, url, name}>`** — Only the `id` values
   (UUID strings) are sent to the backend in the submit payload. `url` and `name`
   are for display only.

7. **Profile userId is nullable** — `profile?.userId || null` is sent as `line_user_id`.
   If LIFF init fails or user is outside LINE app without login, `line_user_id` will be null.

8. **Validation is per-step** — `validateStep(currentStep)` is called before advancing.
   Step 3 (attachments) has no required fields — `validateStep(3)` always returns true.
   The confirmation modal (`showConfirm`) is shown before the final submit.

9. **API paths are inconsistent** — Provinces use `NEXT_PUBLIC_API_URL || '/api/v1'`.
   Districts/sub-districts use hardcoded `/api/v1/...`. This is a known inconsistency.

10. **TypeScript location types use UPPERCASE keys** — Import from `frontend/types/location.ts`.
    `Province.PROVINCE_ID`, `Province.PROVINCE_THAI` — match exactly what the backend returns.

---

## Context7 Docs

| Library | Resolve Name | Key Topics |
|---|---|---|
| Next.js | `"next.js"` | Script strategy, Client Components, env vars |
| React | `"react"` | useState, useEffect, event handlers |

---

## File Structure

```
frontend/app/liff/
├── layout.tsx                 — Loads LINE LIFF SDK script (beforeInteractive)
├── service-request/
│   └── page.tsx               — Main 4-step wizard (bundled liff import)
├── request-v2/page.tsx        — window.liff variant with loading gate (!initDone)
├── service-request-single/    — Single-page variant (requireLiffId=false, silent skip)
└── test/page.tsx              — LIFF test page

frontend/hooks/useLiffInit.ts           — Shared init hook (+ __tests__/useLiffInit.test.tsx)
frontend/hooks/useAutoCloseCountdown.ts — Countdown→close hook (+ __tests__)
frontend/lib/liff/location-cascade.ts   — fetchDistricts / fetchSubDistricts
frontend/lib/liff/submit-service-request.ts — POST wrapper for all 3 pages

frontend/types/location.ts  — Province, District, SubDistrict TypeScript types
```

---

## Step 1 — LIFF SDK Initialization

All pages initialize through `useLiffInit`; per-page options differ:

```ts
// service-request/page.tsx (wizard)
const { profile, idToken, isInLineApp, setIsInLineApp } = useLiffInit({
    getLiff: () => liff,          // bundled @line/liff default export
    requireLiffId: true,
    redirectLogin: true,
    trackInLineApp: true,         // drives auto-close gating on success screen
})

// request-v2/page.tsx
const { profile, idToken, initDone } = useLiffInit({
    getLiff: () => window.liff,
    requireLiffId: true,
    redirectLogin: true,
    warnWhenSdkMissing: true,
    onError: () => setError('Failed to initialize LIFF...'),
})
const loading = !initDone           // initDone=true ALWAYS after success/failure/skip

// service-request-single/page.tsx
const { profile, idToken, initDone } = useLiffInit({
    getLiff: () => window.liff,
    requireLiffId: false,           // tolerate missing env in browser mode
    redirectLogin: false,           // skip silently when not logged in
})
```

| Page | getLiff | requireLiffId | redirectLogin | warnWhenSdkMissing | onError | trackInLineApp |
|---|---|---|---|---|---|---|
| service-request | `() => liff` | true | true | – | – | **true** |
| request-v2 | `() => window.liff` | true | true | true | sets error text | false |
| service-request-single | `() => window.liff` | **false** | **false** | – | – | false |

**Key:** failures are caught inside the hook (`initDone=true` always; `liffError`
+ `onError` carry the problem) — the form still renders and accepts manual inputs.
If init failed or login was skipped, `profile` stays null → `line_user_id` is null
on submit. The province fetch runs in parallel outside the hook and is unaffected.
On init failure with `trackInLineApp:true`, the hook re-detects via a fresh
`getLiff()?.isInClient()` so mobile users still get auto-close.

---

## Step 2 — Location Cascade

Three cascade levels: province → district → sub-district.

```ts
// Province selection (cascade fetches go through lib/liff/location-cascade.ts)
const handleProvinceChange = async (e) => {
  const provinceId = parseInt(e.target.value)
  const provinceObj = provinces.find(p => p.PROVINCE_ID === provinceId)
  setSelectedProvinceId(provinceId)           // integer — for API
  setFormData(prev => ({
    ...prev,
    province: provinceObj?.PROVINCE_THAI || '', // Thai name — sent to backend
    district: '', sub_district: ''             // reset sub-levels
  }))
  setDistricts([]);  setSubDistricts([])
  setSelectedDistrictId(null)
  const data = await fetchDistricts(provinceId)   // from '@/lib/liff/location-cascade'
  setDistricts(data)
}
```

Same pattern for district → sub-district. Sub-district selection only stores the
Thai name in `formData.sub_district` (no integer state needed).

**Warning:** The `<select>` for sub-districts uses a reverse-lookup to find the
currently selected ID from the Thai name:
```tsx
value={subDistricts.find(s => s.SUB_DISTRICT_THAI === formData.sub_district)?.SUB_DISTRICT_ID || ''}
```
This means if two sub-districts have the same Thai name the wrong one may be selected.

---

## Step 3 — Add a New Form Field

Example: adding a `id_card_number` field to Step 1 (personal).

**3a — Add to `formData` state:**
```ts
const [formData, setFormData] = useState({
  // ...existing fields...
  id_card_number: '',
})
```

**3b — Add validation in `validateStep(0)`:**
```ts
case 0:
  // ...existing checks...
  if (!formData.id_card_number) errors.id_card_number = 'กรุณาระบุเลขบัตรประชาชน'
  else if (formData.id_card_number.length !== 13) errors.id_card_number = 'เลขบัตรประชาชนไม่ถูกต้อง'
  break
```

**3c — Add input in the step 0 JSX:**
```tsx
<div>
  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
    เลขบัตรประชาชน <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    name="id_card_number"
    value={formData.id_card_number}
    onChange={handleChange}
    className={`w-full bg-white border text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none transition-all ${
      fieldErrors.id_card_number ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200'
    }`}
    placeholder="x-xxxx-xxxxx-xx-x"
    maxLength={13}
  />
  {fieldErrors.id_card_number && (
    <p className="text-red-500 text-[10px] mt-1">{fieldErrors.id_card_number}</p>
  )}
</div>
```

**3d — The `handleChange` handler works automatically** — it uses `name` attribute.

**3e — Update backend schema** — `skn-liff-data` for `ServiceRequestCreate` schema
and `skn-fastapi-endpoint` + `skn-migration-helper` for model + migration.

---

## Step 4 — Add a New Topic Category

`TOPIC_OPTIONS` is hardcoded at the top of the file:

```ts
const TOPIC_OPTIONS: Record<string, string[]> = {
  "กองทุนยุติธรรม": [
    "ค่าจ้างทนายความ",
    "ค่าธรรมเนียมศาล",
    // ...
  ],
  // Add new category here:
  "ให้คำปรึกษากฎหมาย": [
    "ปัญหาแรงงาน",
    "ปัญหาครอบครัว",
    "อื่นๆ",
  ],
}
```

The `<select>` in Step 3 renders `Object.keys(TOPIC_OPTIONS)` automatically.
The subcategory `<select>` renders `TOPIC_OPTIONS[formData.topic_category]`.

---

## Step 5 — File Upload

File upload uses `POST /api/v1/media` with multipart/form-data:

```ts
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files[0]
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/v1/media', { method: 'POST', body: fd })
  const data = await res.json()   // { id: UUID, filename: string }
  setFormData(prev => ({
    ...prev,
    attachments: [
      ...prev.attachments,
      { id: data.id, url: `/api/v1/media/${data.id}`, name: data.filename }
    ]
  }))
}
```

**Note:** `url` is stored for preview but never sent to backend. Only `id` values are
submitted:
```ts
// In submitData:
const payload = {
  ...formData,              // formData.attachments = [{ id, url, name }]
  line_user_id: profile?.userId || null
}
// Backend expects formData.attachments to be sent as-is; the endpoint
// maps attachment.id values only (string UUIDs)
```

---

## Step 6 — Submit Flow

All three pages POST through the shared wrapper:

```ts
const res = await submitServiceRequest(
  { ...formData, line_user_id: profile?.userId || null },
  idToken                       // from useLiffInit
)
```

- Attaches header `x-liff-id-token` automatically when `idToken` is present
- On **401** throws exactly:
  `'เซสชัน LINE หมดอายุ กรุณาปิดหน้าต่างนี้แล้วเปิดฟอร์มใหม่จากเมนู LINE'`
- Returns the raw `Response` otherwise — each page keeps its own parsing /
  error formatting (parses as text first → tries JSON.parse, handles HTML error
  pages from 500s gracefully)

**On success (`success = true` → success card):**

| Page | Countdown enabled when | Reset path |
|---|---|---|
| service-request | `success && isInLineApp` — **silent outside LINE**, no counter shown | "ยื่นคำร้องใหม่" (external browser only) |
| request-v2 | `success` — counts always once submitted | n/a |
| service-request-single | `success` — counts always once submitted | n/a |

Inside LINE the countdown ticks 5→0 then fires `onClose` once (`liff.closeWindow()`);
the callback is re-read through a ref on every render so inline closures are safe.
Outside LINE (wizard only) the success card stays without a timer and offers
"ยื่นคำร้องใหม่" / "กลับหน้าหลัก".

---

## Common Issues

### `NEXT_PUBLIC_LIFF_ID` not set
**Symptom:** LIFF init throws `"LIFF ID is not specified in environment variables."`
**Fix:** Add to `frontend/.env.local`:
```
NEXT_PUBLIC_LIFF_ID=1234567890-AbCdEfGh
```

### Province dropdown is empty
**Symptom:** `GET /api/v1/locations/provinces` returns `[]`
**Cause:** Geography tables not seeded in database.
**Fix:** Run the geography seed SQL/script (see `skn-liff-data` GAP-3). Check
`SELECT COUNT(*) FROM provinces`.

### `liff.closeWindow()` does nothing
**Cause:** Page is opened in external browser, not inside LINE app.
**Fix:** `liff.isInClient()` returns false → `window.close()` fallback. User sees
"กรุณาปิดหน้านี้ด้วยตนเอง" instruction.

### No countdown on the wizard success screen outside LINE
**Not a bug** — the wizard gates the timer behind `useAutoCloseCountdown(success && isInLineApp)`,
so external browsers intentionally show a static card ("ยื่นคำร้องใหม่" / "กลับหน้าหลัก").
`request-v2` and `service-request-single` count as soon as `success` flips, any context.

### Form submits but `line_user_id` is null in DB
**Cause:** LIFF init failed or login was skipped (`redirectLogin=false` on the single page).
**Fix:** `useLiffInit` captures failures in `liffError` (+ optional `onError`) while still
setting `initDone=true`, so look there first, then the browser console. Ensure
`NEXT_PUBLIC_LIFF_ID` is set and the LIFF channel is published. `profile=null`
→ `line_user_id=null` is expected behavior in those cases.

### Step validation blocks on wrong step
**Cause:** `validateStep(3)` is called on step 3 (attachments), which has no required
fields and always returns true. If called on wrong step number, it may pass incorrectly.
**Fix:** Always call `validateStep(step)` with current step index; `setShowConfirm` only
after `validateStep(3)` returns true.

### District dropdown stays empty after province select
**Cause:** Province `<select>` is bound to `selectedProvinceId`, not a field in `formData`.
The `onChange` calls `handleProvinceChange` which fetches districts.
**Fix:** Check that `handleProvinceChange` is called (not `handleChange`) for the province
`<select>`. They have different `onChange` bindings.

---

## Quality Checklist

Before finishing, verify:
- [ ] `selectedProvinceId`/`selectedDistrictId` are integers (not strings from select value)
- [ ] `formData.province`/`district`/`sub_district` store Thai names (not IDs)
- [ ] New fields added to `formData` initial state
- [ ] New fields added to per-step `validateStep()` case
- [ ] New topic categories added to `TOPIC_OPTIONS` constant
- [ ] File upload: only `id` values in attachments payload to backend
- [ ] LIFF failure doesn't block form render — guaranteed by `useLiffInit` (error captured, `initDone` always set)
- [ ] No inline location-cascade fetches or submit POSTs reintroduced in pages — reuse `lib/liff` helpers
- [ ] Hook/helper behavior changes keep unit tests green (`npm run test:unit`)
- [ ] Confirmation modal shown before `submitData()`
- [ ] `window.scrollTo(0, 0)` called after step advance and after success/error

## Additional Resources

For backend field mapping and location API response shapes — see
`references/liff_form_reference.md`.
