# เปรียบเทียบ Agent Skill Collections (สำหรับใช้ข้ามโปรเจกต์)

> เอกสารอ้างอิงทั่วไป — ไม่เฉพาะเจาะจงโปรเจกต์ใด
> สร้าง: 2026-06-29 · ผู้รวบรวม: Claude Code (Opus 4.8)
> เปรียบเทียบ 5 ชุด: **superpowers · ecc · mattpocock · addyosmani · karpathy**

---

## TL;DR — ทั้ง 5 ชุดอยู่คนละ "ระดับชั้น" (ประกอบกันได้ ไม่ใช่คู่แข่ง)

```
ระดับสูง  ┌─────────────────────────────────────────────┐
(กว้าง)   │  ecc          — ทุกอย่าง + domain packs        │  หลายร้อย skill
          ├─────────────────────────────────────────────┤
          │  addyosmani   — full-SDLC playbook (spec→ship) │  24 skills
          │  mattpocock   — เครื่องมือคิด/engineering       │  ~35 skills
          ├─────────────────────────────────────────────┤
          │  superpowers  — วินัยกระบวนการ (how to work)    │  ~14 skills
          ├─────────────────────────────────────────────┤
ระดับล่าง  │  karpathy     — กฎพฤติกรรมพื้นฐาน (always-on)   │  1 skill
(แคบ/ลึก)  └─────────────────────────────────────────────┘
```

**ตัวที่ซ้ำกันจริง:** addyosmani ↔ ecc (full-SDLC เหมือนกัน — อย่า stack พร้อมกัน)
**ตัวที่ orthogonal:** karpathy (กฎพฤติกรรม ไม่ซ้ำใคร — ใส่ได้เสมอ)

---

## ตารางเปรียบเทียบหลัก

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------|----------|-------------|------------|------------|-----|
| **จำนวน** | 1 skill | ~14 | ~35 | 24 | หลายร้อย (skills+agents+commands) |
| **ตัวตน** | กฎลด LLM mistakes | วินัยกระบวนการ | เครื่องมือคิดวิศวกรรม | playbook ครบ SDLC | เฟรมเวิร์ก/marketplace ครบจักรวาล |
| **ปรัชญา** | think→simple→surgical→verify | skill-first, ทำตามเป๊ะ (rigid) | small/composable, anti-vibe-coding | production-grade, full lifecycle | ครอบคลุมสูงสุด + เฉพาะทาง |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม (eng/prod/misc/personal) | flat 24 | namespace `ecc:*` + sub-plugins |
| **จุดเด่นเฉพาะตัว** | surgical changes, goal-driven | systematic-debugging, executing-plans, worktrees | grilling, codebase-design, PRD→issues→triage | doubt-driven, source-driven | domain packs (healthcare/network/finance/crypto), ภาษา (py/go/rust/php/vue), orchestration |
| **จุดอ่อน** | แคบ (พฤติกรรมล้วน) | ไม่มี domain/ภาษา | เอนเอียง TS ecosystem | ทับ ecc เกือบหมด | ใหญ่จนเลือก skill ยาก, อาจ noise |
| **เหมาะเมื่อ** | ทุกโปรเจกต์ (baseline) | งาน eng จริงจัง ต้องการวินัย | อยากคุมกระบวนการคิด/วางแผน | อยากได้ playbook สำเร็จรูป | โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ |
| **วิธีติดตั้ง** | plugin / copy 1 ไฟล์ | plugin | `npx skills add` หรือ copy → `~/.claude/skills/` | marketplace plugin (`enable`) | marketplace plugin (`enable`) |
| **ทับซ้อน** | ~0 (orthogonal) | เสริม mattpocock | เสริม superpowers | ≈ ecc (สูง) | ครอบทุกตัว |

---

## โปรไฟล์รายชุด

