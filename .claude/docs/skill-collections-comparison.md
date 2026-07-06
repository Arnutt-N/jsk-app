# เปรียบเทียบ Agent Skill Collections (สำหรับใช้ข้ามโปรเจกต์)

> เอกสารอ้างอิงทั่วไป — ไม่เฉพาะเจาะจงโปรเจกต์ใด
> สร้าง: 2026-06-29 · อัปเดต: 2026-07-06 (เพิ่ม **maestro** เป็นตัวที่ 6) · ผู้รวบรวม: Claude Code (Opus 4.8)
> เปรียบเทียบ 6 ชุด: **superpowers · ecc · mattpocock · addyosmani · karpathy · maestro**

---

## TL;DR — 6 ชุดกระจายอยู่บน "2 แกน" (ประกอบกันได้ ไม่ใช่คู่แข่ง)

**แกน A — สร้างซอฟต์แวร์ (SDLC):** จัดชั้นตาม altitude จากพฤติกรรมพื้นฐาน → กระบวนการ → playbook ครบวงจร

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

**แกน B — วิศวกรรมเวิร์กโฟลว์ของ AI agent เอง (meta-layer):** ทำงาน *บนตัว agent* ไม่ใช่บนโค้ดแอป

```
          ┌─────────────────────────────────────────────┐
          │  maestro  — audit→fix เวิร์กโฟลว์ AI agent    │  1 core + 24 cmd
          │  (prompt · context · tool · architecture ·    │  + MCP + ext
          │   feedback · RAG · guardrails) + memory/audit │  (10 providers)
          └─────────────────────────────────────────────┘
   ↑ ecc แตะแกนนี้บางส่วน (skill กระจัดกระจาย) แต่ maestro เป็น toolkit เฉพาะทางที่รวมศูนย์
```

**ตัวที่ซ้ำกันจริง:** addyosmani ↔ ecc (full-SDLC เหมือนกัน — อย่า stack พร้อมกัน)
**ตัวที่ orthogonal:** karpathy (กฎพฤติกรรม — ใส่ได้เสมอ) · **maestro** (คนละแกน — เพิ่มได้เมื่อโปรเจกต์เป็น AI/agent หรืออยากจูนเวิร์กโฟลว์ตัว coding agent เอง)

---

## ตารางเปรียบเทียบหลัก

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro |
|------|----------|-------------|------------|------------|-----|---------|
| **แกน** | A (สร้างซอฟต์แวร์) | A | A | A | A (+แตะ B) | **B (agent-workflow eng)** |
| **จำนวน** | 1 skill | ~14 | ~35 | 24 | หลายร้อย (skills+agents+commands) | 25 (1 core + 24 cmd) + MCP(10 tools) + VS Code ext |
| **ตัวตน** | กฎลด LLM mistakes | วินัยกระบวนการ | เครื่องมือคิดวิศวกรรม | playbook ครบ SDLC | เฟรมเวิร์ก/marketplace ครบจักรวาล | toolkit วิศวกรรม "เวิร์กโฟลว์ของ AI agent เอง" |
| **ปรัชญา** | think→simple→surgical→verify | skill-first, ทำตามเป๊ะ (rigid) | small/composable, anti-vibe-coding | production-grade, full lifecycle | ครอบคลุมสูงสุด + เฉพาะทาง | structure>improvisation · constraints=features · measure don't assume · graceful degradation |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม (eng/prod/misc/personal) | flat 24 | namespace `ecc:*` + sub-plugins | 1 core skill + 7 refs + 24 command-skills |
| **จุดเด่นเฉพาะตัว** | surgical changes, goal-driven | systematic-debugging, executing-plans, worktrees | grilling, codebase-design, PRD→issues→triage | doubt-driven, source-driven | domain packs (healthcare/network/finance/crypto), ภาษา (py/go/rust/php/vue), orchestration | diagnose→fix loop, persistent memory/audit/cost, `/reflect` scorecard, delivery เป็น MCP/ext |
| **จุดอ่อน** | แคบ (พฤติกรรมล้วน) | ไม่มี domain/ภาษา | เอนเอียง TS ecosystem | ทับ ecc เกือบหมด | ใหญ่จนเลือก skill ยาก, อาจ noise | ไม่แตะ SDLC/โค้ดแอป/ภาษา/domain; เจาะเฉพาะ agent-eng; ผลดีต้อง `/teach-maestro` ก่อน |
| **เหมาะเมื่อ** | ทุกโปรเจกต์ (baseline) | งาน eng จริงจัง ต้องการวินัย | อยากคุมกระบวนการคิด/วางแผน | อยากได้ playbook สำเร็จรูป | โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ | สร้าง LLM/agent product **หรือ** จูน/ฮาร์เดนเวิร์กโฟลว์ตัว coding agent |
| **วิธีติดตั้ง** | plugin / copy 1 ไฟล์ | plugin | `npx skills add` หรือ copy → `~/.claude/skills/` | marketplace plugin (`enable`) | marketplace plugin (`enable`) | `npx skills add sharpdeveye/maestro` / MCP server / VS Code ext |
| **ทับซ้อน** | ~0 (orthogonal) | เสริม mattpocock | เสริม superpowers | ≈ ecc (สูง) | ครอบแกน A + แตะ B | ต่ำกับแกน A; กลางกับ ecc (subset agent-eng); orthogonal ต่อที่เหลือ |

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
- **แตะแกน B:** มี skill agent-eng กระจัดกระจาย เช่น `ecc:agentic-engineering`, `ecc:context-budget`, `ecc:mcp-server-patterns`, `ecc:eval-harness`, `ecc:prompt-optimizer`, `ecc:agent-harness-construction`, `ecc:cost-aware-llm-pipeline`, `ecc:agent-introspection-debugging` — แต่ **ไม่รวมศูนย์** เป็น toolkit เดียวแบบ maestro และไม่มี memory/audit/cost layer
- **จุดระวัง:** ใหญ่มาก — skill ซ้ำซ้อนทำให้ routing ยาก ควรใช้เฉพาะที่ต้องการ
- **เหมาะ:** โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ

