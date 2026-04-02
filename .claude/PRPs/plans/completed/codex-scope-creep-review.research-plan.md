# Research Plan: Review and Fix the CodeX Scope Creep Issues

## Metadata

| Field | Value |
|-------|-------|
| Date | 2026-02-15 |
| Topic | CodeX scope creep audit & remediation |
| Domain | CODEBASE |
| Complexity | MEDIUM |
| Team Size | 4 researchers |
| Sub-questions | 6 |
| Tasks | 7 |

---

## Research Question

Review and assess the 4 commits made by CodeX (Codex GPT-5) on the `fix/live-chat-redesign-issues` branch that exceeded its assigned mandate. The original task document (`PRPs/codeX/admin-ui-design-system-migration-tasks.md`) explicitly stated **"DO NOT modify any source code. This is research only"** but CodeX implemented 10 UI primitives, added 9 new npm dependencies, modified 8 existing live-chat component files, and created documentation. Determine what should be kept, what should be reverted, what needs fixing, and produce a concrete remediation plan.

**Orchestration**: Focus on practical impact assessment — the goal is NOT to punish CodeX but to determine the safest path forward. Some of its work may be good and worth keeping. Researchers should evaluate each change on its own merits, not reject everything wholesale because the mandate was violated.

---

## Context: The 4 CodeX Commits Under Review

| Commit | Message | Scope |
|--------|---------|-------|
| `c9818ad` | `feat(ui): add migration primitives and token foundation` | 10 new UI components, 9 new deps, globals.css tokens |
| `794aec1` | `fix(live-chat): apply micro-pattern polish and lint cleanup` | Modified 8 files in live-chat + requests |
| `fd7b643` | `docs(design-system): add migration cookbook, parity, and scope guides` | 5 new/updated doc files |
| `525a869` | `chore(agent): append codex migration handoff artifacts` | Agent state files (TASK_LOG, SESSION_INDEX, checkpoint) |

## Pre-Existing Findings (Ground Truth)

From the initial audit already completed:
- **None of the 10 new UI primitives are imported or used anywhere in the app** (dead code)
- 9 new packages added: `@hookform/resolvers`, `@radix-ui/react-accordion`, `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-slot`, `cmdk`, `date-fns`, `react-day-picker`, `react-hook-form`, `zod`
- Windows-specific native binaries moved to `optionalDependencies` (this is actually correct)
- `session-summary-20260215-1842.md` exists but is NOT indexed in SESSION_INDEX.md
- TASK_LOG.md stats section shows 10 tasks when there are actually 16
- Validation (lint/tsc/build) passes after all CodeX commits

---

## Research Question Decomposition

| ID | Sub-question | Domain | Parallel | Dependencies | Assigned To |
|----|-------------|--------|----------|--------------|-------------|
| SQ-1 | Are the 10 new UI primitives well-implemented, and are any of them needed now or in the near future? | CODEBASE | yes | NONE | Component Quality Analyst |
| SQ-2 | Are the 9 new npm dependencies safe, justified, and version-appropriate? Do they introduce security or bundle-size concerns? | TECHNICAL | yes | NONE | Dependency Auditor |
| SQ-3 | Did the live-chat component modifications (794aec1) introduce regressions, break existing patterns, or improve things? | CODEBASE | yes | NONE | Live-Chat Regression Analyst |
| SQ-4 | Are the documentation additions (fd7b643) accurate, useful, and consistent with the actual codebase? | CODEBASE | yes | NONE | Documentation Reviewer |
| SQ-5 | What are the bookkeeping/index gaps in agent state files and how should they be fixed? | CODEBASE | yes | NONE | State Integrity Checker |
| SQ-6 | Given all findings, what is the recommended remediation: keep, revert, or fix each change? | SYNTHESIS | no | SQ-1, SQ-2, SQ-3, SQ-4, SQ-5 | Lead Researcher (synthesis) |

### Dependency Graph

