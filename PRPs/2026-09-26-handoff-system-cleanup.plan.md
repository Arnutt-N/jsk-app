# Plan: Handoff System Cleanup — 2026-09-26

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เก็บกวาดระบบ handoff ให้เหลือระบบเดียว อ่านแล้วเจอเรื่องล่าสุดเสมอ

**Architecture:** แก้เฉพาะเอกสาร + สคริปต์ handoff บน branch `feat/handoff-system-cleanup-20260926` แบ่ง 5 งานย่อย (archive, docs, state, scripts, verify) แต่ละงานตรวจเองได้ แล้วจบด้วย handoff + PR — ไม่แตะโค้ดแอปจริง ไม่เปลี่ยน checkpoint schema v2

**Tech Stack:** Markdown docs, Node.js (handoff-new.cjs / gen-handoff-views.cjs), Python (validate_handoff_state.py), git CLI, `py` launcher บน Windows

**Revised:** 2026-09-26 rev 2 — หลัง dual review (NOT READY 8/10): เติม AC-1.2 step, รัน test-handoff-system.sh, validator gate ก่อนทุก commit, staging รายไฟล์, rollback, แก้ CANON claim

## Global Constraints

- อยู่บน branch `feat/handoff-system-cleanup-20260926` ตลอดงานนี้ ห้ามแตะ `main` โดยตรง
- ไม่เปลี่ยน checkpoint schema v2 (`handoff_version`, required keys คงเดิม)
- ไม่ย้าย path ไฟล์ที่ใช้อยู่ — ย้ายเฉพาะไฟล์เก่าที่เลิกใช้แล้ว พร้อม redirect stub
- ทุกไฟล์ที่แก้ต้องรัน `py .agents/scripts/validate_handoff_state.py` แล้วได้ PASS ก่อน commit
- สื่อสารกับผู้ใช้เป็นภาษาไทยแบบง่าย งานเอกสารเป็นภาษาอังกฤษตามกฎรีโพ
- Shell: คำสั่ง git/gh/py/node รันใน PowerShell ได้เลย (fences ข้างล่างเขียน `powershell`); สคริปต์ `.sh` (test-handoff-system.sh) เป็น bash — รันผ่าน Git-Bash/WSL ด้วยคำสั่ง `bash` เท่านั้น ห้ามรันตรงใน PowerShell
- Rollback: ถ้าผิดพลาด revert ทีละ commit บน branch นี้ (`git revert <sha>`) — ยังไม่ merge เข้า main จนกว่าผู้ใช้อนุมัติ

---

### Task 1: Archive stale `.agents/handoff.md`

**Files:**
- Modify: `.agents/handoff.md` (replace with redirect stub)
- Create: `project-log-md/archive/2026-07-28-handoff-pr165.md` (archived copy, content unchanged)

