# PRP Plan: COOKIE_AUTH_MODE Cleanup (cookie-only)

> **Status: DRAFT (2026-08-22)** — รอ approval
> **PRD:** `.claude/PRPs/prds/cookie-auth-mode-cleanup.prd.md`
> **Branch:** `refactor/cookie-auth-mode-cleanup`
> **ค่าประมาณ:** ~6 tasks, test churn จำกัดที่ 2-3 files

## Task 0 — Branch

```bash
git checkout -b refactor/cookie-auth-mode-cleanup   # from latest main
```

## Task 1 — config.py: ลบ flag

- ลบ `COOKIE_AUTH_MODE: Literal["bearer", "dual", "cookie"] = "cookie"` + comment block
  (`config.py:48-53`) — เว้น comment สั้น ๆ บอกว่า cookie-only หลัง cleanup PR (อ้าง PRD)
- `extra="ignore"` รับมือ env ค้างแล้ว (ยืนยันใน PRD)

## Task 2 — deps.py: collapse get_current_user

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
- **Guard:** behavior ใน cookie mode ต้อง byte-equivalent — ไม่แตะ logic หลัง line 68,
  request.state.auth_token_source, CSRF compare_digest, role gates

## Task 3 — auth.py: collapse mode branches

- **login (186-215):** ลบ if/else → always `create_session_family` + `set_auth_cookies` +
  `body_access_token=""`; คง audit + response shape
- **refresh (218-355):** source = refresh cookie เท่านั้น (ลบ header fallback 228-235);
  `session_backed = bool(payload.get("jti"))` (source เป็น cookie เสมอ); ลบ guard 274
  (unauthorized ถ้าไม่ session-backed — โยน error เดิม); ลบ legacy stateless path 340-355;
  body always omit tokens (334-335)
- **logout:** comment "All modes" → ปรับ wording (behavior เดิม)
- **migrate-session (406-488):** ลบ bearer-mode 409 branch (451-455); `body_omitted=True`
  เสมอ; docstring ปรับ (416 ลบประโยค dual tolerance)
- **ws-ticket (491-519):** docstring 498-499 → "Cookie-authenticated via get_current_user"

## Task 4 — Comments/docstrings รอบนอก

- `core/security.py:113` — แก้ comment ที่อ้าง bearer-mode caller
- `core/cookie_auth.py:58` — docstring "`dual` or `cookie`" → cookie-only
- Frontend comment-only: `lib/websocket/client.ts:85-89`, `lib/websocket/types.ts:64`
  ("via Bearer <token>" → mint ด้วย cookie credentials ผ่าน global authFetch patch)

## Task 5 — Tests

- **test_config_migration_controls.py:** ลบ default assertion (21-22) +
  `test_cookie_auth_mode_accepts_documented_values` (25-29); unknown-value rejection test
  (40) เหลือเฉพาะ LIFF_STRICT_MODE case
- **test_cookie_auth.py:**
  - ลบ FR8 case1 bearer suite (~208-260) + case2 dual suite (~262-320); case3 cookie คงไว้
    (เปลี่ยนชื่อ prefix ถ้าจำเป็น)
  - Rework migrate-session tests (477-494): ลบ bearer/dual-mode assertions
  - Rework CSRF-exemption-via-Bearer tests (~540-556): ไม่มี bearer path แล้ว —
    state-changing ผ่าน cookie ต้องเรียกด้วย CSRF header เสมอ (assert 403 เมื่อขาด)
  - grep ซ้ำ `COOKIE_AUTH_MODE` ใน tests/ → เก็บกวาด stragglers
- **Straggler:** 1 test file ที่ใช้ `headers={"Authorization"` ตรง — แก้เป็น cookie flow
  หรือ override deps ตาม context ของ file นั้น

## Task 6 — Docs

- `docs/remediation/cookie-auth-rollout-runbook.md`: เพิ่ม banner "COMPLETED & CLEANED UP
  (PR <n>)" + บันทึก evidence 2026-08-22 + rollback = redeploy previous image
- `docs/remediation/migration-controls.md`: control table row `COOKIE_AUTH_MODE` → removed
- `PROJECT_STATUS.md`: Backlog item → done (ทำตอนปิด PR)

## Validation gates (ทุก task)

```bash
cd backend && python -m pytest                     # full suite green
cd frontend && npm run lint && npm run test:unit && npm run build
grep -rn "COOKIE_AUTH_MODE" backend/app --include="*.py"   # = 0 matches (Task 1+)
```

## PR flow (per git_workflow)

1. Push branch → PR (title: `refactor(auth): remove COOKIE_AUTH_MODE flag — cookie-only`)
2. Two-axis review (Standards + Spec sub-agents) แก้ findings
3. Merge squash → CI/CD deploy → post-deploy prod smoke:
   login → admin GET cookie-only 200 · ws-ticket no-CSRF=403 / with-CSRF=200 · health green
4. ปิด Backlog item + handoff checkpoint