### 6. maestro — `sharpdeveye/maestro`  🆕 (แกน B)
- **คือ:** "Workflow fluency for AI coding agents" — toolkit เฉพาะทางสำหรับ **วิศวกรรมเวิร์กโฟลว์ของ AI agent เอง** (ไม่ใช่โค้ดแอปของผู้ใช้) · v2.0.0, MIT, npm + VS Code Marketplace, 37 unit tests
- **แกนกลาง = 1 core skill `agent-workflow`** (auto-load ทุกครั้งที่เรียก command, `user-invocable: false`) — เป็นคลังความรู้ DO/DON'T ครอบ 7 มิติ พร้อม **7 domain reference files:**
  1. `prompt-engineering` — โครงสร้าง prompt, few-shot, CoT, output schema
  2. `context-management` — จัดสรร context window, memory, state
  3. `tool-orchestration` — ออกแบบ/chain tool, error handling, sandboxing
  4. `agent-architecture` — topology, handoff, multi-agent patterns
  5. `feedback-loops` — evaluation, self-correction, regression
  6. `knowledge-systems` — RAG, chunking, embeddings, source attribution
  7. `guardrails-safety` — validation, prompt injection, cost ceilings
- **24 command-skills** (เรียกเป็น `/command`) แบ่ง 4 กลุ่ม — เป็น "verb ที่กระทำต่อเวิร์กโฟลว์":
  - **Analysis (อ่านอย่างเดียว):** `/diagnose` (audit 5 มิติ ให้คะแนน 1-5 + map ไป command แก้), `/evaluate`, `/reflect`🆕 (effectiveness scorecard จาก audit log)
  - **Fix & Improve:** `/refine` `/streamline` `/calibrate` `/fortify` (error handling/retry/circuit breaker) `/zero-defect`
  - **Enhancement:** `/amplify` `/compose` (multi-agent) `/enrich` (RAG) `/accelerate` (speed/cost) `/chain` `/guard` (safety/cost ceiling) `/iterate` (feedback loop) `/temper` `/turbocharge`
  - **Utility:** `/extract-pattern` `/adapt-workflow` `/onboard-agent` `/specialize` (domain: legal/medical) `/teach-maestro` (เก็บ context → `.maestro.md`) `/capture`🆕 `/recap`🆕
