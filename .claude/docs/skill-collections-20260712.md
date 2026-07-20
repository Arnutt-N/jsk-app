# เปรียบเทียบ Agent Skill Collections (สำหรับใช้ข้ามโปรเจกต์)

> เอกสารอ้างอิงทั่วไป — ไม่เฉพาะเจาะจงโปรเจกต์ใด และ**ใช้ข้ามแพลตฟอร์ม**: Claude Code · Codex · Cline · Cursor · Zcode · OpenCode · Kilo · Qwen · Kimi · Antigravity (ดู section "การใช้ข้ามแพลตฟอร์ม")
> สร้าง: 2026-06-29 · อัปเดต: 2026-07-12 (เพิ่ม **taste-skill** เป็นตัวที่ 7 + บันทึกผลประเมิน repo ที่ไม่เข้าเกณฑ์ + section การใช้ข้ามแพลตฟอร์ม) · ผู้รวบรวม: Claude Code
> เปรียบเทียบ 7 ชุด: **superpowers · ecc · mattpocock · addyosmani · karpathy · maestro · taste-skill**

---

## TL;DR — 7 ชุดกระจายอยู่บน "2 แกน + 1 vertical" (ประกอบกันได้ ไม่ใช่คู่แข่ง)

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

**Vertical บนแกน A — taste-skill:** เจาะ domain เดียวคือ *frontend design taste* (landing / portfolio / redesign) — ไม่ใช่ layer ใหม่ในผังด้านบน แต่เป็น "แนวตั้ง" ที่เสียบข้าง stack ไหนก็ได้เมื่องานเป็น marketing-page design (13 skills)

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
**ตัวที่ orthogonal:** karpathy (กฎพฤติกรรม — ใส่ได้เสมอ) · **maestro** (คนละแกน — เพิ่มได้เมื่อโปรเจกต์เป็น AI/agent หรืออยากจูนเวิร์กโฟลว์ตัว coding agent เอง) · **taste-skill** (vertical — เพิ่มได้เมื่องานเป็น frontend design; ระวังทับกับ design skill/rules ที่มีอยู่แล้ว)

---

## ตารางเปรียบเทียบหลัก

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro | taste-skill |
|------|----------|-------------|------------|------------|-----|---------|-------------|
| **แกน** | A (สร้างซอฟต์แวร์) | A | A | A | A (+แตะ B) | **B (agent-workflow eng)** | **A (vertical: frontend design)** |
| **จำนวน** | 1 skill | ~14 | ~35 | 24 | หลายร้อย (skills+agents+commands) | 25 (1 core + 24 cmd) + MCP(10 tools) + VS Code ext | 13 skills (1 หลัก + 12 เสริม) |
| **ตัวตน** | กฎลด LLM mistakes | วินัยกระบวนการ | เครื่องมือคิดวิศวกรรม | playbook ครบ SDLC | เฟรมเวิร์ก/marketplace ครบจักรวาล | toolkit วิศวกรรม "เวิร์กโฟลว์ของ AI agent เอง" | anti-slop design taste สำหรับ landing/portfolio/redesign |
| **ปรัชญา** | think→simple→surgical→verify | skill-first, ทำตามเป๊ะ (rigid) | small/composable, anti-vibe-coding | production-grade, full lifecycle | ครอบคลุมสูงสุด + เฉพาะทาง | structure>improvisation · constraints=features · measure don't assume · graceful degradation | read the brief → "Design Read" → 3 Dials · anti-default discipline · contextual ไม่ auto-fire |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม (eng/prod/misc/personal) | flat 24 | namespace `ecc:*` + sub-plugins | 1 core skill + 7 refs + 24 command-skills | flat 13 (หลัก + style variants + imagegen pipeline) |
| **จุดเด่นเฉพาะตัว** | surgical changes, goal-driven | systematic-debugging, executing-plans, worktrees | grilling, codebase-design, PRD→issues→triage | doubt-driven, source-driven | domain packs (healthcare/network/finance/crypto), ภาษา (py/go/rust/php/vue), orchestration | diagnose→fix loop, persistent memory/audit/cost, `/reflect` scorecard, delivery เป็น MCP/ext | 3 Dials + preset ต่อ use-case, style variant แยกไฟล์, imagegen→image-to-code pipeline |
| **จุดอ่อน** | แคบ (พฤติกรรมล้วน) | ไม่มี domain/ภาษา | เอนเอียง TS ecosystem | ทับ ecc เกือบหมด | ใหญ่จนเลือก skill ยาก, อาจ noise | ไม่แตะ SDLC/โค้ดแอป/ภาษา/domain; เจาะเฉพาะ agent-eng; ผลดีต้อง `/teach-maestro` ก่อน | ตัวหลัก ~87KB (context แพงสุดในกลุ่ม); เฉพาะ marketing pages; ทับ design rules อื่น |
| **เหมาะเมื่อ** | ทุกโปรเจกต์ (baseline) | งาน eng จริงจัง ต้องการวินัย | อยากคุมกระบวนการคิด/วางแผน | อยากได้ playbook สำเร็จรูป | โปรเจกต์ใหญ่/หลายภาษา/domain เฉพาะ | สร้าง LLM/agent product **หรือ** จูน/ฮาร์เดนเวิร์กโฟลว์ตัว coding agent | landing/portfolio/redesign ที่ design เป็นหัวใจ |
| **วิธีติดตั้ง** | plugin / copy 1 ไฟล์ / `npx skills add` | plugin / `npx skills add` | `npx skills add` หรือ copy → `~/.claude/skills/` | marketplace plugin (`enable`) / `npx skills add` | marketplace plugin (`enable`) / `npx skills add` (เฉพาะเนื้อ skill) | `npx skills add sharpdeveye/maestro` / MCP server / VS Code ext | `npx skills add leonxlnx/taste-skill` / Claude Code plugin |
| **ทับซ้อน** | ~0 (orthogonal) | เสริม mattpocock | เสริม superpowers | ≈ ecc (สูง) | ครอบแกน A + แตะ B | ต่ำกับแกน A; กลางกับ ecc (subset agent-eng); orthogonal ต่อที่เหลือ | กลางกับ addyosmani/ecc (เฉพาะ frontend); ~0 กับที่เหลือ |

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