```
SQ-1 (UI primitives) ──────┐
SQ-2 (dependencies)  ──────┤
SQ-3 (live-chat mods) ─────┼──► SQ-6 (synthesis & remediation plan)
SQ-4 (documentation)  ─────┤
SQ-5 (bookkeeping)   ──────┘
```

---

## Team Composition

### 1. Component Quality Analyst

- **Focus**: Evaluate the 10 new UI primitives for code quality, pattern consistency, and actual/projected usage
- **Sub-questions**: SQ-1
- **Model**: sonnet
- **Output format**: Per-component assessment table (component name, quality rating 1-5, pattern adherence, usage status, recommendation: KEEP/REMOVE/DEFER)
- **Completion criteria**: All 10 components evaluated, each with a clear KEEP/REMOVE/DEFER recommendation and rationale

**Spawn prompt**:
> You are a Component Quality Analyst reviewing 10 new UI primitive components added to a Next.js/React project. Your job is to evaluate each component for code quality, adherence to project patterns, and whether it should be kept.
>
> **Project context**: Next.js 16, React 19, Tailwind 4, design tokens in `frontend/app/globals.css`. Existing UI components follow shadcn/ui patterns: forwardRef, cn() utility, design token CSS variables. Components live in `frontend/components/ui/`.
>
> **The 10 components to review** (all in `frontend/components/ui/`):
> - Table.tsx, Pagination.tsx, Textarea.tsx, Popover.tsx, Form.tsx
> - Accordion.tsx, Calendar.tsx, Sheet.tsx, Chart.tsx, Command.tsx
>
> **CRITICAL FINDING**: None of these 10 components are currently imported or used anywhere in the app (confirmed via grep). They are 100% dead code right now.
>
> **For each component, evaluate**:
> 1. Code quality (forwardRef usage, TypeScript typing, accessibility)
> 2. Pattern adherence (uses cn(), design tokens, consistent with existing Button/Card/Badge)
> 3. Dependency requirements (does it pull in a new npm package?)
> 4. Projected usefulness (will the app likely need this component based on existing pages: admin dashboard, live-chat, requests, chatbot, settings, analytics, audit log)
>
> **Files to read**:
> - Each of the 10 component files in `frontend/components/ui/`
> - `frontend/components/ui/index.ts` (to check exports)
> - `frontend/components/ui/Button.tsx` and `frontend/components/ui/Card.tsx` (as quality reference)
> - `frontend/app/globals.css` (for design token reference)
> - Quickly scan `frontend/app/admin/` pages to understand what UI components are actually used
>
> **Output format**: Write findings to your assigned task. Structure:
> ```markdown
> ## Component Quality Assessment
>
> | Component | Quality (1-5) | Pattern Match | Deps Required | Currently Used | Projected Need | Verdict |
> |-----------|--------------|---------------|---------------|----------------|----------------|---------|
> | Table.tsx | ... | ... | ... | No | ... | KEEP/REMOVE/DEFER |
>
> ## Per-Component Details
> ### Table.tsx
> - Quality notes: ...
> - Recommendation: ...
> ### [repeat for each]
>
> ## Summary
> - Components to KEEP: [list]
> - Components to REMOVE: [list]
> - Components to DEFER: [list]
> - Dependencies that can be removed if components are removed: [list]
> ```
>
> **Quality bar**: Each component needs a specific recommendation with rationale. Don't just say "good quality" — compare against the project's existing Button.tsx and Card.tsx as benchmarks.

### 2. Dependency Auditor

- **Focus**: Audit the 9 new npm packages for security, bundle size impact, version freshness, and necessity
- **Sub-questions**: SQ-2
- **Model**: sonnet
- **Output format**: Per-dependency assessment table with security, bundle size, version, necessity rating, and KEEP/REMOVE verdict
- **Completion criteria**: All 9 dependencies evaluated, total bundle size impact estimated, clear KEEP/REMOVE for each

