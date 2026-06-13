# Plan: PR A — Silent Token Refresh + Retry (แก้ "ไม่สามารถโหลดข้อมูลคำร้องได้")

## Summary
หลังใช้งานหน้า admin ~30 นาที access token (JWT) หมดอายุ ทุก admin API ตอบ 401 แต่ระบบไม่มีกลไก refresh/retry ใด ๆ — interceptor ยิง event `jsk:auth-expired` ทิ้งไว้โดยไม่มี listener — ผลคือหน้า `admin/requests` โชว์ "ไม่สามารถโหลดข้อมูลคำร้องได้ กรุณาลองใหม่". แผนนี้เพิ่ม **silent refresh + retry-once** ใน fetch interceptor (dedupe คำขอ refresh ที่เกิดพร้อมกัน) โดยให้ `AuthContext` เป็นเจ้าของ logic refresh และแก้ allowlist ของ backend `/auth/refresh` ให้ครอบ DIRECTOR/HEAD.

## User Story
ในฐานะเจ้าหน้าที่ admin ที่เปิดหน้าจอทิ้งไว้นานเกิน 30 นาที,
ฉันต้องการให้ระบบต่ออายุ session ให้อัตโนมัติเมื่อ token หมดอายุ,
เพื่อให้ใช้งานต่อได้โดยไม่เจอ error "ไม่สามารถโหลดข้อมูลคำร้องได้" หรือถูกเด้งออกกะทันหัน.

## Problem → Solution
**Current:** access token หมดอายุ (30 นาที) → admin API 401 → `authFetch.ts` dispatch `jsk:auth-expired` แต่ **ไม่มี listener** → ไม่ refresh, ไม่ retry, ไม่ redirect → fetch ใน `requests/page.tsx:116` throw → catch → error generic. นอกจากนี้ `/auth/refresh` ปฏิเสธ role DIRECTOR/HEAD.

**Desired:** เมื่อ admin API ตอบ 401 ครั้งแรก → interceptor เรียก refresh (ผ่าน handler ที่ AuthContext ลงทะเบียน, dedupe ด้วย in-flight promise) → ได้ access token ใหม่ → retry คำขอเดิม 1 ครั้งด้วย token ใหม่ → ผู้ใช้ไม่เห็น error. ถ้า refresh ล้มเหลวจริง → dispatch `jsk:auth-expired` → AuthContext logout + redirect `/login`.

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/uat-round3-fixes.prd.md`
- **PRD Phase**: PR A (วิกฤต)
- **Estimated Files**: 4 (2 frontend + 1 backend + 1 test)

---

## UX Design

### Before
```
┌─────────────────────────────────────────┐
│ admin/requests (เปิดทิ้งไว้ > 30 นาที)     │
│  → token หมดอายุ → API 401               │
│  → ❌ "ไม่สามารถโหลดข้อมูลคำร้องได้        │
│        กรุณาลองใหม่"  (กดลองใหม่ก็ 401 อีก) │
└─────────────────────────────────────────┘
```

### After
```
┌─────────────────────────────────────────┐
│ admin/requests (เปิดทิ้งไว้ > 30 นาที)     │
│  → token หมดอายุ → API 401               │
│  → 🔄 refresh เงียบ ๆ → retry คำขอเดิม    │
│  → ✅ ข้อมูลโหลดได้ปกติ (ผู้ใช้ไม่รู้ตัว)   │
│                                           │
│  ถ้า refresh token หมดด้วย:               │
│  → เด้งไป /login (logout สะอาด)           │
└─────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| admin API 401 | error ค้าง | refresh + retry อัตโนมัติ | retry แค่ 1 ครั้ง กัน loop |
| refresh token หมด | ไม่มี handler → ค้าง | logout → /login | ผ่าน `jsk:auth-expired` listener ใหม่ |
| 401 หลาย request พร้อมกัน | — | refresh ครั้งเดียว (dedupe) | shared in-flight promise |
| role DIRECTOR/HEAD refresh | 401 (allowlist ขาด) | สำเร็จ | แก้ backend allowlist |