**Interfaces:**
- Consumes: current `.agents/handoff.md` content (133 lines, PR #165 era)
- Produces: stub file pointing to checkpoint JSON + TASK_LOG.md + latest session-summary

- [ ] **Step 1: ค้นที่อ้างถึงไฟล์เก่าก่อนย้าย**

Run: `Get-ChildItem -Recurse -Filter *.md | Select-String -Pattern "\.agents/handoff\.md" | Select-Object Path, LineNumber`
Expected: ได้รายชื่อไฟล์ที่ลิงก์มาหา `.agents/handoff.md` (รวมโฟลเดอร์ย่อยเช่น `.agents/workflows/`) — จดไว้เพื่อซ่อมลิงก์ใน Task 2

- [ ] **Step 2: คัดลอกไฟล์เก่าไป archive แบบไม่เปลี่ยนเนื้อหา**

Run: `New-Item -ItemType Directory project-log-md/archive -ErrorAction SilentlyContinue; Copy-Item .agents/handoff.md project-log-md/archive/2026-07-28-handoff-pr165.md`
Expected: ไฟล์ archive เกิดใหม่ เนื้อหาเหมือนเดิมทุกตัวอักษร

- [ ] **Step 3: แทนที่ไฟล์เดิมด้วย redirect stub**

Replace entire `.agents/handoff.md` with:

```markdown
# Handoff — MOVED (this file is retired)

> **ไฟล์นี้เลิกใช้แล้ว (retired 2026-09-26)** — เนื้อหาเก่า (PR #165, ก.ค. 2026)
> ย้ายไป `project-log-md/archive/2026-07-28-handoff-pr165.md`
>
> **ระบบปัจจุบัน:** ต้นฉบับจริงคือ `.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json`
> - อ่านเรื่องล่าสุด: `.agents/state/TASK_LOG.md` (3 รายการบนสุด) + `project-log-md/<platform>/session-summary-*.md` ล่าสุด
> - ส่งงานต่อ: `node .agents/scripts/handoff-new.cjs <platform> "<summary>" ["<next step>" ...]`
> - คู่มือ: `.agents/workflows/handoff-to-any.md` (ส่งงาน) / `pickup-from-any.md` (รับงาน)
```

- [ ] **Step 4: ตรวจว่า stub ถูกต้อง**

Run: `Get-Content .agents/handoff.md | Select-Object -First 3; git status --short; py .agents/scripts/validate_handoff_state.py`
Expected: 3 บรรทัดแรกเป็นหัว MOVED; git แสดง modified 1 + untracked 1; validator `RESULT: PASS` (Task นี้ยังไม่มี W1 — W1 มาพร้อม Task 4)

- [ ] **Step 5: Commit**

```powershell
git add .agents/handoff.md project-log-md/archive/2026-07-28-handoff-pr165.md
git commit -m "docs(handoff): retire stale .agents/handoff.md to archive with redirect stub"
```

---

### Task 2: Fix workflow doc contradictions

**Files:**
- Modify: `.agents/QUICK_START_CARD.md` (ENDING WORK section + platform codes)
- Modify: `.agents/workflows/pickup-from-any.md` (pickup checklist + quick stats + task numbering)
- Modify: `.agents/workflows/start-here.md` (one-line summary + step 13 + master checklist + ultra-compact)
- Modify: `AGENT_PROMPT_TEMPLATE.md` (handoff paths + PROJECT_ROOT + 5-artifacts + version)

**Interfaces:**
- Consumes: Task 1 stub path (for links pointing at the new system)
- Produces: 4 docs with zero contradictions; stale-pattern grep = 0 hits

- [ ] **Step 1: แก้ QUICK_START_CARD.md — ตอนจบงาน**

Replace in `## ENDING WORK` the `**1. UPDATE (5 files)**` block: delete the line `` `.agents/state/TASK_LOG.md` ← **APPEND your task entry** `` and replace with `Run handoff command (writes checkpoint + regenerates TASK_LOG.md/SESSION_INDEX.md automatically)`. Keep PROJECT_STATUS + current-session + task.md lines.

Also fix `## PLATFORM CODES` table: change codes to canonical `lowercase_underscore` (`claude_code`, `kimi_code`, `codex`, `antigravity`, `gemini_cli`, `cline`, `kilo_code`, `open_code`, `qwen`, `qoder`, `zcode`) and add missing `zcode` row.

- [ ] **Step 2: แก้ pickup-from-any.md — checklist + ของเลิกใช้**

- Pickup Checklist: delete `- [ ] **New task entry created in TASK_LOG.md**` and `- [ ] **SESSION_INDEX.md updated with new entry**`; add `- [ ] Read TASK_LOG.md + SESSION_INDEX.md (generated — read-only, never hand-edit)`.
- Step 3 mismatch: delete `add a "State Sync Reconciliation" entry to TASK_LOG.md`; replace with `re-run gen-handoff-views.cjs after fixing the checkpoint JSON`.
- Delete entire `### Task Numbering` section (convention retired per Step 6 of same file).
- Quick Stats (exact replacements): `grep -c "^### Task #" .agents/state/TASK_LOG.md` → `grep -c "^### " .agents/state/TASK_LOG.md` (count entries); `grep "^\*\*Agent\*\*:" .agents/state/TASK_LOG.md | sort | uniq -c` → `grep "^### " .agents/state/TASK_LOG.md | awk -F'—' '{print $2}' | sort | uniq -c` (per-platform counts; headings are `### WHEN — platform — status`).
- Rule section: item 2 `New task entry is created in TASK_LOG.md` → `Latest checkpoint + TASK_LOG state is coherent`; item 4 `SESSION_INDEX.md is updated` → `SESSION_INDEX.md is read`.

- [ ] **Step 3: แก้ start-here.md — 4 จุด**

- One-Line Summary: delete `→ Create TASK_LOG.md entry`.
- Step 13 Handoff `**Create 5 mandatory artifacts**`: item 3 `TASK_LOG.md - APPEND your completed task entry` + manual SESSION_INDEX lines → `Checkpoint + summary via handoff-new.cjs (TASK_LOG.md + SESSION_INDEX.md regenerate automatically)`; fix the two `> **CRITICAL**: TASK_LOG.md is append-only...` notes → `> **CRITICAL**: TASK_LOG.md/SESSION_INDEX.md are GENERATED — never hand-edit`.
- Master Checklist: delete `Create entry in TASK_LOG.md` (At Start), `Update your TASK_LOG.md entry with progress` (During Work → replace with `Keep notes in task.md; the record is created at handoff`), `Update TASK_LOG.md entry to COMPLETED` + `Update SESSION_INDEX.md` (At End → replace with `Run handoff-new.cjs` + `Flesh out summary .md, commit, push`).
- Ultra-Compact: delete `# Create TASK_LOG.md entry`; `# Update TASK_LOG.md to COMPLETED` / `# Create 5 artifacts` → `# Handoff: handoff-new.cjs, flesh out summary, commit`.

- [ ] **Step 4: แก้ AGENT_PROMPT_TEMPLATE.md — 4 จุด**

- `Look in project-log-md/*/ for handover-* files` → `Look in .agents/state/checkpoints/ for handover-*.json + project-log-md/*/ for session-summary-*.md`.
- `PROJECT ROOT: D:/genAI/skn-app` → `PROJECT ROOT: D:/genAI/jsk-app`.
- `5 artifacts are MANDATORY` → `checkpoint JSON + session-summary via handoff-new.cjs (TASK_LOG/SESSION_INDEX regenerate automatically)`.
- `*Version: 1.0 | Last Updated: 2026-02-13*` → `*Version: 2.0 (checkpoint system) | Last Updated: 2026-09-26*`.
- Scenario 3 (lines ~111-130): read first — if it repeats manual 5-artifact steps, apply same replacement as Step 13 above.

- [ ] **Step 5: ตรวจว่าไม่มีคำสั่งขัดกันเหลือ + validator ผ่าน**

Run: `Select-String -Path .agents/QUICK_START_CARD.md,.agents/workflows/pickup-from-any.md,.agents/workflows/start-here.md,AGENT_PROMPT_TEMPLATE.md -Pattern "APPEND.*TASK_LOG|Create entry in.*TASK_LOG|Update your TASK_LOG|### Task #|skn-app|5 artifacts are MANDATORY"` (expect 0 hits; fix leftovers before committing), then `py .agents/scripts/validate_handoff_state.py` (expect `RESULT: PASS`).
Expected: 0 stale-pattern hits + validator PASS.

- [ ] **Step 6: ตรวจ AC-1.2 — ค้น handoff ต้องเจอระบบใหม่ก่อน**

Run: `Get-ChildItem -Recurse -Filter *.md | Select-String -Pattern "\bhandoff\b" | Select-Object Path, LineNumber | Select-Object -First 30`
Expected: ทุกคู่มือที่คนอ่านเจอ (START_HERE.md, .agents/INDEX.md, QUICK_START_CARD.md, workflows) ชี้ไประบบ checkpoint (`.agents/state/checkpoints/`, TASK_LOG.md, handoff-new.cjs) — ไม่มีไฟล์ไหน (ยกเว้น stub, archive, PRD/plan นี้ที่เป็นประวัติ) ชี้ไฟล์เก่า `.agents/handoff.md` ว่าเป็นของจริงปัจจุบัน ถ้าเจอให้แก้ลิงก์นั้นก่อน commit

- [ ] **Step 7: Commit**

```powershell
git add .agents/QUICK_START_CARD.md .agents/workflows/pickup-from-any.md .agents/workflows/start-here.md AGENT_PROMPT_TEMPLATE.md
git commit -m "docs(handoff): remove manual TASK_LOG/SESSION_INDEX instructions, fix stale paths and version"
```

---

### Task 3: Refresh stale state files

**Files:**
- Modify: `.agents/state/task.md` (current task = this cleanup)
- Modify: `.agents/PROJECT_STATUS.md` (Thai Summary → 24 Sep 2026 #232; keep curated history intact)
- Modify: `.agents/state/current-session.json` (cross_platform_context.summaries_read only)

**Interfaces:**
- Consumes: checkpoint `handover-cline-20260924-0653.json` (work_summary, priority_actions, cross_platform_read)
- Produces: task.md + PROJECT_STATUS + current-session coherent with 24 Sep state; validator PASS

- [ ] **Step 1: เขียน task.md ใหม่ให้ตรงงานปัจจุบัน**

Replace `## Current Task` block (Task ID, Started, Agent, Status, Overall Progress, Continues From) with:

```markdown
## Current Task

**Task ID**: `task-handoff-system-cleanup-20260926`

**Started**: 2026-09-26

**Agent**: Cline

**Status**: IN_PROGRESS

**Overall Progress:** 40% (PRD + plan written; archive + docs + scripts + verify pending)

**Continues From**: `handover-cline-20260924-0653`
```

Replace `## Objectives` checkboxes with:

```markdown
## Objectives

- [x] Write PRD + implementation plan (review before code)
- [ ] Archive stale `.agents/handoff.md` with redirect stub
- [ ] Fix workflow doc contradictions (QUICK_START, pickup, start-here, prompt template)
- [ ] Refresh PROJECT_STATUS Thai Summary to 24 Sep 2026 (#232)
- [ ] Extend platform CANON maps + harden validator warnings
- [ ] Verify: validator PASS + stale-pattern grep 0 hits + commit/push/PR
```

- [ ] **Step 2: อัปเดต PROJECT_STATUS.md — เฉพาะส่วน Thai Summary**

Prepend under `## Thai Summary` (keep old lines as history):

```markdown
**สถานะล่าสุด (2026-09-24)** — ตรวจหลังส่งขึ้นร้านจริงเสร็จ (commit `f54403b` #232): โค้ดตรงกับเซิร์ฟเวอร์, หลังบ้านแข็งแรงดี (database+redis ปกติ), หน้าลับล็อกถูกต้อง (401), หน้าร้านเปิดติด, บันทึกส่งของ CD `35861792160` เขียวครบ 6 งาน — ไม่ได้แก้โค้ด เหลือแค่ลองเล่นด้วยมือ + เก็บเอกสารให้ตรงกัน
>
> (แทนที่บรรทัดเก่า `**สถานะล่าสุด (2026-09-04 09:00)** ...` — ตัดบรรทัดเก่านั้นออก แล้วย้ายเนื้อหาเก่าทั้งก้อนลงใต้ `<!-- Previous project summary retained below for historical context. -->` ถ้ามี)
```

Do NOT touch the `> **Last Updated:**` line (handoff-new.cjs owns it). Do NOT delete curated history.

- [ ] **Step 3: ซ่อม current-session.json — เฉพาะ cross_platform_context**

Replace `cross_platform_context.summaries_read` array with the 3 files from checkpoint `cross_platform_read`: `claude_code/session-summary-20260923-2248.md`, `cline/session-summary-20260922-1700.md`, `codex/2026-09-22-feature-line-audit-fix-map-handoff.md`. Keep `key_insights` unchanged. Validate JSON parses.

- [ ] **Step 4: รัน validator**

Run: `py .agents/scripts/validate_handoff_state.py`
Expected: `RESULT: PASS` (warnings about `model`/`provider` optional keys are acceptable)

- [ ] **Step 5: Commit**

```powershell
git add .agents/state/task.md .agents/PROJECT_STATUS.md .agents/state/current-session.json
git commit -m "docs(handoff): refresh task.md, PROJECT_STATUS Thai summary, session context to 24 Sep 2026 state"
```

---

### Task 4: Extend platform maps + harden validator

**Files:**
- Modify: `.agents/scripts/handoff-new.cjs` (CANON + DISPLAY)
- Modify: `.agents/scripts/gen-handoff-views.cjs` (CANON)
- Modify: `.agents/scripts/validate_handoff_state.py` (3 new warnings)

**Verified current state (do not re-guess):** `handoff-new.cjs` CANON has 13 entries, no `zcode`, no dashed `kilo-code/open-code`, no bare `gemini`; DISPLAY has 9 entries, no `zcode`. `gen-handoff-views.cjs` CANON already has `gemini_cli, open_code` but lacks `qoder`, dashed variants, `zcode`. `test-handoff-system.sh` exists (7998 bytes, `#!/usr/bin/env bash`, sandbox-only — never touches real state).

**Interfaces:**
- Consumes: platform list from SESSION_INDEX (all dirs listed there, incl. zcode)
- Produces: scripts recognizing all platforms; validator emitting 3 new warnings (non-blocking); test script green

- [ ] **Step 1: เติม CANON + DISPLAY ใน handoff-new.cjs**

In `const CANON = {...}` add: `zcode: 'zcode'`, `'kilo-code': 'kilo_code'`, `gemini: 'gemini_cli'`, `'open-code': 'open_code'`. In `const DISPLAY = {...}` add `zcode: 'Zcode'` + verify every platform listed in SESSION_INDEX has a display name.

- [ ] **Step 2: เติม CANON ใน gen-handoff-views.cjs**

Add the missing entries to its `const CANON = {...}`: `qoder: 'qoder'`, dashed variants (`'kilo-code': 'kilo_code'`, `'open-code': 'open_code'`), `gemini: 'gemini_cli'`, `zcode: 'zcode'`. (`gemini_cli` and `open_code` underscored keys already exist — do not duplicate.)

- [ ] **Step 3: เพิ่ม 3 warnings ใน validate_handoff_state.py**

After the existing task_text/ps_text checks, add (warnings only, never errors). Note: `ho` is only defined inside the `if latest_handover:` block — put W3 inside that block or guard it:

```python
# W1: stale single-file handoff retired?
stub = REPO_ROOT / ".agents/handoff.md"
if stub.exists():
    text = stub.read_text(encoding="utf-8")
    if "MOVED" not in text and "retired" not in text:
        warnings.append(".agents/handoff.md still looks live — retired; only a redirect stub should remain.")

# W2: task.md freshness vs newest checkpoint (anchor to the Started: line, not any date in history)
if handover_ts:
    m = re.search(r"^\*\*Started\*\*:\s*(\d{4}-\d{2}-\d{2})", task_text, re.MULTILINE)
    if m:
        try:
            task_dt = datetime.strptime(m.group(1), "%Y-%m-%d")
            if (handover_ts.replace(tzinfo=None) - task_dt).days > 7:
                warnings.append(f"task.md date ({m.group(1)}) is >7 days older than newest checkpoint ({handover_ts.date()}).")
        except ValueError:
            pass
```

W3 goes inside the `if latest_handover:` block after required-key checks:

```python
# W3: session context matches checkpoint cross_platform_read?
ho_read = ho.get("cross_platform_read") if isinstance(ho, dict) else None
cs_read = (cs.get("cross_platform_context") or {}).get("summaries_read") if isinstance(cs, dict) else None
if isinstance(ho_read, list) and ho_read and isinstance(cs_read, list):
    if set(ho_read) != set(cs_read):
        warnings.append("current-session cross_platform_context.summaries_read differs from newest checkpoint cross_platform_read.")
```

- [ ] **Step 4: รัน validator + regen views + test script**

Run: `py .agents/scripts/validate_handoff_state.py` then `node .agents/scripts/gen-handoff-views.cjs` then `bash .agents/scripts/test-handoff-system.sh` (Git-Bash/WSL — the script is `#!/usr/bin/env bash` and self-sandboxes; it never touches real handoff state).
Expected: validator `RESULT: PASS`; gen-views prints counts; test script exit 0 (all PASS, 0 FAIL); `git status --short` shows only intended script edits (views regen should be no-op if checkpoints unchanged — if TASK_LOG.md/SESSION_INDEX.md diff appears, inspect first: counts/wording changes from the script edits are safe — include those two files in the Step 5 `git add`; any entry loss means STOP and investigate)

- [ ] **Step 5: Commit**

```powershell
git add .agents/scripts/handoff-new.cjs .agents/scripts/gen-handoff-views.cjs .agents/scripts/validate_handoff_state.py
git commit -m "feat(handoff): extend platform maps (zcode et al), validator warns on stale stub/task/context drift"
```

---

### Task 5: Verify, handoff, PR

**Files:**
- Modify: `.agents/state/task.md` (flip Status → COMPLETED, Overall Progress → 100%)
- Modify: `project-log-md/cline/session-summary-<ts>.md` (via handoff-new.cjs, then flesh out)
- Create: `.agents/state/checkpoints/handover-cline-<ts>.json` (via handoff-new.cjs)

**Interfaces:**
- Consumes: all Task 1–4 commits on this branch
- Produces: pushed branch + PR + Thai summary to user

- [ ] **Step 1: ตรวจรอบสุดท้าย**

Run: `py .agents/scripts/validate_handoff_state.py` (expect PASS), stale-pattern grep from Task 2 Step 5 (expect 0 hits), AC-1.2 search from Task 2 Step 6 (expect new-system-first), `bash .agents/scripts/test-handoff-system.sh` via Git-Bash/WSL (expect exit 0), `git status --short` (only intended files), `git log --oneline -8` (branch commits visible).

- [ ] **Step 2: สร้าง handoff ของรอบนี้**

Run: `node .agents/scripts/handoff-new.cjs cline "Handoff system cleanup: retired stale handoff.md, fixed doc contradictions, refreshed state, extended platform maps, hardened validator" "User reviews PR" "Merge to main after approval"`
Expected: prints checkpoint + summary paths + validator PASS.

- [ ] **Step 3: เติม session-summary + ปิด task.md**

Flesh out the generated summary (Objective/Completed/Next/Blockers + Thai section). Flip `task.md` Status to COMPLETED, Overall Progress to 100%.

- [ ] **Step 4: Commit + push + เปิด PR (ยังไม่ merge)**

Re-run `py .agents/scripts/validate_handoff_state.py` first (Step 3 just modified the summary + task.md — the plan rule is PASS before every commit). Substitute the real `<ts>` printed by handoff-new.cjs in Step 2 (confirm exact names via `git status --short` first), then:

```powershell
git add .agents/state/task.md .agents/state/checkpoints/handover-cline-<ts>.json project-log-md/cline/session-summary-<ts>.md
git commit -m "docs(handoff): cline cleanup session summary + checkpoint"
git push -u origin feat/handoff-system-cleanup-20260926
gh pr create --title "docs(handoff): retire stale handoff.md, fix doc contradictions, harden validator" --body "PRD: PRPs/2026-09-26-handoff-system-cleanup.prd.md"
```

Expected: PR URL returned. Report it + Thai summary to user. Do NOT merge without user approval — merge via GitHub UI only after approval (branch protection is on).

---

## Self-Review

**1. Spec coverage:** PRD AC-1.1 → Task 1 (Steps 2–3); AC-1.2 → Task 2 Step 6; AC-2 → Task 2 (QUICK_START Step 1, pickup Step 2, start-here Step 3, template Step 4); AC-3 → Task 3 (task.md Step 1, PROJECT_STATUS Step 2, current-session Step 3); AC-4.1 → Task 4 Steps 1–2; AC-4.2 → Task 4 Step 3; AC-4.3 → Task 4 Step 4 (test script) + Task 5 Step 1 (re-run). ครบทุกข้อ

**2. Placeholder scan:** ทุก step มีคำสั่ง/ข้อความจริง ไม่มี TBD/TODO/implement later; โค้ด stub + warnings เขียนเต็ม

**3. Type consistency:** ชื่อไฟล์/paths ตรงกับที่อ่านจริง (`.agents/handoff.md`, `project-log-md/archive/`, checkpoint 24 ก.ย.); ตัวแปร validator (`ho`, `cs`, `handover_ts`, `warnings`) ตรงกับโค้ดเดิม; CANON keys เป็น `lowercase_underscore` ตรง validator

