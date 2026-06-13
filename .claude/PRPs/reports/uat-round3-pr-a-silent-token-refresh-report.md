# Implementation Report: PR A — Silent Token Refresh + Retry

## Summary
แก้อาการ "ไม่สามารถโหลดข้อมูลคำร้องได้ กรุณาลองใหม่" ที่เกิดหลังใช้งาน admin ~30 นาที (access token หมดอายุ). เพิ่ม silent refresh + retry-once ใน fetch interceptor (dedupe คำขอ refresh พร้อมกัน), ให้ AuthContext เป็นเจ้าของ logic refresh + listen `jsk:auth-expired` เพื่อ logout เมื่อกู้ไม่ได้, และแก้ allowlist ของ `/auth/login` + `/auth/refresh` ให้ครอบ DIRECTOR/HEAD (เดิมล็อกอินไม่ได้เลย).

## Assessment vs Reality
| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | 9/10 | 9/10 (ตรงตามแผน) |
| Files Changed | 4 | 4 |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | refresh handler registry + retry-once + dedupe ใน authFetch.ts | ✅ Complete | แยก `notifyAuthExpired`/`notifyForbidden` กัน login 401 ไป logout |
| 2 | ลงทะเบียน handler + listen jsk:auth-expired ใน AuthContext | ✅ Complete | `refreshAccessToken` คืน token (ไม่ logout เอง); `refreshToken` เดิมคง behavior |
| 3 | allowlist /auth/refresh + /auth/login เพิ่ม DIRECTOR/HEAD | ✅ Complete | Deviation: แก้ login ด้วย (เดิมก็ขาด) + ทำเป็น constant `_ADMIN_AUTH_ROLES` |
| 4 | Unit test authFetch refresh+retry+dedupe | ✅ Complete | 6 เคส + regression test allowlist ฝั่ง backend |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| Static Analysis (tsc) | ✅ Pass | 0 errors |
| Lint (eslint) | ✅ Pass | 0 errors (3 warning setToken missing-dep เป็นของเดิมใน login/logout/initAuth) |
| Unit Tests (vitest) | ✅ Pass | 79/79 (รวม 6 เคสใหม่ของ authFetch) |
| Backend Tests (pytest) | ✅ Pass | test_auth_login.py 4/4 (รวม regression allowlist) |
| Edge Cases | ✅ Pass | dedupe, retry-once, non-admin, caller-set Authorization, refresh-fail |

## Files Changed
| File | Action | Lines |
|---|---|---|
| `frontend/lib/authFetch.ts` | UPDATED | +~85 / -8 |
| `frontend/contexts/AuthContext.tsx` | UPDATED | +~40 / -20 |
| `backend/app/api/v1/endpoints/auth.py` | UPDATED | +12 / -2 |
| `frontend/lib/__tests__/authFetch.test.ts` | CREATED | +~150 |
| `backend/tests/test_auth_login.py` | UPDATED | +14 |

## Deviations from Plan
- **Task 3 ขยายเล็กน้อย (ถูกต้อง)**: แผนระบุแก้เฉพาะ `/auth/refresh` แต่พบว่า `/auth/login` (auth.py:39) ใช้ allowlist เดียวกันและขาด DIRECTOR/HEAD เช่นกัน → ผู้ใช้ role นั้น **ล็อกอินไม่ได้เลย** ไม่ใช่แค่ refresh ไม่ผ่าน จึงแก้ทั้งสองที่ด้วย shared constant `_ADMIN_AUTH_ROLES` (DRY กัน drift). ถือว่าอยู่ในเจตนา PR A (auth/token) และจำเป็นเพื่อความสอดคล้อง.
- เพิ่ม regression test ฝั่ง backend (assert constant) เพราะ test เดิม mock SQL result ทำให้ filter `role.in_()` ไม่ถูก exercise.

## Issues Encountered
- **login 401 → logout ไม่พึงประสงค์**: เดิม interceptor ยิง `jsk:auth-expired` ทุก 401 รวม credential ผิด พอเพิ่ม listener จึงต้องแยก `notifyAuthExpired` (เฉพาะ admin path กู้ไม่ได้) ออกจาก `notifyForbidden`. แก้แล้ว.
- **Body re-use ตอน retry**: `Request` input ใช้ `input.clone()` ก่อนยิงครั้งแรก เพื่อ retry ได้โดยไม่เจอ "body stream already read".

## Tests Written
| Test File | Tests | Coverage |
|---|---|---|
| `frontend/lib/__tests__/authFetch.test.ts` | 6 | refresh+retry, refresh-fail→auth-expired, dedupe, retry-once, non-admin, caller-auth |
| `backend/tests/test_auth_login.py` | +1 | `_ADMIN_AUTH_ROLES` ครอบ DIRECTOR/HEAD/AGENT/ADMIN/SUPER_ADMIN, กัน USER |

## Next Steps
- [x] Unit/type/lint/pytest เขียว
- [ ] Commit → push → PR
- [ ] CI (Pytest + Lint&Build + Playwright + Encoding) เขียว → squash merge → ไป PR B