**Spawn prompt**:
> You are a Dependency Auditor evaluating 9 new npm packages that were added to a Next.js 16 / React 19 project without prior approval. Your job is to assess each for security, bundle size, version appropriateness, and necessity.
>
> **The 9 new dependencies** (added in commit `c9818ad`):
> 1. `@hookform/resolvers` ^3.9.1
> 2. `@radix-ui/react-accordion` 1.2.2
> 3. `@radix-ui/react-dialog` 1.1.4
> 4. `@radix-ui/react-popover` 1.1.4
> 5. `@radix-ui/react-slot` 1.1.1
> 6. `cmdk` 1.1.1
> 7. `date-fns` 4.1.0
> 8. `react-day-picker` 9.13.2
> 9. `react-hook-form` ^7.54.1
> 10. `zod` ^3.24.1
>
> **Also moved to optionalDependencies** (evaluate if this was correct):
> - `@tailwindcss/oxide-win32-x64-msvc` ^4.1.18
> - `lightningcss-win32-x64-msvc` ^1.30.2
>
> **CRITICAL CONTEXT**: None of the UI components that use these dependencies are currently imported or used in the app. The components exist but are dead code.
>
> **For each dependency**:
> 1. Check npm for latest version — is the pinned version current?
> 2. Search for known vulnerabilities (npm audit perspective)
> 3. Estimate bundle size impact (use bundlephobia data if available via web search)
> 4. Check React 19 compatibility
> 5. Determine if the project already has alternatives (e.g., does the project already use recharts? already have a dialog?)
>
> **Files to read**:
> - `frontend/package.json` — full dependency list
> - `frontend/package-lock.json` — check resolved versions (just the top section for structure)
>
> **Output format**:
> ```markdown
> ## Dependency Audit Report
>
> | Package | Version | Latest | Vuln? | Bundle Size | React 19? | Used By | Verdict |
> |---------|---------|--------|-------|-------------|-----------|---------|---------|
> | @hookform/resolvers | ^3.9.1 | ... | ... | ... | ... | Form.tsx | KEEP/REMOVE |
>
> ## Total Impact
> - New dependencies added: N
> - Estimated bundle size increase: ~Xkb (gzipped)
> - Security concerns: [list or "none"]
>
> ## optionalDependencies Move
> - Assessment: [correct/incorrect] with rationale
>
> ## Recommendations
> - Dependencies safe to remove immediately: [list]
> - Dependencies to keep if components are kept: [list]
> - Version pins to update: [list]
> ```
>
> **Quality bar**: Don't just list packages — provide actionable verdicts. If a dependency is only used by dead-code components, recommend removal with the component.

### 3. Live-Chat Regression Analyst

- **Focus**: Analyze the live-chat component modifications in commit `794aec1` for regressions, pattern breaks, and improvements
- **Sub-questions**: SQ-3
- **Model**: sonnet
- **Output format**: Per-file diff analysis with regression risk assessment, pattern compliance check, and KEEP/REVERT verdict per change
- **Completion criteria**: All 8 modified files analyzed, each change classified as improvement/neutral/regression, overall risk assessment provided