### 1. karpathy — `multica-ai/andrej-karpathy-skills`
- **คือ:** skill เดียว (`karpathy-guidelines`) ~2.5KB — กฎพฤติกรรมลด LLM coding mistakes
- **4 หลักการ:** (1) Think Before Coding — บอก assumption, ถามเมื่อไม่ชัด (2) Simplicity First — โค้ดน้อยสุดที่แก้ปัญหา ไม่เก็ง (3) Surgical Changes — แตะเฉพาะที่จำเป็น ไม่ "ปรับปรุง" โค้ดข้างเคียง (4) Goal-Driven — นิยาม success criteria ที่ verify ได้ แล้ว loop
- **เหมาะ:** ทุกโปรเจกต์ เป็น behavioral baseline — high leverage ต่อ token สูงสุดในกลุ่ม
- **ที่มา:** https://github.com/multica-ai/andrej-karpathy-skills (อิงทวีตของ Andrej Karpathy)

### 2. superpowers
- **คือ:** ~14 process-discipline skills — กำหนด "วิธีทำงาน" (rigid, ทำตามเป๊ะ)
- **เด่น:** `brainstorming`, `systematic-debugging`, `test-driven-development`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `using-git-worktrees`, `requesting/receiving-code-review`, `verification-before-completion`, `using-superpowers` (meta-router)
- **เหมาะ:** งานวิศวกรรมจริงจังที่ต้องการวินัยกระบวนการ; deferred to user instructions เสมอ

### 3. mattpocock — `mattpocock/skills`
- **คือ:** ~35 skills "Skills for Real Engineers" — เครื่องมือคิด/วางแผน, small + composable, anti-vibe-coding
- **กลุ่ม:**
  - **engineering:** `tdd` `implement` `diagnosing-bugs` `codebase-design` `domain-modeling` `improve-codebase-architecture` `prototype` `to-prd` `to-issues` `triage` `grill-with-docs` `resolving-merge-conflicts` `ask-matt`(router) `setup-matt-pocock-skills`
  - **productivity:** `grilling`/`grill-me` `handoff` `teach` `writing-great-skills`
  - **misc:** `git-guardrails-claude-code` `setup-pre-commit` `migrate-to-shoehorn` `scaffold-exercises`
  - **personal:** `edit-article` `obsidian-vault`
  - **in-progress:** `review` `decision-mapping` `loop-me` `writing-beats/fragments/shape`
  - **deprecated:** `design-an-interface` `qa` `request-refactor-plan` `ubiquitous-language`
- **เหมาะ:** อยากควบคุมกระบวนการคิดเอง; TS/JS ecosystem; flow PRD→issues→implement→review
- **ที่มา:** https://github.com/mattpocock/skills (`npx skills add mattpocock/skills`)

### 4. addyosmani — `addyosmani/agent-skills`
- **คือ:** 24 flat skills "Production-grade engineering skills" — playbook ครบ SDLC spec→ship
- **catalog:**
  - **กระบวนการ:** `spec-driven-development` `planning-and-task-breakdown` `incremental-implementation` `test-driven-development` `source-driven-development` `doubt-driven-development`
  - **คุณภาพ:** `code-review-and-quality` `code-simplification` `debugging-and-error-recovery` `security-and-hardening`
  - **Frontend/Perf:** `frontend-ui-engineering` `performance-optimization` `browser-testing-with-devtools`
  - **Ops:** `ci-cd-and-automation` `shipping-and-launch` `observability-and-instrumentation` `deprecation-and-migration`
  - **ออกแบบ/เอกสาร:** `api-and-interface-design` `documentation-and-adrs`
  - **บริบท:** `context-engineering` `interview-me` `idea-refine` `using-agent-skills`(meta)
- **เด่นเฉพาะตัว:** `doubt-driven-development` (adversarial review ทุกการตัดสินใจ), `source-driven-development` (อ้าง docs ทางการเสมอ)
- **เหมาะ:** อยากได้ playbook สำเร็จรูปครบวงจร, multi-runtime (Claude/Gemini/opencode)
- **ที่มา:** https://github.com/addyosmani/agent-skills

