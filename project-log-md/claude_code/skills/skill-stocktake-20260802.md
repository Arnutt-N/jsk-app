# Skill Stocktake — 2026-08-02

**ขอบเขต:** Full Stocktake ทั้ง 282 skills
**วิธี:** `skill-stocktake` skill (Full mode) — 12 subagent ชุด อ่านไฟล์ `SKILL.md` จริงทุกไฟล์
**Cache:** `~/.claude/skills/skill-stocktake/results.json`

> **หมายเหตุสำคัญ:** สคริปต์ของ `skill-stocktake` (`scan.sh`, `quick-diff.sh`, `save-results.sh`)
> **รันไม่ได้บนเครื่องนี้** เพราะต้องใช้ `jq` ซึ่งไม่มีทั้งใน Git Bash และ WSL —
> inventory และ `results.json` รอบนี้จึงทำด้วยมือ ต้องแก้ก่อนถึงจะใช้ Quick Scan ครั้งหน้าได้

---

## 1. ขอบเขตที่สแกน

```
✓ ~/.claude/skills/                    243 skills (global — ทุกโปรเจกต์)
✓ D:\genAI\jsk-app\.claude\skills\      39 skills (project — เฉพาะ repo นี้)
                                       ─────────
                                       282 skills
```

ไม่นับ 2 โฟลเดอร์ที่ไม่มี `SKILL.md`: `ai-pitch-blueprint-video-presentation-workspace`, `learned`

## 2. ผลรวม

| Verdict | Global | Project | รวม |
|---|---:|---:|---:|
| Keep | 205 | 14 | **219** |
| Improve | 18 | 8 | **26** |
| Update | 3 | 17 | **20** |
| Retire | 7 | 0 | **7** |
| Merge | 10 | 0 | **10** |
| **รวม** | **243** | **39** | **282** |

`MEMORY.md` = 28 บรรทัด (เกณฑ์ 100) — ไม่ต้องบีบอัด ✓

---

## 3. ⚠️ ปัญหาหลัก: skn-* 17 จาก 39 ตัวบอกข้อมูลผิด (44%)

Subagent ถูกสั่งให้ **ตรวจทุกคำกล่าวอ้างกับซอร์สโค้ดจริง** ไม่ใช่แค่อ่าน skill

### รูปแบบความผิดพลาด

skill เขียน **"GAP: ยังไม่ได้ทำ X"** ไว้ตอนสร้าง → ต่อมามีคน fix แล้ว → **skill ไม่เคยถูกอัปเดต**

อันตรายกว่าข้อมูลคลุมเครือ เพราะ agent ที่เชื่อ skill จะไป "แก้" สิ่งที่แก้ไปแล้ว หรือย้อนไปใช้
รูปแบบที่โปรเจกต์เลิกใช้แล้ว — บั๊กแบบเดียวกับที่ `skn-rich-menu-builder` เคยทำไว้
(อ้างว่า rich-menu endpoints "ไม่มี auth" ทั้งที่มี — ถูกแก้ไปแล้วเมื่อ 2026-06-20)

### 3.1 คำกล่าวอ้างเท็จเรื่อง auth — เสี่ยงด้านความปลอดภัย

| Skill | อ้างว่า | ความจริงในโค้ด |
|---|---|---|
| `skn-liff-data` | rule #1: `liff.py` + `locations.py` + `media.py` **ไม่มี auth ทั้งหมด** | `media.py` มี auth ~13 route (`:135,171,210,243,253,283,305,319,344,366,391,428,456`) ใช้ `get_current_admin` / `require_permission(KEY_MANAGE_FILES)` — มีแค่ `liff.py`/`locations.py` ที่ไม่มีจริง |
| `skn-operator-tools` | GAP-3 (`:67-69,370-373`): `admin_friends.py` ใช้แค่ `Depends(deps.get_db)` ทุก route ไม่มี auth | ทั้ง 4 route มี `current_admin: User = Depends(get_current_admin)` (`admin_friends.py:27,69,92,102`) |
| `skn-reply-auto` | rule 6 / step 1-2 (`:74-75,112,182`): `admin_reply_objects.py` + `admin_auto_replies.py` **ไม่มี auth** | ทั้งคู่ใช้ `get_current_admin` (GET) + `require_permission` (write) — `admin_reply_objects.py:29,55,71,101,127`, `admin_auto_replies.py:28,45,61,89,117` |