### 7. taste-skill — `Leonxlnx/taste-skill`  🆕 (vertical บนแกน A: frontend design)
- **คือ:** "The Anti-Slop Frontend Framework for AI Agents" — 13 skills เจาะ **รสนิยมการออกแบบ frontend** (landing page / portfolio / redesign) เพื่อกัน UI แบบ generic slop · MIT · ~62k ⭐ · sponsor: Vercel OSS Program + Emil Kowalski (animations.dev) · มี `.claude-plugin/plugin.json` พร้อมใช้เป็น Claude Code plugin · เว็บ: tasteskill.dev
- **ขอบเขตที่ประกาศเอง:** "Landing pages, portfolios, and redesigns. **Not** dashboards, not data tables, not multi-step product UI" — เป็น vertical แคบโดยตั้งใจ
- **โครงสร้าง** (⚠️ ชื่อ skill จริงจาก frontmatter ≠ ชื่อโฟลเดอร์ใน repo):
  - **ตัวหลัก:** `design-taste-frontend` (โฟลเดอร์ `taste-skill`, ~87KB) — Brief Inference (บังคับประกาศ "Design Read" 1 บรรทัดก่อนเขียนโค้ด) → **3 Dials** (`DESIGN_VARIANCE` / `MOTION_INTENSITY` / `VISUAL_DENSITY`) พร้อมตาราง signal→dial และ preset ต่อ use-case + pre-flight checklist + Anti-Default Discipline (แบน AI-purple gradient, hero กลางจอบน dark mesh, 3 การ์ดเท่ากัน, Inter+slate-900 ฯลฯ)
  - `design-taste-frontend-v1` (~21KB) — รุ่นเก่า เก็บไว้เพื่อ backward compat — **อย่าติดตั้งคู่กับตัวหลัก**
  - **Style variants (ตัวเล็ก 8–16KB เลือกโหลดเฉพาะทางได้):** `industrial-brutalist-ui` · `minimalist-ui` · `high-end-visual-design` (soft/premium) · `stitch-design-taste` (สร้าง DESIGN.md สำหรับ Google Stitch) · `redesign-existing-projects` (audit-first) · `brandkit`
  - **Image pipeline (36–40KB/ตัว):** `imagegen-frontend-web` (1 ภาพ/section) · `imagegen-frontend-mobile` · `image-to-code` — ออกแบบเป็นภาพ reference ก่อน แล้วค่อย implement ให้ตรงภาพ
  - **อื่น:** `full-output-enforcement` (กัน truncation/placeholder, 2.6KB) · `gpt-taste` (สำหรับ ChatGPT/GSAP)
  - **โบนัส:** `research/laziness/` — งานวิจัยสาเหตุ+วิธีแก้อาการ LLM ตัดมุม (root causes / remediation / reference prompts)