### 5. ecc
- **คือ:** marketplace/เฟรมเวิร์กขนาดใหญ่ — หลายร้อย skill + agents + commands ใน namespace `ecc:*`
- **ครอบคลุม:** full SDLC + **domain packs** (healthcare, network, finance, crypto/DeFi, logistics, trade) + **ภาษา/เฟรมเวิร์ก** (python, go, rust, kotlin, swift, php, java, react, vue, django, laravel, springboot...) + **orchestration** (multi-agent, loops, epics)
- **เด่น:** ความกว้าง + ของเฉพาะทางที่ไม่มีในชุดอื่น (เช่น `ecc:healthcare-phi-compliance`, `ecc:network-bgp-diagnostics`, `ecc:security-bounty-hunter`)
- **จุดระวัง:** ใหญ่มาก — skill ซ้ำซ้อนทำให้ routing ยาก ควรใช้เฉพาะที่ต้องการ
- **เหมาะ:** โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ

---

## คู่มือเลือกใช้ (ตามชนิดโปรเจกต์)

| สถานการณ์ | ชุดที่แนะนำ |
|-----------|-------------|
| เริ่มต้น / โปรเจกต์เล็ก / solo | `karpathy` + `superpowers` |
| เน้น "คิดก่อนโค้ด" / วางแผน | `karpathy` + `mattpocock` (grilling, codebase-design, domain-modeling) |
| ทีมต้องการ playbook spec→ship | เลือก **ตัวเดียว**: `addyosmani` (เบา) หรือ `ecc` (ครบกว่า) |
| โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ | `ecc` (มี domain pack เฉพาะ) |
| TypeScript / frontend หนัก | `mattpocock` + `superpowers` |
| เน้นความถูกต้องสูง (prod/security) | `karpathy` + `addyosmani:doubt-driven-development` + `superpowers:systematic-debugging` |

---

## สูตร "stack" ที่แนะนำ (ไม่ noise)

```
✅ karpathy-guidelines     (baseline — ติดเสมอ ไม่ซ้ำใคร)
✅ superpowers              (process discipline)
✅ เลือก 1 ใน SDLC layer:
      • mattpocock   ถ้าเน้น "ควบคุม + คิด" + TS
      • addyosmani   ถ้าเน้น "playbook สำเร็จรูป"
      • ecc          ถ้าต้อง domain/ภาษาเฉพาะ (ครอบ addyosmani อยู่แล้ว)
⚠️ อย่า stack addyosmani + ecc พร้อมกัน → ของซ้ำ ~20 ตัว สร้าง routing noise
```

**หลักการ:** เลือกชุดที่อยู่ **คนละ layer** (karpathy + superpowers + หนึ่ง SDLC) ดีกว่าหลายชุด layer เดียวกัน — เพราะ skill ที่ description ซ้ำกันทำให้ agent เลือกยากและสิ้นเปลือง context

---

## สรุปสั้น (1 บรรทัด/ชุด)

- **karpathy** → "นิสัยเขียนโค้ดที่ดี" 1 ไฟล์ ใส่ทุกโปรเจกต์
- **superpowers** → "ระเบียบวินัยกระบวนการ" ที่บังคับทำตามเป๊ะ
- **mattpocock** → "เครื่องมือคิด/วางแผน" สำหรับ engineer ที่อยากคุมกระบวนการเอง
- **addyosmani** → "playbook ครบ SDLC แบบเบา" spec→ship
- **ecc** → "ซูเปอร์มาร์เก็ต" ครบทุกภาษา/domain/orchestration เลือกหยิบเฉพาะที่ใช้

---

## ความสัมพันธ์เชิงทับซ้อน (อ้างอิงตอนพิจารณา stack)