- **เด่นเฉพาะตัว (moat — ไม่มีใน 5 ตัวเดิม):**
  - **Persistent memory layer** `.maestro/` → `context.md` + `decisions.jsonl` (append-only decision log) + `audit.jsonl` (ทุก command + duration + cost) + `sessions/` — อยู่ข้ามเซสชัน
  - **Cost estimation** ต่อ command (Claude/GPT-4/Gemini/o3, ±20%) + **`/reflect`** สรุปว่า command ไหนเวิร์ก/ล้มเหลว
  - **"Workflow Slop Test"** — checklist symptom→command (เช่น "prompt เป็นกำแพงข้อความ → `/refine`", ">10 tools → `/streamline`") ทำตัวเหมือน *linter ของเวิร์กโฟลว์*
  - **Delivery 3 แบบ:** static skills (`npx skills add`) · **live MCP server** (`maestro-workflow-mcp`: 10 tools/25 prompts/8 resources) · **VS Code extension** (sidebar + token budget + wave engine)
  - **10 providers** (Cursor, Claude Code, Gemini, Codex, Copilot/Antigravity, Kiro, Trae, Trae-CN, OpenCode, Pi) — กว้างสุดในกลุ่ม
  - **ทุก command แนะนำ next step** เสมอ (ไม่มีทางตัน) + combo ได้ เช่น `/diagnose /calibrate /refine`
- **ปรัชญา 5 ข้อ:** structure over improvisation · constraints are features · measure don't assume · appropriate complexity · graceful degradation
- **จุดอ่อน:** ไม่แตะ SDLC/โค้ดแอป/ภาษา/domain แอปเลย (คนละแกน) · เจาะแคบเฉพาะ agent-eng · ผลลัพธ์ดีต้องรัน `/teach-maestro` ตั้ง context ก่อน
- **เหมาะ:** (1) สร้าง **LLM/AI-agent product** จริง (chatbot, RAG, multi-agent) — maestro เป็น domain toolkit ของงานนั้น (2) อยาก **จูน/ฮาร์เดนเวิร์กโฟลว์ของ coding agent เอง** (prompt, context budget, tool set, cost control)
- **ที่มา:** https://github.com/sharpdeveye/maestro (`npx skills add sharpdeveye/maestro`)

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
| **สร้าง LLM/AI-agent product** (chatbot/RAG/multi-agent) | **`maestro`** + หนึ่งตัวจากแกน A (เช่น `karpathy` + `superpowers` + `maestro`) |
| **อยากจูน/ฮาร์เดนเวิร์กโฟลว์ตัว coding agent เอง** | **`maestro`** (`/diagnose` → `/fortify` → `/refine`) — เพิ่มบน stack เดิมได้เลย |

---

## สูตร "stack" ที่แนะนำ (ไม่ noise)

```
✅ karpathy-guidelines     (baseline — ติดเสมอ ไม่ซ้ำใคร)
✅ superpowers              (process discipline)
✅ เลือก 1 ใน SDLC layer (แกน A):
      • mattpocock   ถ้าเน้น "ควบคุม + คิด" + TS
      • addyosmani   ถ้าเน้น "playbook สำเร็จรูป"
      • ecc          ถ้าต้อง domain/ภาษาเฉพาะ (ครอบ addyosmani อยู่แล้ว)
➕ maestro (แกน B — orthogonal):
      เพิ่มเมื่อโปรเจกต์เป็น AI/LLM/agent app หรืออยากจูนเวิร์กโฟลว์ coding agent
      ไม่ชนกับตัวเลือก SDLC layer — คนละแกน
⚠️ อย่า stack addyosmani + ecc พร้อมกัน → ของซ้ำ ~20 ตัว สร้าง routing noise
```

**หลักการ:** เลือกชุดที่อยู่ **คนละ layer/แกน** (karpathy + superpowers + หนึ่ง SDLC [+ maestro ถ้าเป็นงาน AI]) ดีกว่าหลายชุด layer เดียวกัน — เพราะ skill ที่ description ซ้ำกันทำให้ agent เลือกยากและสิ้นเปลือง context

---

## สรุปสั้น (1 บรรทัด/ชุด)

- **karpathy** → "นิสัยเขียนโค้ดที่ดี" 1 ไฟล์ ใส่ทุกโปรเจกต์
- **superpowers** → "ระเบียบวินัยกระบวนการ" ที่บังคับทำตามเป๊ะ
- **mattpocock** → "เครื่องมือคิด/วางแผน" สำหรับ engineer ที่อยากคุมกระบวนการเอง
- **addyosmani** → "playbook ครบ SDLC แบบเบา" spec→ship
- **ecc** → "ซูเปอร์มาร์เก็ต" ครบทุกภาษา/domain/orchestration เลือกหยิบเฉพาะที่ใช้
- **maestro** → "โค้ชเวิร์กโฟลว์ของ AI agent" — audit→fix เวิร์กโฟลว์ (prompt/context/tool/arch/RAG/guardrail) + memory/audit/cost · คนละแกนกับ SDLC stack