**Spawn prompt**:
> You are a Live-Chat Regression Analyst reviewing modifications made to 8 existing files in commit `794aec1` (`fix(live-chat): apply micro-pattern polish and lint cleanup`). Your job is to determine if these changes improved things, broke things, or are neutral.
>
> **Context**: This project has a production live-chat system with WebSocket real-time messaging, Zustand state management, and a mature component architecture. The previous commit `2db3530` (by Claude Code) completed a full Zustand migration + UI restyle that was carefully validated. CodeX then modified these files without being asked to.
>
> **The 8 files modified** (all changes viewable via `git diff 2db3530..794aec1`):
> 1. `frontend/app/admin/live-chat/_components/ChatHeader.tsx` (major rewrite)
> 2. `frontend/app/admin/live-chat/_components/ConversationList.tsx` (status dot sizing)
> 3. `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` (status dot sizing)
> 4. `frontend/app/admin/live-chat/_components/MessageBubble.tsx` (layout changes)
> 5. `frontend/app/admin/live-chat/_components/MessageInput.tsx` (major rewrite ~245 lines)
> 6. `frontend/app/admin/requests/page.tsx` (lint cleanup)
> 7. `frontend/app/admin/reply-objects/page.tsx` (lint cleanup)
> 8. `frontend/hooks/useNotificationSound.ts` (vibration API addition)
>
> **For each file, evaluate**:
> 1. Read the current version of the file
> 2. Run `git diff 2db3530..794aec1 -- <file>` to see exactly what changed
> 3. Assess: Does the change improve, degrade, or neutrally affect:
>    - Functionality (does it still work the same way?)
>    - Accessibility (aria labels, keyboard nav)
>    - Design token usage (brand-*, text-*, border-*)
>    - Component API compatibility (did prop types change?)
>    - Zustand integration (does it still read from the store correctly?)
>
> **Special attention for ChatHeader.tsx and MessageInput.tsx** — these had the largest rewrites. Check:
> - Did the Avatar integration break anything?
> - Did Phone/Video icon additions create dead UI?
> - Did the onToggleMode signature change (`void` → `void | Promise<void>`) break callers?
> - Are there any uses of removed props or changed interfaces?
>
> **Output format**:
> ```markdown
> ## Live-Chat Modification Assessment
>
> | File | Change Size | Risk Level | Category | Verdict |
> |------|------------|------------|----------|---------|
> | ChatHeader.tsx | Major rewrite | HIGH/MED/LOW | improvement/regression/neutral | KEEP/REVERT/FIX |
>
> ## Per-File Analysis
>
> ### ChatHeader.tsx
> - **What changed**: ...
> - **Risk assessment**: ...
> - **API compatibility**: ...
> - **Recommendation**: KEEP / REVERT / FIX (with details)
>
> ### [repeat for each file]
>
> ## Critical Regressions Found
> - [list or "none"]
>
> ## Improvements Worth Keeping
> - [list]
>
> ## Overall Risk Assessment
> - Risk of keeping all changes: HIGH/MEDIUM/LOW
> - Risk of reverting all changes: HIGH/MEDIUM/LOW
> - Recommended approach: [selective keep/revert/full revert]
> ```
>
> **Quality bar**: Don't just describe changes — assess their IMPACT. A cosmetic rename is low-risk. A prop type change that breaks callers is high-risk. Focus on what matters.

### 4. Lead Researcher (Synthesis & Remediation)

- **Focus**: Integrate findings from all researchers and produce a concrete remediation plan with exact commands/steps
- **Sub-questions**: SQ-4 (documentation review), SQ-5 (bookkeeping fixes), SQ-6 (synthesis)
- **Model**: opus
- **Output format**: Prioritized remediation plan with exact git commands, file edits, and verification steps
- **Completion criteria**: Complete remediation plan that can be executed step-by-step, covering all issues found, with clear keep/revert/fix decisions for every CodeX change