| คู่ | ระดับทับซ้อน | หมายเหตุ |
|-----|-------------|----------|
| addyosmani ↔ ecc | สูงมาก | full-SDLC เหมือนกัน — เลือกตัวเดียว |
| superpowers ↔ mattpocock | ต่ำ (เสริมกัน) | process vs thinking-tools |
| superpowers ↔ addyosmani | กลาง | TDD/debug/review/plan ซ้ำบางส่วน |
| karpathy ↔ ทุกตัว | ~0 | กฎพฤติกรรม orthogonal — ใส่ได้เสมอ |
| mattpocock ↔ ecc | กลาง | คิด/วางแผนซ้ำบางส่วน; ecc กว้างกว่า |

---

# ภาคผนวก — ตารางเปรียบเทียบละเอียด (A–E)

> **เกณฑ์สัญลักษณ์:** `✓✓` แข็งแกร่ง/มีหลายตัว · `✓` มี · `△` บางส่วน/ทางอ้อม · `✗` ไม่มี

## ตาราง A — ข้อมูลพื้นฐาน (Identity)

| รายการ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|--------|----------|-------------|------------|------------|-----|
| **เจ้าของ** | multica-ai (อิง A. Karpathy) | community plugin | Matt Pocock | Addy Osmani | ECC framework |
| **จำนวน skill** | 1 | ~14 | ~35 | 24 | หลายร้อย |
| **+ agents/commands** | ✗ | ✗ | ✗ | มี agents | ✓✓ (agents+commands เยอะ) |
| **ขนาดต่อ skill** | เล็กมาก (~2.5KB) | กลาง | เล็ก-กลาง | กลาง | กลาง-ใหญ่ |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม 6 หมวด | flat 24 | namespace `ecc:*` + sub-plugins |
| **Multi-runtime** | ✓ (Cursor/Codex...) | Claude Code | ✓ (`skills.sh`) | ✓ (Gemini/opencode) | Claude Code |
| **ติดตั้ง** | copy 1 ไฟล์ / plugin | plugin | `npx skills add` / copy | marketplace plugin | marketplace plugin |
| **Namespace** | ไม่มี | `superpowers:*` | ไม่มี (personal) | (plugin) `agent-skills` | `ecc:*` |

## ตาราง B — ปรัชญา & ตำแหน่ง (Positioning)

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------|----------|-------------|------------|------------|-----|
| **Altitude** | ล่างสุด (behavioral) | กระบวนการ | engineering tools | full-SDLC | สูงสุด (กว้าง) |
| **ปรัชญาแกน** | ลด LLM mistakes | วินัย skill-first | small/composable | production-grade | ครอบคลุม + เฉพาะทาง |
| **ความเข้มงวด** | แนะนำ (ใช้วิจารณญาณ) | **rigid** (ทำตามเป๊ะ) | flexible | flexible | varies |
| **เป้าหมายผู้ใช้** | ทุกคน | engineer จริงจัง | engineer คุมกระบวนการ | ทีม production | องค์กร/หลาย domain |
| **bias** | caution > speed | discipline > speed | control > automation | completeness | coverage |
| **meta-router** | ✗ | `using-superpowers` ✓✓ | `ask-matt` ✓ | `using-agent-skills` ✓ | `ecc-guide` ✓ |

## ตาราง C — Capability Coverage Matrix (จัดตาม SDLC phase)

### Phase 0 — Foundational / Behavioral
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| กฎพฤติกรรมเขียนโค้ด (think/simple/surgical) | ✓✓ | ✗ | ✗ | ✗ | ✗ |
| Adversarial verification | ✗ | ✓ `verification-before-completion` | ✗ | ✓✓ `doubt-driven-development` | ✓ `council`,`verification-loop` |
| Source-grounding (docs-first) | ✗ | ✗ | ✗ | ✓✓ `source-driven-development` | ✓ `documentation-lookup`,`search-first` |