---

## ความสัมพันธ์เชิงทับซ้อน (อ้างอิงตอนพิจารณา stack)

| คู่ | ระดับทับซ้อน | หมายเหตุ |
|-----|-------------|----------|
| addyosmani ↔ ecc | สูงมาก | full-SDLC เหมือนกัน — เลือกตัวเดียว |
| superpowers ↔ mattpocock | ต่ำ (เสริมกัน) | process vs thinking-tools |
| superpowers ↔ addyosmani | กลาง | TDD/debug/review/plan ซ้ำบางส่วน |
| karpathy ↔ ทุกตัว | ~0 | กฎพฤติกรรม orthogonal — ใส่ได้เสมอ |
| mattpocock ↔ ecc | กลาง | คิด/วางแผนซ้ำบางส่วน; ecc กว้างกว่า |
| **maestro ↔ ecc** | **กลาง (เฉพาะ subset agent-eng)** | ecc มี agent-eng กระจัดกระจาย; maestro รวมศูนย์ + memory/audit/cost |
| **maestro ↔ แกน A ที่เหลือ** | **ต่ำ–~0** | subject ต่าง (สร้างซอฟต์แวร์ vs วิศวกรรม agent) — เพิ่มได้เมื่อเป็นงาน AI |

---

# ภาคผนวก — ตารางเปรียบเทียบละเอียด (A–F)

> **เกณฑ์สัญลักษณ์:** `✓✓` แข็งแกร่ง/มีหลายตัว · `✓` มี · `△` บางส่วน/ทางอ้อม · `✗` ไม่มี

## ตาราง A — ข้อมูลพื้นฐาน (Identity)

| รายการ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro |
|--------|----------|-------------|------------|------------|-----|---------|
| **เจ้าของ** | multica-ai (อิง A. Karpathy) | community plugin | Matt Pocock | Addy Osmani | ECC framework | sharpdeveye |
| **จำนวน skill** | 1 | ~14 | ~35 | 24 | หลายร้อย | 25 (1 core + 24 cmd) |
| **+ agents/commands** | ✗ | ✗ | ✗ | มี agents | ✓✓ (agents+commands เยอะ) | ✓✓ (24 commands + 10 MCP tools + VS Code ext) |
| **ขนาดต่อ skill** | เล็กมาก (~2.5KB) | กลาง | เล็ก-กลาง | กลาง | กลาง-ใหญ่ | กลาง (+ 7 reference หนัก) |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม 6 หมวด | flat 24 | namespace `ecc:*` + sub-plugins | 1 core + 7 refs + 24 cmd (4 หมวด) |
| **Multi-runtime** | ✓ (Cursor/Codex...) | Claude Code | ✓ (`skills.sh`) | ✓ (Gemini/opencode) | Claude Code | ✓✓ (10 providers — มากสุด) |
| **ติดตั้ง** | copy 1 ไฟล์ / plugin | plugin | `npx skills add` / copy | marketplace plugin | marketplace plugin | `npx skills add` / **MCP server** / **VS Code ext** |
| **Namespace** | ไม่มี | `superpowers:*` | ไม่มี (personal) | (plugin) `agent-skills` | `ecc:*` | commands `/diagnose`,`/fortify`... |
| **Maturity** | อิงทวีต | community | ต่อเนื่อง | ต่อเนื่อง | ใหญ่/ต่อเนื่อง | v2.0.0, 37 tests, CHANGELOG, MIT |

## ตาราง B — ปรัชญา & ตำแหน่ง (Positioning)

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro |
|------|----------|-------------|------------|------------|-----|---------|
| **แกน** | A | A | A | A | A (+แตะ B) | **B (agent-workflow eng)** |
| **Altitude** | ล่างสุด (behavioral) | กระบวนการ | engineering tools | full-SDLC | สูงสุด (กว้าง) | คนละแกน (meta: เวิร์กโฟลว์ agent) |
| **ปรัชญาแกน** | ลด LLM mistakes | วินัย skill-first | small/composable | production-grade | ครอบคลุม + เฉพาะทาง | structure>improvisation, measure don't assume |
| **ความเข้มงวด** | แนะนำ (ใช้วิจารณญาณ) | **rigid** (ทำตามเป๊ะ) | flexible | flexible | varies | flexible + บังคับ context-gathering ก่อน |
| **เป้าหมายผู้ใช้** | ทุกคน | engineer จริงจัง | engineer คุมกระบวนการ | ทีม production | องค์กร/หลาย domain | คนสร้าง/จูน AI agent workflow |
| **bias** | caution > speed | discipline > speed | control > automation | completeness | coverage | reliability/measurement > speed |
| **meta-router** | ✗ | `using-superpowers` ✓✓ | `ask-matt` ✓ | `using-agent-skills` ✓ | `ecc-guide` ✓ | `agent-workflow` (core auto-load) ✓✓ |