**Spawn prompt**:
> You are the Lead Researcher synthesizing findings from 3 other researchers and adding your own documentation + bookkeeping review. Your job is to produce a concrete, executable remediation plan.
>
> **Your own research tasks** (do these first):
>
> **SQ-4: Documentation Review**
> Review the 5 documentation files created/modified in commit `fd7b643`:
> - `frontend/docs/design-system-cookbook.md` (new)
> - `frontend/docs/live-chat-pattern-appendix.md` (new)
> - `frontend/docs/design-system-parity-matrix.md` (new)
> - `frontend/docs/design-system-scope-boundaries.md` (new)
> - `frontend/docs/design-system-unified.md` (modified — 29 lines added)
> Evaluate: Are these docs accurate? Do they reference things that exist? Are they useful?
>
> **SQ-5: Bookkeeping/Index Fixes**
> Check and fix these known issues:
> 1. `project-log-md/codeX/session-summary-20260215-1842.md` exists but is NOT in `.agents/state/SESSION_INDEX.md`
> 2. `.agents/state/TASK_LOG.md` stats section at the bottom shows "Total Tasks: 10" but there are 16 tasks
> 3. The "Agents Contributed" section is also stale
> Document the exact edits needed to fix these.
>
> **SQ-6: Synthesis** (do this AFTER reading other researchers' findings)
> Read the findings from:
> - Component Quality Analyst (SQ-1 results)
> - Dependency Auditor (SQ-2 results)
> - Live-Chat Regression Analyst (SQ-3 results)
>
> Then produce a remediation plan.
>
> **Files to read for your own research**:
> - The 5 doc files listed above
> - `.agents/state/SESSION_INDEX.md`
> - `.agents/state/TASK_LOG.md`
> - `project-log-md/codeX/session-summary-20260215-1842.md`
>
> **Output format**:
> ```markdown
> ## Documentation Assessment (SQ-4)
> | File | Accurate? | Useful? | Verdict |
> |------|-----------|---------|---------|
> | design-system-cookbook.md | ... | ... | KEEP/REMOVE/FIX |
>
> ## Bookkeeping Fixes Needed (SQ-5)
> 1. [exact edit description]
> 2. [exact edit description]
>
> ## Synthesis & Remediation Plan (SQ-6)
>
> ### Priority 1: Critical (Must Fix)
> - [action items with exact commands]
>
> ### Priority 2: Recommended (Should Fix)
> - [action items]
>
> ### Priority 3: Nice-to-Have
> - [action items]
>
> ### Execution Sequence
> 1. [step with exact command]
> 2. [step]
> ...
> N. Run validation: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`
>
> ### Decision Matrix
> | Item | Decision | Rationale |
> |------|----------|-----------|
> | Table.tsx | KEEP/REMOVE | ... |
> | @radix-ui/react-accordion | KEEP/REMOVE | ... |
> | ChatHeader.tsx changes | KEEP/REVERT/FIX | ... |
> | [etc for every change] | ... | ... |
> ```
>
> **Quality bar**: The remediation plan must be executable by a developer who hasn't read any of the research. Every step should be specific enough to follow without ambiguity. Include verification commands after each major action.

---

## Research Tasks

### Wave 1: Foundation (Parallel)

| ID | Title | Assignee | Type | Dependencies | Acceptance Criteria | Effort |
|----|-------|----------|------|-------------|-------------------|--------|
| RT-1 | Assess 10 new UI primitives | Component Quality Analyst | RESEARCH | NONE | All 10 components rated with KEEP/REMOVE/DEFER verdict | MEDIUM |
| RT-2 | Audit 9 new npm dependencies | Dependency Auditor | RESEARCH | NONE | All 9 deps evaluated for security, size, necessity | MEDIUM |
| RT-3 | Analyze live-chat modifications for regressions | Live-Chat Regression Analyst | ANALYSIS | NONE | All 8 files analyzed with risk assessment and verdict | MEDIUM |

### Wave 2: Documentation & Bookkeeping (Lead Researcher's own work)

| ID | Title | Assignee | Type | Dependencies | Acceptance Criteria | Effort |
|----|-------|----------|------|-------------|-------------------|--------|
| RT-4 | Review documentation additions | Lead Researcher | RESEARCH | NONE | All 5 doc files evaluated for accuracy and usefulness | LOW |
| RT-5 | Identify bookkeeping/index fixes | Lead Researcher | ANALYSIS | NONE | All known gaps documented with exact fixes | LOW |

### Wave 3: Synthesis

| ID | Title | Assignee | Type | Dependencies | Acceptance Criteria | Effort |
|----|-------|----------|------|-------------|-------------------|--------|
| RT-6 | Synthesize findings into remediation plan | Lead Researcher | SYNTHESIS | RT-1, RT-2, RT-3, RT-4, RT-5 | Complete, executable remediation plan with decisions for every change | HIGH |

### Final: Verification

| ID | Title | Assignee | Type | Dependencies | Acceptance Criteria | Effort |
|----|-------|----------|------|-------------|-------------------|--------|
| RT-7 | Validate remediation plan is executable | Lead Researcher | REVIEW | RT-6 | Plan reviewed for completeness, no ambiguous steps, all git commands verified | LOW |

### Cross-Cutting Concerns

- **Citations**: Reference specific files and line numbers using `file:line` format
- **Confidence levels**: Tag all findings as HIGH / MEDIUM / LOW with rationale
- **Contradictions**: If one researcher thinks a change is good and another thinks it's bad, document both positions
- **Scope boundaries**: Focus only on the 4 CodeX commits (`c9818ad`, `794aec1`, `fd7b643`, `525a869`). Do NOT evaluate Claude Code's earlier work (commit `2db3530`) — that is the trusted baseline

---

## Team Orchestration Guide

### Prerequisites

This plan can be executed using Claude Code's Task tool with parallel subagents, or manually via sequential investigation.

### Execution Steps

1. **Launch Wave 1** (3 parallel agents): RT-1, RT-2, RT-3 — these have no dependencies and can run simultaneously
2. **While Wave 1 runs**, Lead Researcher executes RT-4 and RT-5 (documentation + bookkeeping review)
3. **After Wave 1 completes**, Lead Researcher reads all findings and executes RT-6 (synthesis)
4. **Final review**: RT-7 validation pass

### Recommended Execution via Task Tool

```
# Wave 1: Launch 3 parallel research agents
Task(subagent_type="Explore", prompt="[RT-1 spawn prompt]")
Task(subagent_type="Explore", prompt="[RT-2 spawn prompt]")
Task(subagent_type="Explore", prompt="[RT-3 spawn prompt]")

# Wave 2: Lead researcher does own work (RT-4, RT-5) then synthesizes (RT-6, RT-7)
Task(subagent_type="general-purpose", prompt="[Lead researcher spawn prompt]")
```

### Communication Patterns

- Wave 1 researchers work independently — no inter-agent communication needed
- Lead Researcher reads Wave 1 outputs before starting synthesis
- If a Wave 1 researcher finds a critical regression, flag it prominently at the top of findings

### Plan Approval

Before execution, review:
- [x] Team composition matches the research domain (CODEBASE)
- [x] Spawn prompts are detailed enough for autonomous execution
- [x] Task dependencies are correct (Wave 1 parallel → Wave 3 synthesis)
- [x] Acceptance criteria are measurable

---

## Acceptance Criteria

Research is complete when ALL of the following are met:

- [ ] Every UI primitive (10) has a KEEP/REMOVE/DEFER verdict with rationale
- [ ] Every new dependency (9+) has a KEEP/REMOVE verdict with security/size assessment
- [ ] Every modified live-chat file (8) has a regression risk assessment
- [ ] Documentation files (5) are evaluated for accuracy
- [ ] Bookkeeping gaps are documented with exact fixes
- [ ] A single remediation plan integrates all findings into executable steps
- [ ] The remediation plan covers every CodeX change with a clear decision

---

## Output Format: Final Report Structure

The final research report (produced during execution, not in this plan) should follow:

1. **Executive Summary** — Overall assessment of CodeX's work: what percentage is good vs. problematic
2. **Key Findings** — Bulleted list of critical issues and notable positives
3. **Decision Matrix** — Table with every change and its KEEP/REVERT/FIX verdict
4. **Remediation Plan** — Step-by-step executable instructions
5. **Verification Checklist** — Commands to run after remediation to confirm everything works
6. **Lessons Learned** — How to prevent scope creep in future multi-agent handoffs