### Phase 1 — Discovery (ideate → spec → plan)
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| Brainstorm / ideation | ✗ | ✓✓ `brainstorming` | △ | ✓ `idea-refine` | ✓ `council` |
| Requirements interview / grilling | ✗ | △ | ✓✓ `grilling`,`grill-with-docs` | ✓✓ `interview-me` | △ |
| Spec / PRD | ✗ | ✓ `writing-plans` | ✓ `to-prd` | ✓✓ `spec-driven-development` | ✓✓ `plan-prd`,`prp-prd`,`spec-miner` |
| Planning / task breakdown | ✗ | ✓✓ `writing-plans`,`executing-plans` | ✓ `to-issues`,`decision-mapping` | ✓✓ `planning-and-task-breakdown` | ✓✓ `plan`,`epic-decompose` |

### Phase 2 — Build (TDD → implement)
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| TDD | ✓ (goal-driven) | ✓✓ `test-driven-development` | ✓✓ `tdd` | ✓✓ `test-driven-development` | ✓✓ `tdd-workflow` + lang tests |
| Implementation | ✗ | ✓ `subagent-driven-development` | ✓ `implement` | ✓✓ `incremental-implementation` | ✓✓ `prp-implement`,`multi-execute` |
| Prototype | ✗ | ✗ | ✓ `prototype` | ✗ | ✓ `ui-demo` |

### Phase 3 — Quality (debug → review → secure)
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| Debugging | ✗ | ✓✓ `systematic-debugging` | ✓✓ `diagnosing-bugs` | ✓✓ `debugging-and-error-recovery` | ✓ `agent-introspection-debugging`,`build-fix` |
| Code review | ✗ | ✓✓ `requesting/receiving-code-review` | ✓ `review` | ✓✓ `code-review-and-quality` | ✓✓ `code-review`,`quality-gate` |
| Simplify / refactor | ✓ (simplicity-first) | ✗ | ✓ `improve-codebase-architecture` | ✓✓ `code-simplification` | ✓ `refactor-clean` |
| Security / hardening | ✗ | ✗ | ✗ | ✓✓ `security-and-hardening` | ✓✓ `security-review`,`security-scan`,`bounty-hunter` |

### Phase 4 — Frontend / Performance / API
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| Frontend / UI | ✗ | ✗ | △ `prototype` | ✓✓ `frontend-ui-engineering` | ✓✓ `frontend-patterns`,`vue/react-patterns` |
| Performance | ✗ | ✗ | ✗ | ✓✓ `performance-optimization` | ✓✓ `latency-critical-systems`,perf agents |
| API / interface design | ✗ | ✗ | ✓ `codebase-design`,`design-an-interface` | ✓✓ `api-and-interface-design` | ✓ `api-design` |

### Phase 5 — Ship (CI/CD → launch → observe → test)
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| CI/CD automation | ✗ | ✗ | ✓ `setup-pre-commit` | ✓✓ `ci-cd-and-automation` | ✓✓ `deployment-patterns`,`docker-patterns` |
| Shipping / launch | ✗ | ✓ `finishing-a-development-branch` | ✗ | ✓✓ `shipping-and-launch` | ✓ `promote`,`canary-watch` |
| **Observability / logging** | ✗ | ✗ | ✗ | ✓✓ `observability-and-instrumentation` | △ `production-audit`,`canary-watch` |
| Browser / E2E testing | ✗ | ✗ | ✗ | ✓✓ `browser-testing-with-devtools` | ✓✓ `browser-qa`,`e2e-testing` |