## ตาราง C — Capability Coverage Matrix: แกน A (SDLC — สร้างซอฟต์แวร์)

> **หมายเหตุ maestro:** อยู่แกน B จึงเป็น `✗`/`△` เกือบทั้งแถวในตารางนี้ (มันไม่ใช่ toolkit สร้างซอฟต์แวร์) — ดูขีดความสามารถจริงของ maestro ใน **ตาราง F** ด้านล่าง เพื่อความเป็นธรรม ตาราง C จึงคงไว้ 5 คอลัมน์เดิม

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
| Security / hardening (โค้ดแอป) | ✗ | ✗ | ✗ | ✓✓ `security-and-hardening` | ✓✓ `security-review`,`security-scan`,`bounty-hunter` |

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

| | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro |
|--|----------|-------------|------------|------------|-----|---------|
| **จุดแข็ง** | leverage/token สูงสุด, orthogonal | วินัยแน่น, debugging+plans เยี่ยม | คิด/วางแผน, grilling, composable | ครบ SDLC เบาๆ, doubt+source-driven | กว้างสุด, domain+ภาษา, orchestration | toolkit agent-eng ครบ 7 มิติ + memory/audit/cost + MCP/multi-runtime |
| **จุดอ่อน** | แคบ (แค่พฤติกรรม) | ไม่มี domain/ภาษา | เอน TS, บาง skill in-progress | ทับ ecc เกือบหมด | ใหญ่จน routing สับสน | ไม่แตะ SDLC/ภาษา/domain แอป; ต้อง `/teach-maestro` ก่อน; เจาะแคบ |
| **เหมาะกับ** | ทุกโปรเจกต์ | งาน eng จริงจัง | นัก eng คุมกระบวนการ + TS | ทีม production playbook | โปรเจกต์ใหญ่/หลายภาษา/domain | สร้าง LLM/agent app; จูนเวิร์กโฟลว์ coding agent |
| **ไม่เหมาะกับ** | (ใช้ได้หมด) | งานเล็ก/ad-hoc | ทีมอยาก automate มาก | ถ้ามี ecc แล้ว | โปรเจกต์เล็ก (overkill) | โปรเจกต์ที่ไม่ใช่ AI และไม่สนจูน agent workflow |

## ตาราง E — ความทับซ้อนรายคู่ (Pairwise Overlap)

| คู่ | ทับซ้อน | คำแนะนำ |
|-----|:-------:|---------|
| addyosmani ↔ ecc | สูงมาก | เลือกตัวเดียว (ecc ครอบ addyosmani) |
| superpowers ↔ addyosmani | กลาง | TDD/debug/review/plan ซ้ำ — superpowers เข้มกว่าด้านวินัย |
| mattpocock ↔ ecc | กลาง | คิด/วางแผนซ้ำ — ecc กว้างกว่า, mattpocock ลึกด้าน thinking |
| superpowers ↔ mattpocock | ต่ำ | เสริมกัน (process ↔ thinking-tools) |
| superpowers ↔ ecc | กลาง | process ซ้ำ — superpowers rigid กว่า |
| karpathy ↔ ทุกตัว | ~0 | orthogonal — ใส่ได้เสมอ |
| **maestro ↔ ecc** | **กลาง (subset)** | เฉพาะ agent-eng — ecc กระจัดกระจาย, maestro รวมศูนย์+memory/audit; ใช้ร่วมได้ maestro เป็นตัวหลักด้านนี้ |
| **maestro ↔ superpowers** | **ต่ำ** | process-for-coding vs engineering-the-agent — เสริมกัน |
| **maestro ↔ addyosmani/mattpocock** | **ต่ำ–~0** | subject ต่าง (SDLC vs agent workflow); แตะ context-engineering เล็กน้อย |
| **maestro ↔ karpathy** | **~0** | orthogonal — ใส่ได้เสมอ |

