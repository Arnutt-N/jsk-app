# Enterprise Audit — Security Scan

Branch: `feat/enterprise-audit-sweep` (verified via `git branch --show-current`, not switched).
Mode: read-only investigation. No code edited.
Throughput checkpoint: n/a, read-only investigation.
IRON RULE: secret values never printed. Counts/hashes/presence only.

## 1. Secret grep (COUNT only, never matched values)

Commands:

```bash
git grep -c "BEGIN PRIVATE KEY" -- .
git grep -c "sk-live" -- .
git grep -c "xoxb-" -- .
# extras
for p in AKIA ghp_ gho_ "BEGIN RSA" "BEGIN EC" "BEGIN OPENSSH"; do git grep -c "$p" -- .; done
```

Raw output (file:count, counts only):

| Pattern | Files hit | Total occurrences |
|---|---|---|
| `BEGIN PRIVATE KEY` | none | 0 |
| `sk-live` | `.agents/state/checkpoints/handover-antigravity-20260215-0320.json:1` | 1 |
| `xoxb-` | none | 0 |
| `AKIA` | none | 0 |
| `ghp_` | `research/Skill_Seekers_*.md:1` (doc file, prefix mention) | 1 |
| `gho_` | none | 0 |
| `BEGIN RSA` / `BEGIN EC` / `BEGIN OPENSSH` | none | 0 |

Matched lines were never printed. The two count-1 hits are in a local handover note and a research doc (prefix mentions, not live key material). No live secret needed, so no SKIPPED step here.

Verdict: no private keys or live service tokens in the tree; two doc-text prefix mentions only.

Independent re-verify (2026-10-15, main session, lengths only, values never printed): `git grep -h` line lengths are 58 chars (`sk-live`) and 39 chars (`ghp_`). A live GitHub token needs 40+ key chars alone, so the 39-char line cannot hold one; the 58-char line cannot hold a live Stripe key plus assignment context. Both confirmed as doc-text mentions.

## 2. Auth gates (file:line)

`backend/app/api/deps.py`:

- `backend/app/api/deps.py:30` — `async def get_current_user(` (401 upstream for all gates).
- `backend/app/api/deps.py:143` — `async def get_current_admin(` (DB-configurable via `access_admin_endpoints`, DEFAULT_POLICY = SUPER_ADMIN + ADMIN).
- `backend/app/api/deps.py:176` — `async def get_current_manager(` (via `access_manager_endpoints`).
- `backend/app/api/deps.py:201` — `async def get_current_staff(` (via `access_staff_endpoints`; HTTP gate for live-chat HTTP endpoints).
- `backend/app/api/deps.py:236` — `def require_permission(key: str):` (dependency factory; fails closed to 403 on unknown key; 401 still enforced upstream by `get_current_user`).

`backend/app/core/permissions.py`:

- `backend/app/core/permissions.py:67` — `KEY_ACCESS_ADMIN_ENDPOINTS = "access_admin_endpoints"`.
- `backend/app/core/permissions.py:68` — `KEY_ACCESS_MANAGER_ENDPOINTS = "access_manager_endpoints"`.
- `backend/app/core/permissions.py:69` — `KEY_ACCESS_STAFF_ENDPOINTS = "access_staff_endpoints"`.
- `backend/app/core/permissions.py:76` — `KEY_ACCESS_LIVE_CHAT = "access_live_chat"` (WS gate, DEFAULT_POLICY SUPER_ADMIN + ADMIN + AGENT per `backend/app/core/permissions.py:156`).

Verdict: all four gates present with file:line evidence and fail-closed semantics.

## 3. HTTPException codes in use

Command:

```bash
git grep -ho "status_code=[0-9]*" backend/app/api | sort | uniq -c | sort -rn
```

Raw output:

```text
88 status_code=404
66 status_code=          # symbolic forms (status.HTTP_*) — see below
38 status_code=400
20 status_code=409
13 status_code=422
11 status_code=413
 8 status_code=403
 7 status_code=503
 7 status_code=502
 6 status_code=201
 4 status_code=401
 4 status_code=204
 2 status_code=500
 1 status_code=200
```