### 3.2 "GAP" ที่ปิดไปแล้วแต่ skill ยังบอกว่าเปิดอยู่

| Skill | อ้างว่า | ความจริง |
|---|---|---|
| `skn-backend-infra` | `admin_friends.py` **ไม่ได้ register** ใน `api.py` → `/admin/friends` คืน 404 | register แล้ว — `api.py:27` (import), `api.py:54` (include prefix `/admin/friends`) |
| `skn-settings-config` | GAP-1 (headline ทั้ง skill): `admin_credentials.py` **ไม่ได้ register** → 404 ทุก route | register แล้ว — `api.py:26`, `api.py:53` prefix `/admin/credentials` |
| `skn-user-management` | GAP-1 (`:403-407`): ไม่มี endpoint CRUD ผู้ใช้ ให้ insert ผ่าน DB script แทน | มีครบ — `admin_users.py` POST `""`(:320), PUT(:385), DELETE(:497), reset-password(:557) ทั้งหมดหลัง `require_permission(KEY_MANAGE_USERS)` |
| `skn-service-request` | GAP-1 (ซ้ำใน rule #11, step 2, step 9, common issues): ฟิลด์ `agency/prefix/email/province/district/sub_district/topic_subcategory` **ไม่อยู่ใน schema และไม่ถูกบันทึก** | อยู่ครบ — `schemas/service_request_liff.py:10-37` + `models/service_request.py:54-66` |
| `skn-core-runtime` | rule #6: handoff keywords hardcode ในหน่วยความจำ `get_configurable_keywords()` มี TODO ให้ไปทำต่อ | ทำแล้ว — `handoff_service.py:155-158` อ่านจาก `SettingsService` แล้ว merge (เรียกที่ `:108`) |
| `skn-analytics-audit` | GAP-2: audit log enrichment เป็น N+1 ให้แก้เป็น LEFT JOIN | แก้แล้ว — `admin_audit.py:64-69` batch เป็น query เดียว มีคอมเมนต์ `avoids N+1 per log row` |
| `skn-admin-requests` | rule #6-7: `user_id` เป็น query param + ยังไม่มี auth context (GAP-2) | เปลี่ยนแล้ว — comments endpoints ไม่มี `user_id` query param และใช้ `Depends(get_current_manager)` (`admin_requests.py:568-608`) |

### 3.3 สถาปัตยกรรม / ข้อเท็จจริงเปลี่ยนไปแล้ว

| Skill | ปัญหา |
|---|---|
| `skn-webhook-handler` | Architecture Overview + Core Files (`:62-135`) บอกว่า special command / intent matching / media อยู่ใน `webhook.py` — จริงๆ `webhook.py` เหลือ 124 บรรทัดเป็น dispatch shell (`handle_message_event` เขียนว่า *"Thin wrapper — real logic in message_intake.message_handler"* `:106-108`) logic ย้ายไป `services/message_intake/{message_handler,commands,intent_matching,postback_handler}.py` → **step 2, 3, 6 ชี้ไฟล์ผิดทั้งหมด** |
| `skn-devtools` | อ้าง "30+ standalone scripts ที่ backend root" (`create_admin.py`, `debug_routes.py`, `debug_token.py`, `list_routes.py`, `find_users.py`, `manage_rich_menu.py`) — **ไม่มีสักไฟล์** (มีแค่ `run.py`) ของจริงอยู่ที่ `backend/scripts/` (`seed_admin.py`, `db_target.py`) ตามที่ CLAUDE.md ระบุ + อ้าง 17 test files จริงมี 78 |
| `skn-data-models` | อ้าง "18 models" จริง `models/__init__.py` import **29** — ขาด `Broadcast`, `PermissionSetting`, `RichMenuAlias`, `UserRichMenuLink`, `AuthSession`, `WsTicket`, `OperatorConversationPreference` ในตารางของ skill ที่อ้างว่าเป็น "complete reference" |
| `skn-api-patterns` | เอกสาร auth surface มีแค่ `get_current_user` / `get_current_admin` — ปัจจุบัน `require_permission(KEY)` ใช้ **73 จุดใน 14 ไฟล์** + `get_current_manager` ไม่ถูกกล่าวถึงเลย |
| `skn-auth-security` | step 9 เรียก `syncAdminAuthToken(token)` จาก `frontend/lib/authFetch.ts` — **ฟังก์ชันนี้ไม่มีอยู่** (ไฟล์ export แค่ `setAuthRefreshHandler`, `installAdminAuthFetchInterceptor`) + ขาด `require_permission`/`get_current_manager` เช่นกัน |
| `skn-analytics-frontend` | rule #2 โชว์โค้ด `authHeaders` useMemo + `Authorization: Bearer` และบังคับใน checklist — **ไม่มีอยู่จริง** `analytics/page.tsx` `fetchData` (`:125-161`) เรียก `fetch()` เปล่าๆ ไม่มี headers |
| `tailwind-design-system` | สอน Tailwind **v3** (`@tailwind base/components/utilities` + `tailwind.config.ts` `darkMode:'class'`) — repo ใช้ **v4** (`package.json: "tailwindcss": "^4"`, `globals.css:1,6` = `@import "tailwindcss"` + `@theme{}`) ทำตามแล้วได้ config ที่ขัดกัน + ซ้ำกับ `skn-ui-library` ที่ข้อมูลถูกต้อง |

### 3.4 Improve (ถูกต้องแต่ต้องปรับ)

| Skill | สิ่งที่ต้องแก้ |
|---|---|
| `skn-app-shell` | step 2 สอนใส่ `Authorization: Bearer` เอง แต่ `skn-auth-security` บอกว่าเลิกใช้แล้ว เปลี่ยนเป็น global fetch interceptor (`lib/authFetch.ts` → `contexts/AuthContext.tsx:5,124`) — 2 skill ขัดกันเอง |
| `skn-fastapi-endpoint` | workflow register router ถูกต้อง แต่ auth guidance บอกแค่ `get_current_admin` ควรชี้ไป `require_permission` (73 ครั้ง vs 55) |
| `skn-rich-menu-builder` | เนื้อหา rule #10 ถูกแล้ว แต่ **เลขบรรทัดที่อ้างเพี้ยนรอบสอง** — อ้าง 43/48/181, 56/83/111/145/189/205 ของจริงคือ 63,91,100,133,164,265,290,312,338,368,387,437,465,488,496,528,556,595,632,640,658 |
| `skn-migration-helper` | step 1 (`:92-104`) สอน activate `venv/Scripts/activate` / `venv/bin/activate` ไม่พูดถึง **`venv_linux`** ที่โปรเจกต์ใช้จริง (backend/ มี venv, venv_linux, venv_test, venv_win — เลือกผิดได้ง่าย) |
| `skn-webhook-debugger` | ตาราง log (step 7) ขาด dedup path ใหม่ `{cache_key}:lock` + `set(nx=True)` และ DEBUG ของ intent matching ย้ายไป `message_intake/*` แล้ว |
| `skn-chatbot-frontend` ↔ `skn-intent-manager` | step 6-7 ของ `skn-intent-manager` ซ้ำขอบเขต frontend ที่ `skn-chatbot-frontend` ประกาศเป็นเจ้าของ → 2 แหล่งความจริงสำหรับ UI เดียวกัน |
| `frontend-design` (project) | เนื้อหาถูก แต่ผลักดัน "bold aesthetic" ฟอนต์/สีใหม่ โดยไม่รู้จัก governance ของ `skn-design-system` (ห้ามแตะ Button/Card/Badge/Modal, sidebar gradient ตายตัว, ใช้ semantic token เท่านั้น) |

### 3.5 skn-* ที่ตรวจแล้วถูกต้อง (Keep, 14 ตัว)

`skn-admin-component`, `skn-admin-overview`, `skn-design-system`, `skn-design-tokens-package`,
`skn-liff-form`, `skn-line-flex-builder`, `skn-line-service-ops`, `skn-live-chat-frontend`,
`skn-live-chat-ops`, `skn-performance-audit`, `skn-rich-menu-frontend`, `skn-ui-library`,
`responsive-design`, `senior-frontend`

ตัวอย่างที่ตรวจผ่าน: `skn-live-chat-ops` — โครง package `live_chat_service/{handoff,sessions,messaging,conversations,unread,analytics}.py` ตรงกับของจริงทุกไฟล์

---

## 4. ปัญหาฝั่ง global (243 ตัว)

### 4.1 Model ID ล้าสมัย (Update — 4 ตัว)

| Skill | อ้างรุ่นที่ไม่มีแล้ว |
|---|---|
| `claude-api` | `claude-opus-4-1`, `claude-sonnet-4-0`, `claude-3-5-haiku-latest` (`:23-27` และซ้ำทุก sample ถึง `:335`) + ชื่อชนกับ plugin `claude-api:claude-api` |
| `cost-aware-llm-pipeline` | `claude-sonnet-4-6`, "Opus 4.5" ในตาราง routing/pricing (`:25-27,154-160`) |
| `prompt-optimizer` | "Sonnet 4.6", "Opus 4.6" (Phase 5 `:179-184`, example 3 `:383`) |
| `security-scan` | หัวข้อ "Opus 4.6 Deep Analysis" (`:90-98`) |

รุ่นปัจจุบัน: `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`, `claude-haiku-4-5-20251001`

### 4.2 Retire (7 ตัว)

| Skill | บรรทัด | เหตุผล |
|---|---:|---|
| `energy-procurement` | 228 | โดเมนซื้อขายพลังงาน C&I — ไม่ใช่สายงานผู้ใช้ |
| `carrier-relationship-management` | 212 | โดเมนขนส่ง/freight carrier — ไม่ใช่สายงานผู้ใช้ |
| `project-guidelines-example` | 349 | เป็น template ของแอปตัวอย่าง "Zenith" + model ID เก่า `claude-sonnet-4-5-20250514` (`:166`) เนื้อหาซ้ำ backend-patterns/frontend-patterns/coding-standards |
| `design-taste-frontend-v1` | 226 | description ระบุเองว่าเป็น legacy fork ของ `design-taste-frontend` |
| `ecc-tools-cost-audit` | 160 | ผูกกับ "sibling ECC-Tools repo" ที่ผู้ใช้ไม่มี |
| `enterprise-agent-ops` | 50 | bullet ลอยๆ ไม่มีคำสั่ง/threshold/ตัวอย่าง ซ้ำกับ autonomous-loops |
| `implement` | 15 | ทวน `rules/common/development-workflow.md` แบบคำต่อคำ |

### 4.3 Merge (10 ตัว)

| Skill | → รวมเข้ากับ | หมายเหตุ |
|---|---|---|
| `autonomous-loops` (610) ↔ `continuous-agent-loop` (45) | เลือก 1 | **deprecation วนกันเอง** — ตัวใหญ่บอกว่าถูกแทนที่ ตัวเล็กบอกว่าตัวเองใหม่กว่าแต่ route ไปหา skill ที่ไม่มีอยู่ 4 ชื่อ |
| `continuous-learning` | `continuous-learning-v2` | 2 ระบบ hook แข่งกันเขียนคนละที่ |
| `tdd-workflow` (463) | `tdd` (111) | เก็บเฉพาะ git checkpoint protocol (`:50-164`) |
| `gpt-taste` | `high-end-visual-design` | ซ้ำเชิงโครงสร้าง 1:1 เก็บ GSAP ScrollTrigger (`:46-52`) |
| `frontend-design` (global) | `design-taste-frontend` | **ชื่อชนกัน 4 ที่**: global + project + 2 plugins |
| `karpathy-guidelines` | plugin ตัวเดียวกัน | ติดตั้งซ้ำ |
| `edit-article` (15) | `article-writing` | |
| `iterate` | `agent-workflow` | เป็นส่วนขยายของ reference ในตัวนั้นอยู่แล้ว |
| `ralphinho-rfc-pipeline` | `blueprint` | ตื้นกว่า และ `prompt-optimizer` ก็ route ไป blueprint อยู่แล้ว |

### 4.4 Improve เด่นๆ ฝั่ง global

- `agent-workflow` — เหลือ placeholder `{{available_commands}}` ที่ไม่ถูกแทนค่า (`:225`)
- `frontend-patterns` — สอน `useMemo`/`useCallback`/`memo` แบบไม่มีเงื่อนไข ซึ่ง**ขัดกับ React Compiler ที่ JskApp เปิดใช้อยู่** + ขาด React 19 (Actions, `useActionState`, `useOptimistic`, `use()`)
- `council`, `hipaa-compliance` — อ้างอิง skill ที่ไม่มีอยู่จริง (dead cross-reference)
- `deep-research` — บังคับใช้ firecrawl/exa MCP โดยไม่มี fallback ไป WebSearch/WebFetch
- `capture` vs `save-session`/`resume-session` — 2 ระบบ session ที่เก็บคนละที่ ไม่คุยกัน
- `coding-standards`, `backend-patterns`, `security-review`, `springboot-security`, `springboot-verification`, `agentic-engineering`/`ai-first-engineering` — ซ้ำกับ rules ที่โหลดอยู่แล้วหรือซ้ำกันเอง

---

## 5. ลำดับที่แนะนำ

1. **แก้ 17 skn-* ที่ข้อมูลผิด** — กระทบงานประจำวันโดยตรง ให้ตรวจกับโค้ดจริงทีละข้อ
   เริ่มจาก 3 ตัวที่อ้างเรื่อง auth ผิด (`skn-liff-data`, `skn-operator-tools`, `skn-reply-auto`)
   เพราะเป็นความเสี่ยงด้านความปลอดภัย
2. **ซ่อม `skill-stocktake` เอง** — ทำให้ไม่ต้องพึ่ง `jq` ไม่งั้น Quick Scan ครั้งหน้ารันไม่ได้
3. **แก้ model ID 4 ตัว** — งานเล็ก
4. **Retire 7 + Merge 10** — คืนพื้นที่ context

> ยังไม่มีการลบหรือแก้ไฟล์ skill ใดๆ — `skill-stocktake` กำหนดให้ขอคำยืนยันก่อนทุกครั้ง

## 6. งานที่ควรทำเพื่อกันปัญหาซ้ำ

ปัญหา skn-* ล้าสมัยจะกลับมาอีกแน่นอน เพราะไม่มีอะไรผูก skill กับโค้ด ทางเลือก:

- ให้ทุก "GAP"/"ยังไม่ได้ทำ" ใน skn-* ต้องมีวันที่กำกับ + ตรวจซ้ำเมื่อเกิน N วัน
- เลิกเขียนเลขบรรทัดในเอกสาร (เพี้ยนมาแล้ว 2 รอบใน `skn-rich-menu-builder`) ใช้ชื่อฟังก์ชัน/สัญลักษณ์แทน
- รัน Quick Scan หลัง PR ใหญ่ที่แตะ backend endpoints หรือย้ายไฟล์
