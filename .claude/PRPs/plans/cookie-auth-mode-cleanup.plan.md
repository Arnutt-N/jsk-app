# PRP Plan: COOKIE_AUTH_MODE Cleanup (cookie-only)

> **Status: REV 2 (2026-08-22)** — แก้ตามผล review: สลับลำดับ task (collapse ก่อนลบ flag),
> test case mapping แก้ตาม fact-check, เพิ่ม cleanup ที่หลุด inventory
> **PRD:** `.claude/PRPs/prds/cookie-auth-mode-cleanup.prd.md`
> **Branch:** `refactor/cookie-auth-mode-cleanup`
> **ค่าประมาณ:** ~6 tasks, test churn อยู่ใน `test_cookie_auth.py` + `test_config_migration_controls.py` เท่านั้น

## Task 1 — deps.py: collapse get_current_user

- ลบ `security = HTTPBearer(auto_error=False)` (line 19) + import
  `HTTPBearer, HTTPAuthorizationCredentials` (line 5)
- ลบ param `credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)`
- Collapse lines 58-68:
  ```python
  cookie_token = request.cookies.get(ACCESS_COOKIE)
  token: Optional[str] = cookie_token or None
  token_source: Optional[str] = "cookie" if token else None
  ```
- อัปเดต docstring (37-55) + CSRF comments (22-24, 149-151): ทุก request authenticated
  = cookie-sourced; presence-based semantics + DEV_AUTH_BYPASS คงเดิม
- **Guard:** behavior ใน cookie mode byte-equivalent — ไม่แตะ logic หลัง line 68,
  `request.state.auth_token_source`, CSRF compare_digest, role gates
- Verified safe: ไม่มี caller import `deps.security`, ไม่มี positional call, WS path
  (`ws_session/auth.py`) ใช้ JWT/ticket แยก

## Task 2 — auth.py: collapse mode branches

- **login (186-215):** ลบ if/else → always `create_session_family` + `set_auth_cookies` +
  `body_access_token=""`; คง audit + response shape (`token_type="bearer"` คงไว้ — cosmetic)
- **refresh (218-355):** source = refresh cookie เท่านั้น; **ลบ param `authorization`
  (line 222)** พร้อม header fallback (228-235); `session_backed = bool(payload.get("jti"))`;
  ลบ legacy stateless path 340-355 ทั้งบล็อก; body always omit tokens
- **logout:** comment "All modes" → ปรับ wording (behavior เดิม)
- **migrate-session (406-488):** ลบ bearer-mode 409 branch (451-455); always omit body
  tokens; docstring ปรับ (416)
- **ws-ticket (491-519):** docstring → "Cookie-authenticated via get_current_user"

## Task 3 — config.py: ลบ flag (ทำหลัง Task 1-2 เสมอ)

⚠️ **ลำดับสำคัญ:** ลบ flag ก่อน collapse = `settings.COOKIE_AUTH_MODE` AttributeError
→ pytest แดงทั้ง suite จนกว่า Task 1-2 เสร็จ

- ลบเฉพาะ field `COOKIE_AUTH_MODE` (line 53) + comment ของมัน (48-49, 54-57 ที่เกี่ยว) —
  ⚠️ **ห้ามแตะ** `LIFF_STRICT_MODE` (:50-52) ที่อยู่ช่วงเดียวกัน
- `extra="ignore"` รับมือ env ค้างแล้ว (ยืนยันใน PRD)

## Task 4 — Comments/docstrings + env examples รอบนอก

Backend comments:
- `core/security.py:113`, `core/cookie_auth.py:58`, `app/schemas/auth.py:34`,
  `app/services/auth_session_service.py:80-81`

Env examples (ลบบรรทัด `COOKIE_AUTH_MODE=...`):
- `backend/app/.env.example:14`, `backend/.env.production.example:9`,
  `backend/.env.development.example:5`

Frontend comment-only (ไม่มี behavior change — verified):
- `lib/websocket/client.ts:85-89`, `lib/websocket/types.ts:62-68`
- `app/admin/friends/page.tsx:3`, `app/admin/chat-histories/page.tsx:3`,
  `app/admin/chat-histories/[lineUserId]/page.tsx:3`

**ไม่แตะ:** alembic migration comments (historical)

## Task 5 — Tests (blast radius: 2 files)

### test_cookie_auth.py
| Test case | ตำแหน่ง | การกระทำ |
|---|---|---|
| case1 bearer-mode byte-compat | ~212-260 | **ลบทั้ง suite** |
| case2 dual-mode | ~263-320 | **ลบทั้ง suite** |
| case3 cookie-mode | ~326+ | **คงไว้** — ⚠️ ลบ `monkeypatch.setattr(...COOKIE_AUTH_MODE...)` (line ~329) ทิ้ง (monkeypatch raise AttributeError เมื่อ attr หาย) |
| case5 legacy-header refresh | ~477-496 | **ลบทั้ง test** (path ถูกลบจาก auth.py) |
| case8 migrate-session matrix | ~607-664 | rework: ลดเหลือ cookie-mode flow เดียว; **แก้ assertions 640-641** (`access_token`/`refresh_token` truthy → ต้อง expect empty string); ลบ monkeypatch |
| case9 ws-ticket | ~664-685 | rework: mint ผ่าน cookie + CSRF (ไม่ใช่ Bearer); ลบการอ่าน access_token จาก login body (~671) |
| CSRF-exemption-via-Bearer | ~540-556 | rework: ไม่มี bearer exemption แล้ว — POST cookie-based ขาด CSRF = 403 เสมอ |

- sweep ซ้ำ: `grep -n "COOKIE_AUTH_MODE\|monkeypatch" backend/tests/test_cookie_auth.py`
  จนไม่เหลือ reference ที่จะ AttributeError

### test_config_migration_controls.py
- ลบ default assertion (21-22) + `test_cookie_auth_mode_accepts_documented_values` (25-29)
- unknown-value rejection (40): เหลือเฉพาะ LIFF_STRICT_MODE case

## Task 6 — Docs

- `docs/remediation/cookie-auth-rollout-runbook.md`: banner "COMPLETED & CLEANED UP" +
  evidence 2026-08-22 + rollback = redeploy previous image
- `docs/remediation/migration-controls.md`: control table row `COOKIE_AUTH_MODE` → removed
- `PROJECT_STATUS.md`: Backlog item → done (ตอนปิด PR)

## Validation gates (รันหลังแต่ละ task)

```bash
cd backend && python -m pytest                     # full suite green
cd frontend && npm run lint && npm run test:unit && npm run build
grep -rn "COOKIE_AUTH_MODE" backend/app --include="*.py"          # = 0 (Task 3+)
grep -rn "COOKIE_AUTH_MODE" backend/.env.*.example backend/app/.env.example  # = 0 (Task 4+)
```

## PR flow (per git_workflow)

1. Push branch → PR (title: `refactor(auth): remove COOKIE_AUTH_MODE flag — cookie-only`)
2. Two-axis review (Standards + Spec sub-agents) แก้ findings
3. Merge squash → CI/CD deploy → post-deploy prod smoke:
   login → admin GET cookie-only 200 · ws-ticket no-CSRF=403 / with-CSRF=200 · health green
4. ปิด Backlog item + handoff checkpoint