### Cross-cutting (git · docs · context · orchestration · domain)
| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|
| Git workflow / guardrails | ✗ | ✓ `finishing-a-development-branch` | ✓✓ `git-guardrails-claude-code` | ✓ `git-workflow-and-versioning` | ✓ `git-workflow`,`github-ops` |
| Merge conflict resolution | ✗ | △ | ✓✓ `resolving-merge-conflicts` | ✗ | △ |
| Worktrees | ✗ | ✓✓ `using-git-worktrees` | ✗ | ✗ | △ |
| Documentation / ADR | ✗ | ✗ | ✓ `edit-article` | ✓✓ `documentation-and-adrs` | ✓✓ `update-docs`,`code-tour` |
| Context engineering / handoff | ✗ | △ | ✓✓ `handoff` | ✓✓ `context-engineering` | ✓✓ `save/resume-session`,`strategic-compact` |
| Orchestration / multi-agent | ✗ | ✓ `dispatching-parallel-agents`,`subagent-driven` | △ `loop-me` | ✗ | ✓✓ `multi-workflow`,`team-agent-orchestration` |
| Domain packs (healthcare/network/finance...) | ✗ | ✗ | ✗ | ✗ | ✓✓ มากมาย |
| Language/framework patterns | ✗ | ✗ | △ (TS) | ✗ | ✓✓ (py/go/rust/php/vue...) |
| Deprecation / migration | ✗ | ✗ | ✓ `migrate-to-shoehorn` | ✓✓ `deprecation-and-migration` | ✓ `legacy-modernizer` |

## ตาราง D — จุดแข็ง / จุดอ่อน / เหมาะกับใคร

| | karpathy | superpowers | mattpocock | addyosmani | ecc |
|--|----------|-------------|------------|------------|-----|
| **จุดแข็ง** | leverage/token สูงสุด, orthogonal | วินัยแน่น, debugging+plans เยี่ยม | คิด/วางแผน, grilling, composable | ครบ SDLC เบาๆ, doubt+source-driven | กว้างสุด, domain+ภาษา, orchestration |
| **จุดอ่อน** | แคบ (แค่พฤติกรรม) | ไม่มี domain/ภาษา | เอน TS, บาง skill in-progress | ทับ ecc เกือบหมด | ใหญ่จน routing สับสน |
| **เหมาะกับ** | ทุกโปรเจกต์ | งาน eng จริงจัง | นัก eng คุมกระบวนการ + TS | ทีม production playbook | โปรเจกต์ใหญ่/หลายภาษา/domain |
| **ไม่เหมาะกับ** | (ใช้ได้หมด) | งานเล็ก/ad-hoc | ทีมอยาก automate มาก | ถ้ามี ecc แล้ว | โปรเจกต์เล็ก (overkill) |

## ตาราง E — ความทับซ้อนรายคู่ (Pairwise Overlap)

| คู่ | ทับซ้อน | คำแนะนำ |
|-----|:-------:|---------|
| addyosmani ↔ ecc | สูงมาก | เลือกตัวเดียว (ecc ครอบ addyosmani) |
| superpowers ↔ addyosmani | กลาง | TDD/debug/review/plan ซ้ำ — superpowers เข้มกว่าด้านวินัย |
| mattpocock ↔ ecc | กลาง | คิด/วางแผนซ้ำ — ecc กว้างกว่า, mattpocock ลึกด้าน thinking |
| superpowers ↔ mattpocock | ต่ำ | เสริมกัน (process ↔ thinking-tools) |
| superpowers ↔ ecc | กลาง | process ซ้ำ — superpowers rigid กว่า |
| karpathy ↔ ทุกตัว | ~0 | orthogonal — ใส่ได้เสมอ |

**วิธีอ่านตาราง C:** มองหา (1) ช่องที่มี `✗` ทั้งแถว = capability ที่ไม่มีชุดไหนครอบ ต้องหาเพิ่มเอง · (2) แถวที่ `✓✓` กระจุกที่ ecc ตัวเดียว = "moat" ที่ชุดเล็กแทนไม่ได้ (domain packs, language patterns) · (3) แถว **Observability/logging** มีแค่ addyosmani ที่ `✓✓` — capability ที่ทุกชุดอื่นอ่อน

---

*แหล่งอ้างอิง repo:*
- *superpowers — plugin (ติดตั้งใน environment)*
- *ecc — marketplace plugin (namespace `ecc:*`)*
- *mattpocock — https://github.com/mattpocock/skills*
- *addyosmani — https://github.com/addyosmani/agent-skills*
- *karpathy — https://github.com/multica-ai/andrej-karpathy-skills*