- **เด่นเฉพาะตัว:** ระบบ dial ที่ infer ค่าจาก brief อัตโนมัติ · แยก style direction เป็น skill ต่อไฟล์ (โหลดเฉพาะที่ใช้ ประหยัด context) · pipeline imagegen→image-to-code · เนื้อหา design เชิงปฏิบัติลึกกว่า design rules ทั่วไป (typography pairing, spacing, shadow, motion จริง)
- **จุดอ่อน:** ตัวหลัก ~87KB ≈ 20k+ tokens ต่อการโหลด 1 ครั้ง (แพงสุดในทั้ง 7 ชุด — แพงกว่า karpathy ~35 เท่า) · ขอบเขตแคบ (ไม่ทำ product UI) · ทับซ้อนเชิงเจตนากับ design-quality rules / frontend-design skills ที่มักติดตั้งอยู่แล้ว · `taste-skill` กับ `v1` ซ้ำกันเอง
- **การใช้ที่แนะนำ:** ติดตั้ง **เฉพาะตัวที่ใช้จริงบนแพลตฟอร์มนั้น** — งานทั่วไปใช้ตัวหลักตัวเดียว หรือหยิบ style variant ตัวเล็กตามทิศทางงาน; อย่าเปิดทั้ง 13 ตัวพร้อมกัน (routing noise + description ชนกับ frontend skill ชุดอื่น)
- **การเลือกตามแพลตฟอร์ม:** บาง skill ออกแบบเจาะปลายทางเฉพาะ — `image-to-code` → Codex · `gpt-taste` → ChatGPT · `stitch-design-taste` → Google Stitch · `imagegen-*`/`brandkit` → เครื่องมือ generate ภาพ (ดูตารางจับคู่ใน "การใช้ข้ามแพลตฟอร์ม")
- **ผ่านการ vet (2026-07-12):** เนื้อหาเป็น design guidance ล้วน ไม่มี shell command / network call / credential handling; `skill.sh` เป็นแค่ registry lookup; repo ดูแลต่อเนื่อง มี CHANGELOG
- **เหมาะ:** งาน landing / portfolio / redesign ที่ต้องการผลลัพธ์ระดับ premium ไม่ generic — เป็น vertical ใช้คู่กับ stack ใดก็ได้
- **ที่มา:** https://github.com/Leonxlnx/taste-skill (`npx skills add leonxlnx/taste-skill` หรือ Claude Code plugin)

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
| **งาน frontend design ระดับ premium** (landing/portfolio/redesign) | **`taste-skill`** — ติดตั้งเฉพาะตัวที่ใช้ (ตัวหลัก หรือ style variant ตัวเล็ก); ถ้ามี design rules/skill อยู่แล้วเลือกฝั่งเดียวเป็นหลัก |

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
➕ taste-skill (vertical — frontend design):
      เพิ่มเมื่องานเป็น landing/portfolio/redesign ที่ design เป็นหัวใจ
      ติดตั้งเฉพาะตัวที่ใช้ — ตัวหลัก ~87KB อย่าเปิดทั้ง 13 ตัวพร้อมกัน