---

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/lib/authFetch.ts` | 1-102 | interceptor ที่ต้องเพิ่ม refresh+retry; รู้ว่า token มาจาก `window.__JSK_ADMIN_AUTH_TOKEN__` |
| P0 | `frontend/contexts/AuthContext.tsx` | 102-318 | `refreshToken()`, `setToken` (sync window global), `isTokenExpired`, logout flow |
| P0 | `backend/app/api/v1/endpoints/auth.py` | 75-124 | refresh endpoint contract + allowlist ที่ต้องแก้ |
| P1 | `frontend/app/admin/requests/page.tsx` | 98-135 | จุดที่ error โผล่ (ปลายทางที่ต้องหายหลังแก้) |

## External Documentation
No external research needed — ใช้ pattern ภายในล้วน (fetch monkey-patch + CustomEvent + JWT exp ที่มีอยู่แล้ว).

---

## Patterns to Mirror

### TOKEN_GLOBAL_SYNC (sync ก่อน React render)
// SOURCE: frontend/contexts/AuthContext.tsx:129-132
```ts
const setToken = useCallback((next: string | null) => {
  syncAdminAuthToken(next);   // เขียน window.__JSK_ADMIN_AUTH_TOKEN__ ทันที
  setTokenState(next);
}, []);
```

### REFRESH_CALL (contract เดิม)
// SOURCE: frontend/contexts/AuthContext.tsx:286-299
```ts
const response = await fetch('/api/v1/auth/refresh', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${refreshTokenValue}` }
});
if (response.ok) {
  const data = await response.json();
  setToken(data.access_token);
  localStorage.setItem('auth_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('auth_refresh_token', data.refresh_token);
}
```

### EVENT_LISTENER (pattern การ listen window event)
// SOURCE: frontend/components/admin/HelpSheet.tsx:61-62
```ts
window.addEventListener('jsk:open-help', handleOpen as EventListener)
window.addEventListener('jsk:close-help', handleClose as EventListener)
// cleanup ใน return ของ useEffect
```

### INTERCEPTOR_RETRY_SHAPE (โครงปัจจุบันที่จะต่อยอด)
// SOURCE: frontend/lib/authFetch.ts:60-90
```ts
window.fetch = (async (input, init) => {
  const token = window.__JSK_ADMIN_AUTH_TOKEN__ ?? null;
  // ... inject Authorization แล้ว return interceptAuthErrors(await nativeFetch(...))
}) as typeof window.fetch;
```

### BACKEND_ROLE_ALLOWLIST (จุดที่ขาด role)
// SOURCE: backend/app/api/v1/endpoints/auth.py:109-114
```python
select(User).where(
    User.id == user_id,
    User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]),
)
```

---

## Files to Change
| File | Action | Justification |
|---|---|---|
| `frontend/lib/authFetch.ts` | UPDATE | เพิ่ม refresh handler registry + retry-once บน 401 + dedupe |
| `frontend/contexts/AuthContext.tsx` | UPDATE | ลงทะเบียน refresh handler, listen `jsk:auth-expired` → logout |
| `backend/app/api/v1/endpoints/auth.py` | UPDATE | เพิ่ม DIRECTOR, HEAD ใน allowlist ของ /refresh |
| `frontend/lib/__tests__/authFetch.test.ts` | CREATE | unit test refresh+retry, dedupe, ไม่ refresh ซ้ำ, retry แค่ครั้งเดียว |

## NOT Building
- ไม่ทำ proactive/background refresh ก่อน token หมด (reactive 401 พอสำหรับรอบนี้)
- ไม่ย้าย token ไป httpOnly cookie (ต้องแก้ backend ประสานกัน — นอก scope)
- ไม่แตะ retry logic ของหน้าอื่นเป็นรายหน้า (แก้ที่ interceptor ครอบคลุมทุก admin API อยู่แล้ว)
- ไม่แตะ UI ปุ่ม/บทบาท (นั่นคือ PR B)

---

## Step-by-Step Tasks

### Task 1: เพิ่ม refresh handler registry + retry ใน interceptor
- **ACTION**: แก้ `frontend/lib/authFetch.ts`
- **IMPLEMENT**:
  - module-scope: `let refreshHandler: (() => Promise<string | null>) | null = null;` และ `let inflightRefresh: Promise<string | null> | null = null;`
  - export `setAuthRefreshHandler(fn: (() => Promise<string | null>) | null): void { refreshHandler = fn; }`
  - helper `async function runRefresh(): Promise<string | null>` — ถ้า `inflightRefresh` มีอยู่ให้ await ตัวเดิม (dedupe); ไม่งั้นตั้ง `inflightRefresh = refreshHandler?.() ?? Promise.resolve(null)` แล้ว `finally { inflightRefresh = null; }`
  - ใน `window.fetch` wrapper: หลังได้ `res` ของ admin API ที่ inject token แล้ว ถ้า `res.status === 401` และมี `refreshHandler` และ **ยังไม่เคย retry** (flag ภายใน scope ของ call) → `const newToken = await runRefresh();` ถ้าได้ token ใหม่ → ยิงคำขอเดิมซ้ำ 1 ครั้งด้วย `buildAuthHeaders(..., newToken)`; ถ้า refresh คืน null → `interceptAuthErrors(res)` (จะ dispatch `jsk:auth-expired`)
  - ห้าม retry คำขอ `/api/v1/auth/refresh` เอง (กัน recursion) — เช็ค `getRequestUrl(input).includes('/auth/refresh')` แล้วข้าม
- **MIRROR**: INTERCEPTOR_RETRY_SHAPE, ใช้ `buildAuthHeaders` เดิม (L47-51)
- **IMPORTS**: ไม่ต้องเพิ่ม import นอกไฟล์
- **GOTCHA**:
  - body ของ Request ที่เป็น stream อ่านได้ครั้งเดียว — สำหรับ admin GET (requests list) ไม่มี body จึง retry ปลอดภัย; ถ้า input เป็น `Request` ที่มี body ให้ retry จาก `init` เดิม (เรามี `init` อยู่แล้ว) ไม่ clone body จาก consumed Request
  - retry ครั้งเดียวเท่านั้น (ใช้ boolean flag ต่อ call) — กัน loop เมื่อ token ใหม่ยัง 401
  - `interceptAuthErrors` ต้องยัง clone response ก่อน dispatch (มีแล้ว)
- **VALIDATE**: `cd frontend && npx tsc --noEmit` ไม่มี error

### Task 2: ลงทะเบียน refresh handler + listen jsk:auth-expired ใน AuthContext
- **ACTION**: แก้ `frontend/contexts/AuthContext.tsx`
- **IMPLEMENT**:
  - import `setAuthRefreshHandler` จาก `@/lib/authFetch`
  - แตก logic refresh เป็น `refreshAccessToken(): Promise<string | null>` ที่ **คืน access token ใหม่** (ไม่ logout เองในนี้ — คืน null เมื่อล้มเหลว): อ่าน `auth_refresh_token`, ถ้าไม่มีคืน null; POST `/auth/refresh`; ถ้า ok → `setToken(data.access_token)` + localStorage + คืน `data.access_token`; ถ้าไม่ ok หรือ throw → คืน null. (เคารพ `isLocalhostDevBypass()` → คืน null/no-op)
  - คง `refreshToken()` เดิมไว้ใน context value แต่ให้เรียก `refreshAccessToken()` แล้ว `if (!newToken) logout();` (พฤติกรรมเดิมไม่เสีย)
  - `useEffect` (mount ครั้งเดียว): `setAuthRefreshHandler(refreshAccessToken)`; cleanup `setAuthRefreshHandler(null)`
  - `useEffect` (mount ครั้งเดียว): `window.addEventListener('jsk:auth-expired', onExpired)` โดย `onExpired = () => logout()`; cleanup remove. (interceptor จะ dispatch event นี้เฉพาะตอน refresh ล้มเหลวแล้วเท่านั้น)
- **MIRROR**: REFRESH_CALL, TOKEN_GLOBAL_SYNC, EVENT_LISTENER
- **IMPORTS**: `import { installAdminAuthFetchInterceptor, syncAdminAuthToken, setAuthRefreshHandler } from '@/lib/authFetch';`
- **GOTCHA**:
  - `refreshAccessToken` ต้องเสถียรด้วย `useCallback([])` (ใช้ผ่าน window global/localStorage ไม่ผูก state) เพื่อไม่ให้ลงทะเบียน handler ใหม่ทุก render
  - `onExpired` ต้องอ้าง `logout` ที่ stable (logout เป็น `useCallback([router])` แล้ว) — ใส่ใน dep array ให้ถูก
  - ระวัง refreshAccessToken เรียก `setToken` (React setState) ระหว่างอยู่นอก render — ปลอดภัยเพราะ event-driven
- **VALIDATE**: `npx tsc --noEmit` + เปิดหน้า admin แล้ว token หมด (จำลอง) ต้อง refresh เงียบ

### Task 3: แก้ allowlist ของ /auth/refresh ให้ครอบ DIRECTOR/HEAD
- **ACTION**: แก้ `backend/app/api/v1/endpoints/auth.py:112`
- **IMPLEMENT**: เปลี่ยน `User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT])` → เพิ่ม `UserRole.DIRECTOR, UserRole.HEAD` (ตรวจว่า enum มีจริงใน `backend/app/models/user.py`; ถ้า login endpoint ใช้ allowlist เดียวกันให้ดูว่าควร sync ด้วยไหม — ในรอบนี้แก้เฉพาะ /refresh ตาม scope)
- **MIRROR**: BACKEND_ROLE_ALLOWLIST
- **IMPORTS**: `UserRole` import อยู่แล้ว
- **GOTCHA**: ถ้า `UserRole` ยังไม่มี DIRECTOR/HEAD (เพิ่มทีหลังเฉพาะ frontend) → **หยุดและบันทึกไว้ใน PR B** อย่าเดา enum; กรณีนั้นแก้แค่คงเดิม + note. (ตาม AuthContext comment ระบุว่า backend มีแล้วตั้งแต่ 2026-05-04)
- **VALIDATE**: `cd backend && python -m pytest tests/ -k refresh` ผ่าน

### Task 4: Unit test interceptor refresh+retry
- **ACTION**: สร้าง `frontend/lib/__tests__/authFetch.test.ts`
- **IMPLEMENT** (vitest, mock `window.fetch` ผ่าน nativeFetch):
  - "admin API 401 → เรียก refresh handler แล้ว retry ด้วย token ใหม่ → คืน 200"
  - "refresh handler คืน null → ไม่ retry, dispatch jsk:auth-expired"
  - "401 สองคำขอพร้อมกัน → refresh handler ถูกเรียกครั้งเดียว (dedupe)"
  - "retry แค่ครั้งเดียว: token ใหม่ยัง 401 → ไม่ refresh วน, คืน 401"
  - "ไม่ยุ่งกับ non-admin request / request ที่มี Authorization อยู่แล้ว"
- **MIRROR**: รูปแบบ test ที่มีใน `frontend/lib/__tests__/*.test.ts` (เช่น diff-fields.test.ts) — describe/it/expect, AAA
- **IMPORTS**: `import { installAdminAuthFetchInterceptor, syncAdminAuthToken, setAuthRefreshHandler } from '../authFetch'`
- **GOTCHA**: ต้อง reset `window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__`, `window.fetch`, handler ใน `beforeEach`/`afterEach`; mock `localStorage`; ใช้ `vi.fn()` สำหรับ nativeFetch counts
- **VALIDATE**: `npx vitest run lib/__tests__/authFetch.test.ts` (รันบน Windows PowerShell) ผ่านทุกเคส

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| refresh+retry สำเร็จ | admin GET → 401 แล้ว handler คืน token ใหม่ | nativeFetch ถูกเรียก 2 ครั้ง, ผลลัพธ์ 200 | - |
| refresh ล้มเหลว | handler คืน null | nativeFetch 1 ครั้ง, dispatch `jsk:auth-expired`, คืน 401 | ✓ |
| dedupe | 2 admin GET 401 พร้อมกัน | handler ถูกเรียก 1 ครั้ง | ✓ concurrency |
| retry ครั้งเดียว | token ใหม่ยัง 401 | ไม่เข้า refresh รอบ 2, คืน 401 | ✓ loop guard |
| ข้าม /auth/refresh | คำขอ refresh เอง 401 | ไม่ recursion | ✓ |
| non-admin | fetch `/api/v1/liff/...` 401 | ไม่ refresh | ✓ |

### Edge Cases Checklist
- [ ] refresh token หมด/ไม่มี → logout → /login
- [ ] 401 พร้อมกันหลายคำขอ → refresh ครั้งเดียว
- [ ] token ใหม่ยัง invalid → ไม่วน loop
- [ ] role DIRECTOR/HEAD → refresh ผ่าน (backend)
- [ ] dev bypass localhost → ไม่ยุ่ง refresh
- [ ] คำขอ POST/PATCH ที่มี body → retry ใช้ init เดิม ไม่พังเพราะ body consumed

---

## Validation Commands

### Static Analysis
```bash
cd frontend && npx tsc --noEmit
cd frontend && npx eslint lib/authFetch.ts contexts/AuthContext.tsx
```
EXPECT: zero error

### Unit Tests (Windows PowerShell)
```powershell
cd frontend; npx vitest run lib/__tests__/authFetch.test.ts
```
EXPECT: all pass

### Backend Tests (WSL)
```bash
cd backend && python -m pytest tests/ -k "refresh or auth"
```
EXPECT: pass (Docker db/redis ต้องรันก่อน: `docker compose up -d db redis`)

### Full Frontend Suite
```powershell
cd frontend; npx vitest run
```
EXPECT: no regressions (29 tests + ชุดใหม่)

### Manual Validation
- [ ] login เข้า admin → เปิด DevTools → ลบ `auth_token` หรือแก้ exp ให้หมดอายุ
- [ ] กดเมนู requests → ต้องเห็น POST `/auth/refresh` 200 แล้ว GET `/admin/requests` 200 (ไม่มี error)
- [ ] ลบทั้ง `auth_token` + `auth_refresh_token` → ต้องเด้ง `/login`

---

## Acceptance Criteria
- [ ] admin API 401 → silent refresh + retry สำเร็จ ผู้ใช้ไม่เห็น error
- [ ] refresh ล้มเหลว → logout + redirect /login (ไม่ค้าง)
- [ ] 401 พร้อมกัน → refresh ครั้งเดียว
- [ ] retry สูงสุด 1 ครั้ง (ไม่ loop)
- [ ] DIRECTOR/HEAD refresh ผ่าน
- [ ] tsc/eslint/vitest/pytest เขียว

## Completion Checklist
- [ ] ตาม pattern เดิม (window global sync, CustomEvent, buildAuthHeaders)
- [ ] error handling: refresh fail → คืน null ชัดเจน ไม่กลืน
- [ ] ไม่มี console.log หลงเหลือ (ใช้ console.error เดิมใน catch ตาม pattern)
- [ ] test ครอบ dedupe + loop guard
- [ ] ไม่ขยาย scope ไป UI/ปุ่ม (เป็น PR B)
- [ ] self-contained — ไม่ต้องค้น codebase เพิ่ม

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| body ของ POST/PATCH ถูก consume ก่อน retry | กลาง | คำขอ retry พัง | retry จาก `init` เดิม ไม่ใช่จาก Request ที่ถูกอ่าน; test ครอบ |
| refresh handler ผูกผิด ทำให้ logout ทันที | ต่ำ | ใช้งานไม่ได้ | handler คืน null เฉพาะตอนล้มจริง; `jsk:auth-expired` ยิงหลัง refresh fail เท่านั้น |
| `UserRole` ไม่มี DIRECTOR/HEAD ใน backend | ต่ำ | pytest พัง | Task 3 GOTCHA: ตรวจ enum ก่อน; ถ้าไม่มีให้คงเดิม + ส่งต่อ PR B |
| retry loop ถ้า token ใหม่ยัง 401 | ต่ำ | request พายุ | boolean flag retry ครั้งเดียวต่อ call |

## Notes
- เชื่อมกับ PR B: allowlist role ใน auth.py (และ "agent→staff") เป็นจุดร่วม — Task 3 แตะเฉพาะ /refresh; การ rename/sync เต็มรูปทำใน PR B
- ทั้งหมด reactive ที่ 401 — ครอบทุก admin API ผ่าน interceptor เดียว ไม่ต้องแก้รายหน้า
- commit ไม่มี Co-Authored-By (global rule); branch ใหม่ `fix/uat-r3-a-silent-token-refresh`
