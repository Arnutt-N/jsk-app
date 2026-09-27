# Plan: CI Greenlet Fix — 2026-09-27

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI เขียว — เติม asyncio extra ให้ SQLAlchemy เพื่อให้ `greenlet` ติดตั้งเสมอ

**Architecture:** แก้ไฟล์เดียว `backend/requirements.txt` 1 บรรทัดบน branch เดิม (`feat/handoff-system-cleanup-20260926`) เพื่อให้ CI ของ PR #233 รันใหม่แล้วผ่าน — ไม่แตะโค้ดแอป ไม่เปลี่ยน schema ไม่ย้ายไฟล์

**Tech Stack:** pip requirements.txt, GitHub Actions CI (`ci.yml` Backend Pytest + `e2e.yml` Playwright Smoke), `gh` CLI

## Global Constraints

- อยู่บน branch `feat/handoff-system-cleanup-20260926` (fix นี้เป็นของ PR #233 โดยตรง — ไม่เปิด branch ใหม่)
- เปลี่ยนแค่ `backend/requirements.txt` 1 บรรทัด + ไฟล์ PRD/plan นี้เท่านั้น
- รัน `py .agents/scripts/validate_handoff_state.py` ได้ PASS ก่อน commit
- สื่อสารกับผู้ใช้ภาษาไทยแบบง่าย

---

### Task 1: One-line requirements fix

**Files:**
- Modify: `backend/requirements.txt` (line 5 only)

**Interfaces:**
- Consumes: current line 5 `sqlalchemy>=2.0.25`, CI error `ModuleNotFoundError: No module named 'greenlet'`
- Produces: line 5 `sqlalchemy[asyncio]>=2.0.25`

- [ ] **Step 1: แก้ 1 บรรทัด**

Replace in `backend/requirements.txt` line 5:
`sqlalchemy>=2.0.25` → `sqlalchemy[asyncio]>=2.0.25`

- [ ] **Step 2: ตรวจว่าแก้แค่บรรทัดเดียว**

Run: `git diff --stat; git diff backend/requirements.txt`
Expected: 1 file changed, 1 insertion, 1 deletion; diff shows only the sqlalchemy line

- [ ] **Step 3: รัน validator**

Run: `py .agents/scripts/validate_handoff_state.py`
Expected: `RESULT: PASS`

- [ ] **Step 4: Commit + push (CI รันใหม่อัตโนมัติ)**

```powershell
git add backend/requirements.txt PRPs/2026-09-27-ci-greenlet-fix.prd.md PRPs/2026-09-27-ci-greenlet-fix.plan.md
git commit -m "fix(backend): declare sqlalchemy asyncio extra so greenlet is installed (CI greenlet fix)"
git push origin feat/handoff-system-cleanup-20260926
```
Expected: push succeeds; PR #233 gets a new CI run

---

### Task 2: Verify CI green, then merge

**Files:** (none — verification only)

- [ ] **Step 1: รอ CI แล้วเช็กผล**

Run: `gh pr checks 233`
Expected: Backend Pytest SUCCESS + Playwright Smoke SUCCESS (Frontend already SUCCESS)

- [ ] **Step 2: ถ้าเขียว — รวม PR (หลังผู้ใช้อนุมัติเท่านั้น)**

Do NOT merge without user approval. Merge via GitHub UI only after approval + CI green.

- [ ] **Step 3: ถ้ายังแดง — อ่าน log ใหม่**

Run: `gh run view <run-id> --log-failed` and diagnose; do NOT guess-merge.

---

## Self-Review

**1. Spec coverage:** AC-1 → Task 1 Step 1; AC-2 → Task 1 Step 2; AC-3 → Task 1 Step 3; AC-4 → Task 1 Step 4 + Task 2 Step 1. ครบทุกข้อ

**2. Placeholder scan:** ไม่มี TBD/TODO; คำสั่งและข้อความ commit เขียนเต็ม

**3. Type consistency:** ชื่อ branch/PR/ไฟล์ตรงกับของจริง (`feat/handoff-system-cleanup-20260926`, PR #233, `backend/requirements.txt:5`)