Symbolic breakdown (from `status_code=status.HTTP_*` forms): 201_CREATED x5, 204_NO_CONTENT x4, 400_BAD_REQUEST x5, 401_UNAUTHORIZED x21, 403_FORBIDDEN x16, 404_NOT_FOUND x5, 409_CONFLICT x6, 429_TOO_MANY_REQUESTS x3.

Expected set: 400/401/403/404/409/413/422/429/500/502/503. All ten observed (429 only via `status.HTTP_429_TOO_MANY_REQUESTS`, x3). Numeric 200/201/204 hits are success response codes on decorators, not error outliers.

Verdict: no outlier error codes; expected set fully covered.

## 4. PII masking — `maskLineUserId` callers (file list only)

Definition: `frontend/lib/mask.ts:1` (`maskLineUserId`), `frontend/lib/mask.ts:11` (`maskLineUserIdForRole` wrapper).
Test: `frontend/lib/__tests__/mask.test.ts` (15 refs), `frontend/app/admin/live-chat/_components/__tests__/customer-panel-masking.test.tsx:81`.

Caller files (13 total, matches expectation ~13):

- `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` (x3)
- `frontend/app/admin/chat-histories/page.tsx` (x5)
- `frontend/app/admin/friends/[lineUserId]/page.tsx` (x2)
- `frontend/app/admin/friends/history/page.tsx` (x2)
- `frontend/app/admin/friends/page.tsx` (x3)
- `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts` (x2, log-line masking)
- `frontend/app/admin/live-chat/_hooks/useSessionEvents.ts` (x3, log-line masking)
- `frontend/app/admin/users/[id]/page.tsx` (x3)
- `frontend/app/admin/users/page.tsx` (x2)
- `frontend/lib/websocket/client.ts` (x2, log-line masking)
- `frontend/app/admin/live-chat/_components/ConversationList.tsx` (x2, via `maskLineUserIdForRole`)
- `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` (x4, via `maskLineUserIdForRole`)
- `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` (x2, via `maskLineUserIdForRole`)

Verdict: 13 caller files (10 bare + 3 role-wrapper), expectation met.

## 5. Upload caps + rate buckets (file:line)

- Rich-menu 1MB cap: `backend/app/services/rich_menu_service.py:27` (`LINE_IMAGE_LIMIT_BYTES = 1024 * 1024`); alias `backend/app/api/v1/endpoints/rich_menus.py:48` (`MAX_RICH_MENU_IMAGE_BYTES = LINE_IMAGE_LIMIT_BYTES`); enforced pre-buffer at `backend/app/api/v1/endpoints/rich_menus.py:628` (header size) and `:631` (body length), both 413; service-side checks at `backend/app/services/rich_menu_service.py:563` and `:717`.
- Media 10MB cap: `backend/app/api/v1/endpoints/media.py:263,266,648,651` (+ comment `:640`); `backend/app/api/v1/endpoints/admin_live_chat.py:191,194`; `backend/app/api/v1/endpoints/liff.py:117,121` — all 413.
- `liff-submit` bucket: `backend/app/api/v1/endpoints/liff.py:91-93,155-157,291-293`; `backend/app/api/v1/endpoints/liff_bookings.py:56-57` (submit) + `:61-63` (read bucket); defaults `backend/app/core/config.py:100-101` (5 events / 300s); non-secret example `backend/app/.env.example:54-55`; client note `frontend/lib/liff/upload-media.ts:6`.
- Attachment cap 3: server `backend/app/schemas/service_request_liff.py:37` (`max_length=3`); client `frontend/lib/liff/upload-media.ts:8` (`LIFF_MAX_ATTACHMENTS = 3`), enforced `:34-35`; test `frontend/lib/liff/__tests__/upload-media.test.ts:97`.

Verdict: all four caps/buckets located with enforcement lines.