⚠️ อย่า stack addyosmani + ecc พร้อมกัน → ของซ้ำ ~20 ตัว สร้าง routing noise
⚠️ ถ้ามี design-quality rules / frontend-design skill อยู่แล้ว เลือก taste-skill หรือของเดิมเป็นหลักฝั่งเดียว
```

**หลักการ:** เลือกชุดที่อยู่ **คนละ layer/แกน** (karpathy + superpowers + หนึ่ง SDLC [+ maestro ถ้าเป็นงาน AI] [+ taste-skill ถ้าเป็นงาน frontend design]) ดีกว่าหลายชุด layer เดียวกัน — เพราะ skill ที่ description ซ้ำกันทำให้ agent เลือกยากและสิ้นเปลือง context

---

## การใช้ข้ามแพลตฟอร์ม (Claude Code · Codex · Cline · Cursor · Zcode · OpenCode · Kilo · Qwen · Kimi · Antigravity)

> ตัว skill เป็น markdown จึง "พกไปได้" เกือบทุกแพลตฟอร์ม — สิ่งที่ต่างคือ **กลไกโหลด** (plugin / `npx skills add` / rules file / MCP) และของแถมที่ผูกกับแพลตฟอร์ม (hooks · agents · commands · meta-router) ซึ่งมักทำงานเฉพาะบน Claude Code

### ติดตั้งผ่าน `npx skills add` (วิธีมาตรฐานข้ามแพลตฟอร์ม — แนะนำ)

CLI จะถามว่าติดตั้งให้ agent ตัวไหน จึงใช้ชุดคำสั่งเดียวกันได้ทุกแพลตฟอร์มที่ CLI รองรับ (ตัวที่ CLI ไม่รู้จัก ให้ copy โฟลเดอร์ skill ไปวางตามที่ agent นั้นกำหนด):

```bash
npx skills add multica-ai/andrej-karpathy-skills        # karpathy
npx skills add https://github.com/obra/superpowers      # superpowers — hooks/meta-router ทำงานเต็มเฉพาะ Claude Code
npx skills@latest add mattpocock/skills                 # mattpocock
npx skills add addyosmani/agent-skills                  # addyosmani
npx skills add https://github.com/affaan-m/ECC          # ecc — ได้เฉพาะเนื้อ skill (agents/commands/hooks ทำงานเฉพาะ Claude Code)
npx skills add sharpdeveye/maestro                      # maestro
npx skills add https://github.com/Leonxlnx/taste-skill  # taste-skill
```

### ตาราง Portability

| ชุด | Claude Code | แพลตฟอร์มอื่น (Codex / Cline / Cursor / Zcode / OpenCode / Kilo / Qwen / Kimi / Antigravity) | Portable |
|-----|-------------|------------------------------------------------------------|:--------:|
| karpathy | plugin / copy 1 ไฟล์ / `npx skills add` | `npx skills add` หรือ copy เป็น rules ได้ตรงๆ (`.cursorrules` / `.clinerules` / `AGENTS.md`) | ✓✓ สูงสุด |
| superpowers | plugin (native — hooks + meta-router ครบ) / `npx skills add` | `npx skills add` ได้ — ตัว skill มี reference ปรับตาม harness (Codex / Pi / Antigravity) แต่ hook/plugin mechanics ทำงานเฉพาะ Claude Code | ✓ เนื้อหา / ✗ hooks |
| mattpocock | `npx skills add` | CLI เดียวกันรองรับ agent หลายตัว / copy เป็น rules ได้ | ✓✓ |
| addyosmani | marketplace plugin / `npx skills add` | `npx skills add` (README รองรับ Gemini CLI / opencode ด้วย) | ✓✓ |
| ecc | marketplace plugin (native) | เนื้อ skill ติดตั้งได้ผ่าน `npx skills add` แต่ **agents / commands / hooks / namespace `ecc:*` ไม่ทำงานนอก Claude Code** | △ เนื้อหา / ✗ automation |
| maestro | `npx skills add` | ประกาศรองรับ 10 providers (Cursor, Codex, Copilot/Antigravity, Kiro, Trae, OpenCode, Pi...) + **MCP server ใช้ได้กับทุก client ที่รองรับ MCP** + VS Code ext | ✓✓ กว้างสุด |
| taste-skill | `npx skills add` / plugin | `npx skills add` เหมือนกัน + มี skill ที่ออกแบบเจาะปลายทางเฉพาะ (ตารางย่อยด้านล่าง) | ✓✓ |

**taste-skill — จับคู่ skill กับปลายทาง (สำคัญเมื่อใช้เอกสารนี้ข้ามแพลตฟอร์ม):**

| ปลายทาง | ตัวที่เกี่ยวข้อง |
|---------|-----------------|
| ทุก coding agent (Claude Code / Codex / Cursor / Cline / Zcode / OpenCode / Kilo / Qwen / Kimi / Antigravity) | `design-taste-frontend` (หลัก) · style variants (`industrial-brutalist-ui` / `minimalist-ui` / `high-end-visual-design`) · `redesign-existing-projects` · `full-output-enforcement` |
| Codex (เพิ่มจากชุดพื้นฐานด้านบน) | `image-to-code` (เขียนมาเจาะ Codex โดยตรง — generate ภาพ design เองก่อนแล้ว implement ตามภาพ) |
| ChatGPT / GPT models | `gpt-taste` |
| Google Stitch | `stitch-design-taste` |
| เครื่องมือ generate ภาพ (ChatGPT Images ฯลฯ) | `imagegen-frontend-web` / `imagegen-frontend-mobile` / `brandkit` (generate ภาพอย่างเดียว ไม่เขียนโค้ด) |

**ข้อสรุปเชิงเลือกใช้:** ทีมที่ใช้หลายแพลตฟอร์มผสมกัน — ชุดที่ "ติดตั้งครั้งเดียวใช้ได้ทุกที่" คือ **karpathy · mattpocock · maestro · taste-skill** ส่วน **ecc / superpowers ให้คุณค่าเต็มเฉพาะบน Claude Code** (แพลตฟอร์มอื่นได้แค่เนื้อความรู้ ไม่ได้ automation) · การ prune skill ที่ "ไม่ใช้" จึงต้องตัดสิน **ต่อแพลตฟอร์ม** ไม่ใช่ตัดจากเอกสารกลาง — เช่น `image-to-code` ไร้ประโยชน์บน Claude Code แต่เป็นตัวหลักบน Codex

---

## สรุปสั้น (1 บรรทัด/ชุด)

- **karpathy** → "นิสัยเขียนโค้ดที่ดี" 1 ไฟล์ ใส่ทุกโปรเจกต์
- **superpowers** → "ระเบียบวินัยกระบวนการ" ที่บังคับทำตามเป๊ะ
- **mattpocock** → "เครื่องมือคิด/วางแผน" สำหรับ engineer ที่อยากคุมกระบวนการเอง
- **addyosmani** → "playbook ครบ SDLC แบบเบา" spec→ship
- **ecc** → "ซูเปอร์มาร์เก็ต" ครบทุกภาษา/domain/orchestration เลือกหยิบเฉพาะที่ใช้
- **maestro** → "โค้ชเวิร์กโฟลว์ของ AI agent" — audit→fix เวิร์กโฟลว์ (prompt/context/tool/arch/RAG/guardrail) + memory/audit/cost · คนละแกนกับ SDLC stack
- **taste-skill** → "รสนิยม design ของ frontend" — anti-slop สำหรับ landing/portfolio/redesign · vertical เสียบข้าง stack ไหนก็ได้ · ระวัง context ตัวหลักหนัก (~87KB)

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
| **taste-skill ↔ addyosmani / ecc** | **กลาง (เฉพาะ frontend)** | `frontend-ui-engineering` / `frontend-patterns` กว้างแต่ตื้นกว่า — taste-skill ลึกด้าน design taste; เลือกฝั่งหลักฝั่งเดียว |
| **taste-skill ↔ ที่เหลือ (karpathy/superpowers/mattpocock/maestro)** | **~0** | คนละ subject (design taste vs พฤติกรรม/กระบวนการ/agent-eng) |

---

# ภาคผนวก — ตารางเปรียบเทียบละเอียด (A–F)

> **เกณฑ์สัญลักษณ์:** `✓✓` แข็งแกร่ง/มีหลายตัว · `✓` มี · `△` บางส่วน/ทางอ้อม · `✗` ไม่มี

## ตาราง A — ข้อมูลพื้นฐาน (Identity)

| รายการ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro | taste-skill |
|--------|----------|-------------|------------|------------|-----|---------|-------------|
| **เจ้าของ** | multica-ai (อิง A. Karpathy) | community plugin | Matt Pocock | Addy Osmani | ECC framework | sharpdeveye | Leonxlnx (sponsor: Vercel OSS) |
| **จำนวน skill** | 1 | ~14 | ~35 | 24 | หลายร้อย | 25 (1 core + 24 cmd) | 13 |
| **+ agents/commands** | ✗ | ✗ | ✗ | มี agents | ✓✓ (agents+commands เยอะ) | ✓✓ (24 commands + 10 MCP tools + VS Code ext) | ✗ (skills ล้วน) |
| **ขนาดต่อ skill** | เล็กมาก (~2.5KB) | กลาง | เล็ก-กลาง | กลาง | กลาง-ใหญ่ | กลาง (+ 7 reference หนัก) | กระจายมาก (2.6KB–87KB — ตัวหลักใหญ่สุดในทุกชุด) |
| **โครงสร้าง** | ไฟล์เดียว | flat | จัดกลุ่ม 6 หมวด | flat 24 | namespace `ecc:*` + sub-plugins | 1 core + 7 refs + 24 cmd (4 หมวด) | flat 13 (หลัก + variants + imagegen) |
| **Multi-runtime** | ✓ (Cursor/Codex...) | Claude Code เป็นหลัก (+ refs ปรับตาม Codex/Pi/Antigravity) | ✓ (`skills.sh`) | ✓ (Gemini/opencode) | Claude Code | ✓✓ (10 providers — มากสุด) | ✓ (Claude/Codex/Cursor + `gpt-taste` สำหรับ ChatGPT) |
| **ติดตั้ง** | copy 1 ไฟล์ / plugin / `npx skills add` | plugin / `npx skills add` | `npx skills add` / copy | marketplace plugin / `npx skills add` | marketplace plugin / `npx skills add` (เนื้อ skill) | `npx skills add` / **MCP server** / **VS Code ext** | `npx skills add` / Claude Code plugin |
| **Namespace** | ไม่มี | `superpowers:*` | ไม่มี (personal) | (plugin) `agent-skills` | `ecc:*` | commands `/diagnose`,`/fortify`... | ไม่มี (⚠️ ชื่อ frontmatter ≠ ชื่อโฟลเดอร์) |
| **Maturity** | อิงทวีต | community | ต่อเนื่อง | ต่อเนื่อง | ใหญ่/ต่อเนื่อง | v2.0.0, 37 tests, CHANGELOG, MIT | v2 (เก็บ v1 ไว้), CHANGELOG, MIT, ~62k ⭐ |

## ตาราง B — ปรัชญา & ตำแหน่ง (Positioning)

| มิติ | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro | taste-skill |
|------|----------|-------------|------------|------------|-----|---------|-------------|
| **แกน** | A | A | A | A | A (+แตะ B) | **B (agent-workflow eng)** | **A (vertical: frontend design)** |
| **Altitude** | ล่างสุด (behavioral) | กระบวนการ | engineering tools | full-SDLC | สูงสุด (กว้าง) | คนละแกน (meta: เวิร์กโฟลว์ agent) | domain vertical (แคบ/ลึกสุดด้าน design) |
| **ปรัชญาแกน** | ลด LLM mistakes | วินัย skill-first | small/composable | production-grade | ครอบคลุม + เฉพาะทาง | structure>improvisation, measure don't assume | read-the-brief → Design Read → 3 Dials, anti-default |
| **ความเข้มงวด** | แนะนำ (ใช้วิจารณญาณ) | **rigid** (ทำตามเป๊ะ) | flexible | flexible | varies | flexible + บังคับ context-gathering ก่อน | pre-flight บังคับ แต่ contextual ("ไม่มีข้อไหน fire อัตโนมัติ") |
| **เป้าหมายผู้ใช้** | ทุกคน | engineer จริงจัง | engineer คุมกระบวนการ | ทีม production | องค์กร/หลาย domain | คนสร้าง/จูน AI agent workflow | คนสร้าง landing/portfolio ด้วย AI |
| **bias** | caution > speed | discipline > speed | control > automation | completeness | coverage | reliability/measurement > speed | intentional design > speed |
| **meta-router** | ✗ | `using-superpowers` ✓✓ | `ask-matt` ✓ | `using-agent-skills` ✓ | `ecc-guide` ✓ | `agent-workflow` (core auto-load) ✓✓ | ✗ (เลือก variant เองตามงาน) |

## ตาราง C — Capability Coverage Matrix: แกน A (SDLC — สร้างซอฟต์แวร์)

> **หมายเหตุ maestro:** อยู่แกน B จึงเป็น `✗`/`△` เกือบทั้งแถวในตารางนี้ (มันไม่ใช่ toolkit สร้างซอฟต์แวร์) — ดูขีดความสามารถจริงของ maestro ใน **ตาราง F** ด้านล่าง เพื่อความเป็นธรรม ตาราง C จึงคงไว้ 5 คอลัมน์เดิม
> **หมายเหตุ taste-skill:** เป็น vertical ที่ครอบแค่แถวเดียวในตารางนี้ — **Phase 4 / Frontend-UI = `✓✓`** (ลึกสุดในทุกชุด แต่เฉพาะ landing/portfolio/redesign — ไม่รวม dashboard/product UI) แถวอื่น `✗` ทั้งหมด จึงไม่เพิ่มคอลัมน์เช่นกัน

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

| | karpathy | superpowers | mattpocock | addyosmani | ecc | maestro | taste-skill |
|--|----------|-------------|------------|------------|-----|---------|-------------|
| **จุดแข็ง** | leverage/token สูงสุด, orthogonal | วินัยแน่น, debugging+plans เยี่ยม | คิด/วางแผน, grilling, composable | ครบ SDLC เบาๆ, doubt+source-driven | กว้างสุด, domain+ภาษา, orchestration | toolkit agent-eng ครบ 7 มิติ + memory/audit/cost + MCP/multi-runtime | design depth เชิงปฏิบัติ (dials/typography/motion), style variants เลือกโหลดเฉพาะทาง, imagegen→code pipeline |
| **จุดอ่อน** | แคบ (แค่พฤติกรรม) | ไม่มี domain/ภาษา | เอน TS, บาง skill in-progress | ทับ ecc เกือบหมด | ใหญ่จน routing สับสน | ไม่แตะ SDLC/ภาษา/domain แอป; ต้อง `/teach-maestro` ก่อน; เจาะแคบ | ตัวหลัก ~87KB context หนักสุดในกลุ่ม; เฉพาะ marketing pages; ทับ design rules ที่มักมีอยู่แล้ว |
| **เหมาะกับ** | ทุกโปรเจกต์ | งาน eng จริงจัง | นัก eng คุมกระบวนการ + TS | ทีม production playbook | โปรเจกต์ใหญ่/หลายภาษา/domain | สร้าง LLM/agent app; จูนเวิร์กโฟลว์ coding agent | landing/portfolio/redesign เน้น design premium |
| **ไม่เหมาะกับ** | (ใช้ได้หมด) | งานเล็ก/ad-hoc | ทีมอยาก automate มาก | ถ้ามี ecc แล้ว | โปรเจกต์เล็ก (overkill) | โปรเจกต์ที่ไม่ใช่ AI และไม่สนจูน agent workflow | dashboard/data-heavy/product UI; งาน backend ล้วน |

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
| **taste-skill ↔ addyosmani** | กลาง (เฉพาะ frontend) | `frontend-ui-engineering` ครอบ UI เชิง SDLC กว้างกว่า; taste-skill ลึกกว่าด้าน taste — ใช้ร่วมได้ถ้าคุม noise |
| **taste-skill ↔ ecc** | กลาง (เฉพาะ frontend) | ecc มี `frontend-design-direction`/`design-system`/`frontend-patterns` — เลือกฝั่งเดียวเป็นหลักต่อโปรเจกต์ |
| **taste-skill ↔ karpathy/superpowers/mattpocock/maestro** | ~0 | คนละ subject — เพิ่มได้โดยไม่ชน |

## ตาราง F — Capability Matrix: แกน B (Agent-Workflow Engineering — บ้านของ maestro)

> วัดขีดความสามารถด้าน "วิศวกรรมเวิร์กโฟลว์ของ AI agent เอง" — แถวล่าง (memory/audit/cost/delivery) คือ **moat** ที่ maestro มีเด่นเดี่ยว · **taste-skill ไม่อยู่ในตารางนี้** (ไม่แตะแกน B เลย — `✗` ทุกแถว)

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

## ตัวที่ประเมินแล้ว "ไม่เข้าเกณฑ์" (บันทึกไว้กันประเมินซ้ำ)

| Repo | ผลประเมิน | เหตุผล |
|------|-----------|--------|
| `headroomlabs-ai/headroom` (~59k ⭐, Apache-2.0) | ❌ ไม่ใช่ skill collection — แต่ ✅ **ใช้เป็นเครื่องมือเสริมแกน B ได้** (ประเมิน 2026-07-12) | ไม่มี SKILL.md เลย — เป็น **runtime tool บีบอัด context** (tool outputs / logs / files / RAG chunks) ก่อนถึง LLM ลด token 60–95% · delivery: Python/TS library + proxy + **MCP server** + Claude Code/Copilot CLI plugin (`headroom-agent-hooks` — hooks ล้วน) · เทียบกับ maestro: maestro เป็น "ความรู้/คำสั่ง" เรื่อง context budgeting ส่วน headroom เป็น "เครื่องจักร" บีบอัดจริงตอน runtime — **เสริมกัน ไม่แทนกัน** · ติดตั้งเป็น tool ไม่ใช่ skill จึงไม่เข้าตารางเปรียบเทียบ แต่ใส่ร่วม stack ไหนก็ได้ (MCP ใช้ได้ทุก client ที่รองรับ) |
| `asgeirtj/system_prompts_leaks` (~56k ⭐, CC0) | ❌ ไม่ใช่ skill collection (ประเมิน 2026-07-12) | คลัง system prompt ที่ extract จาก vendor (Anthropic / OpenAI / Google / xAI / Cursor ... 300+ ไฟล์) — เป็น **reference ให้มนุษย์ศึกษา prompt engineering** ไม่ใช่ skill ที่ติดตั้งแล้วเปลี่ยนพฤติกรรม agent ได้ · ส่วนเดียวที่หน้าตาเป็น skill (`Anthropic/Claude Code/bundled-skills/`: dataviz, code-review, loop, run, ...) คือของที่**ติดมากับ Claude Code อยู่แล้ว 100%** — เพิ่มไปก็ซ้ำ · สำหรับแพลตฟอร์มอื่น: ไฟล์เหล่านี้เป็น proprietary prompt ของ Anthropic ที่หลุดมา — ใช้เป็น reference ศึกษาได้ แต่ไม่เหมาะ copy ไปติดตั้งใช้งานจริง · เก็บลิงก์ไว้ในแหล่งอ้างอิงด้านล่างแทน |

**เกณฑ์ที่ใช้ตัดสิน:** skill collection ต้อง "ติดตั้งแล้วเปลี่ยนพฤติกรรม agent ได้" (มี SKILL.md + frontmatter `name`/`description` ให้ router เลือกโหลด) — passive reference ไม่นับ

---

*แหล่งอ้างอิง repo:*
- *superpowers — https://github.com/obra/superpowers (`npx skills add https://github.com/obra/superpowers` หรือ Claude Code plugin)*
- *ecc — https://github.com/affaan-m/ECC — marketplace plugin (namespace `ecc:*`); เนื้อ skill ติดตั้งข้ามแพลตฟอร์มได้ผ่าน `npx skills add https://github.com/affaan-m/ECC`*
- *mattpocock — https://github.com/mattpocock/skills (`npx skills@latest add mattpocock/skills`)*
- *addyosmani — https://github.com/addyosmani/agent-skills (`npx skills add addyosmani/agent-skills`)*
- *karpathy — https://github.com/multica-ai/andrej-karpathy-skills (`npx skills add multica-ai/andrej-karpathy-skills`)*
- *maestro — https://github.com/sharpdeveye/maestro (`npx skills add sharpdeveye/maestro`; MCP: `maestro-workflow-mcp`; VS Code: `sharpdeveye.maestro-workflow`)*
- *taste-skill — https://github.com/Leonxlnx/taste-skill (`npx skills add leonxlnx/taste-skill` หรือ Claude Code plugin; เว็บ: https://tasteskill.dev)*

*แหล่งอ้างอิงเพิ่มเติม (ไม่ใช่ skill collection):*
- *headroom — https://github.com/headroomlabs-ai/headroom (runtime context compression: library / proxy / MCP server / plugin hooks — เครื่องมือเสริมแกน B ใช้ร่วมกับทุก stack)*
- *system_prompts_leaks — https://github.com/asgeirtj/system_prompts_leaks (คลัง system prompt จาก vendor ต่างๆ — ใช้ศึกษา prompt engineering / โครงสร้าง system prompt)*