## ตาราง F — Capability Matrix: แกน B (Agent-Workflow Engineering — บ้านของ maestro)

> วัดขีดความสามารถด้าน "วิศวกรรมเวิร์กโฟลว์ของ AI agent เอง" — แถวล่าง (memory/audit/cost/delivery) คือ **moat** ที่ maestro มีเด่นเดี่ยว

| ความสามารถ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro |
|------------|:--------:|:-----------:|:----------:|:----------:|:---:|:-------:|
| Prompt engineering (structure/schema/few-shot) | ✗ | ✗ | ✗ | △ `context-engineering` | ✓ `prompt-optimizer` | ✓✓ core + `/refine` |
| Context-window management / budget | ✗ | △ | ✓ `handoff` | ✓✓ `context-engineering` | ✓ `context-budget`,`strategic-compact` | ✓✓ core + `/streamline` |
| Tool orchestration / design (MCP, schemas) | ✗ | △ `dispatching` | ✗ | △ | ✓ `mcp-server-patterns` | ✓✓ core + `/chain`,`/calibrate` |
| Agent architecture / multi-agent topology | ✗ | ✓ `subagent-driven`,`dispatching` | △ `loop-me` | ✗ | ✓✓ `team-agent-orchestration`,`multi-workflow` | ✓✓ core + `/compose` |
| Feedback loops / evaluation / regression | ✗ | ✓ `verification-before-completion` | ✗ | △ | ✓✓ `eval-harness`,`benchmark` | ✓✓ core + `/iterate` |
| Knowledge systems / RAG / grounding | ✗ | ✗ | ✗ | ✗ | ✓ `iterative-retrieval`,`rag` skills | ✓✓ core + `/enrich` |
| Guardrails: injection / cost ceiling / validation | ✗ | ✗ | ✗ | △ (app-level) | ✓ `safety-guard`,`gateguard`,`cost-*` | ✓✓ core + `/guard`,`/fortify` |
| **Workflow "slop" linter (symptom→fix)** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓✓ `/diagnose` (5-dim scored) |
| **Persistent memory + decision log** | ✗ | ✗ | △ `handoff` | ✗ | △ `save/resume-session` | ✓✓ `.maestro/` (decisions.jsonl) |
| **Audit trail + per-command cost** | ✗ | ✗ | ✗ | ✗ | △ `cost-tracking` | ✓✓ `audit.jsonl` + estimator |
| **Effectiveness scorecard** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓✓ `/reflect` |
| **Delivery เป็น live MCP server** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓✓ `maestro-workflow-mcp` (10 tools) |

**วิธีอ่าน:** ในแกน B ตัวที่ใกล้เคียง maestro สุดคือ **ecc** (มี agent-eng หลายตัว) แต่ ecc กระจัดกระจายและไม่มี layer memory/audit/cost/scorecard — 5 แถวล่างสุด maestro มีเด่นเดี่ยวเกือบทั้งหมด นี่คือเหตุผลว่าทำไม maestro ถึงเป็น **toolkit เฉพาะทาง** ไม่ใช่แค่ "skill ชุดหนึ่ง"

---

**วิธีอ่านตาราง C/F:** (1) ช่องที่มี `✗` ทั้งแถวในตาราง C = capability ที่ไม่มีชุดไหนครอบ ต้องหาเพิ่มเอง · (2) แถวที่ `✓✓` กระจุกที่ ecc ตัวเดียว = "moat" ของแกน A (domain packs, language patterns) · (3) แถว **Observability/logging** (ตาราง C) มีแค่ addyosmani ที่ `✓✓` · (4) 5 แถวล่างของ **ตาราง F** = moat ของ maestro บนแกน B ที่ชุดอื่นแทบแทนไม่ได้

---

*แหล่งอ้างอิง repo:*
- *superpowers — plugin (ติดตั้งใน environment)*
- *ecc — marketplace plugin (namespace `ecc:*`)*
- *mattpocock — https://github.com/mattpocock/skills*
- *addyosmani — https://github.com/addyosmani/agent-skills*
- *karpathy — https://github.com/multica-ai/andrej-karpathy-skills*
- *maestro — https://github.com/sharpdeveye/maestro (`npx skills add sharpdeveye/maestro`; MCP: `maestro-workflow-mcp`; VS Code: `sharpdeveye.maestro-workflow`)*
