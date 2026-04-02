# CodeX Task: Admin UI Design System Migration Research (Parallel Execution)

> **Assigned by**: Claude Code (Claude Opus 4.6)
> **Date**: 2026-02-15
> **Branch**: `fix/live-chat-redesign-issues`
> **Priority**: HIGH
> **Execution mode**: PARALLEL (Wave 1: 3 tasks simultaneously)

---

## Mission

Execute Wave 1 of the UI Design System Migration research plan. You will run **3 independent research tasks in parallel**, each producing a markdown report. After all 3 complete, execute Wave 2 (synthesis).

**DO NOT modify any source code.** This is research only - produce markdown reports.

---

## Pre-Reading (REQUIRED before starting any task)

Read these files first to understand the full context:

1. **Research Plan** (master plan with all details):
   `.claude/PRPs/research-plans/admin-ui-design-system-migration.research-plan.md`

2. **Merged Comparison Report** (6-agent consensus, treat as ground truth):
   `research/common/ui-design-system-comparison-merged.md`

3. **Example Design System Spec** (the source we're migrating FROM):
   `examples/admin-chat-system/docs/ui-design-system.md`

---

## Important Notes & Remarks

### What's Already Done (DO NOT re-derive)
The merged comparison report (`research/common/ui-design-system-comparison-merged.md`) already contains verified findings from 6 independent agents. These are **ground truth**:

- Token classification (match/diff/gap) - Sections 1, 13
- Component classification (KEEP/ADD/MATCH) - Section 4
- Architecture decision (NO wholesale migration) - Section 11
- 4-phase action plan skeleton - Section 12
- Color mapping table (16 rows) - Section 13
- Never-touch list (Button 9 variants, Card 6 variants, Badge 7 variants, Toast, Modal, ModalAlert, Sidebar, 13 domain-specific) - Sections 4, 11
- Live chat UX micro-patterns (6 items) - Section 6
- Typography recipes (6 contexts) - Section 2

### Safety Constraints (NON-NEGOTIABLE)
- **CSS/component-level research only** - NO backend code, WebSocket logic, or Zustand store changes
- **Never replace stronger components** - Current Button (9 variants), Card (6 variants), Badge (7 variants) are richer
- **Tailwind v4 awareness** - Current uses CSS-first `@theme` blocks in globals.css, NOT config-file approach
- **Preserve all existing imports** - No breaking changes to component APIs
- **Scope boundary** - Only 10 missing components + 6 UX micro-patterns

### Key Technical Context
- Frontend: Next.js 16.1.1, React 19.2.3, Tailwind v4, CVA variants, Zustand
- Example: shadcn/ui + Radix UI, Tailwind v3 config-based
- Token naming: Current uses `brand-500`, `text-secondary`, `surface` etc. Example uses `primary`, `muted`, `accent`
- The token mapping table in Section 13 of merged report has all 16 translations

---

## Wave 1: Foundation Research (Run ALL 3 in Parallel)

### Task RT-2: Dependency Analysis

**Output file**: `.claude/PRPs/research-plans/rt-2-dependency-analysis.md`
**Effort**: MEDIUM

**What to do**:
For each of these 10 missing components, determine what npm packages are needed and whether they're compatible:

1. Table/DataTable
2. Popover
3. Form (react-hook-form + zod)
4. Sheet
5. Pagination
6. Chart (Recharts)
7. Calendar/DatePicker
8. Accordion
9. Command Palette (cmdk)
10. Textarea

**Methodology**:
1. Read `examples/admin-chat-system/package.json` - extract all dependencies and versions
2. Read `frontend/package.json` - extract all dependencies and versions
3. For each component, read the source file in `examples/admin-chat-system/components/ui/` to identify exact imports
4. Check if current project already has any packages installed
5. Identify version conflicts
6. Check `examples/admin-chat-system/tailwind.config.ts` for what it extends
7. Read `examples/admin-chat-system/components.json` for shadcn/ui config

**Output format**:
```markdown
## Dependency Analysis Report

### Example vs Current Package Comparison
| Package | Example Version | Current Version | Status |

### Per-Component Analysis

#### 1. Table/DataTable
| Package | Example Version | Current Version | Status | Notes |
- Tailwind v4 compatibility: {yes/no/needs-adaptation}
- Risk level: {LOW/MEDIUM/HIGH}
- Component source file analysis: (key imports found)

(repeat for each of 10 components)

### Summary
| Component | New Packages Needed | Risk | Tailwind v4 Safe |

### Recommended Install Command
(Single npm install command for all safe additions)

### Packages to Avoid or Defer
(Any packages with compatibility concerns)
```

**Quality bar**: Every Radix UI package import in the 10 component files must be traced to a package.json entry and verified. No assumptions.

---

### Task RT-3: Component Adaptation Guide + UX Micro-Patterns

**Output file**: `.claude/PRPs/research-plans/rt-3-component-adaptation.md`
**Effort**: HIGH

**Two sub-tasks:**

#### Part A: Component Adaptation (10 components)

Read each file from `examples/admin-chat-system/components/ui/`:
1. `table.tsx`
2. `popover.tsx`
3. `form.tsx`
4. `sheet.tsx`
5. `pagination.tsx`
6. `chart.tsx`
7. `calendar.tsx`
8. `accordion.tsx`
9. `command.tsx`
10. `textarea.tsx`

**Also read current SknApp patterns** (for conventions):
- `frontend/components/ui/Button.tsx` - CVA variant pattern
- `frontend/components/ui/Card.tsx` - variant system
- `frontend/components/ui/Modal.tsx` - dialog pattern
- `frontend/app/globals.css` - token naming

**Token mapping** (from merged report Section 13):
| Example class | Current SknApp equivalent |
|---|---|
| `bg-primary` | `bg-brand-500` |
| `text-primary-foreground` | `text-white` |
| `bg-accent` | `bg-brand-50` or `bg-gray-100` |
| `text-accent-foreground` | `text-brand-900` or `text-gray-900` |
| `bg-muted` | `bg-gray-50` |
| `text-muted-foreground` | `text-text-secondary` |
| `bg-destructive` | `bg-danger` |
| `text-destructive-foreground` | `text-white` |
| `border-input` | `border-gray-200` |
| `ring-ring` | `ring-brand-500` |
| `bg-popover` | `bg-white` or `bg-surface` |
| `text-popover-foreground` | `text-text-primary` |
| `bg-card` | `bg-surface` |
| `text-card-foreground` | `text-text-primary` |
| `border-border` | `border-gray-200` |
| `bg-secondary` | `bg-gray-100` |
| `text-secondary-foreground` | `text-gray-900` |

**Per-component output**: Lines of code, Radix imports, token substitutions table, structural changes, difficulty (DROP-IN/MINOR/MODERATE/MAJOR), recommended file path

#### Part B: Live Chat UX Micro-Patterns (6 changes)

Read merged report Section 6, then for each change, produce **exact code diff** by reading current source:

1. **Message bubble corner-cut**: Read `frontend/app/admin/live-chat/_components/MessageBubble.tsx`, find `rounded-2xl`, produce `rounded-tr-sm`/`rounded-tl-sm` change
2. **Status dot border ring**: Find status dot rendering, add `border-2 border-white` + absolute positioning
3. **Read receipt icons**: Find timestamp/status in MessageBubble, add `CheckCheck`/`Check` icon pattern
4. **Toast slide animation**: Read `frontend/app/admin/live-chat/_components/NotificationToast.tsx`, change fade to `.toast-slide`
5. **Vibration API**: Add `navigator.vibrate(200)` to notification sound handler
6. **Status dot size**: Standardize all status dots to `h-3 w-3`

For each: provide the exact `old_string -> new_string` replacement.

**Output format**:
```markdown
## Component Adaptation Guide

### Part A: Classification Summary
| Component | File | Lines | Difficulty | Token Changes | Structural Changes | Risk |

### Per-Component Guide
(details for each of 10 components)

---

## Live Chat UX Micro-Pattern Changes

### 1. Message Bubble Corner-Cut
**File**: `frontend/app/admin/live-chat/_components/MessageBubble.tsx`
**Old**: (exact string)
**New**: (exact string)
**Risk**: LOW

(repeat for all 6 patterns)
```

---

### Task RT-4: Impact Analysis (Import Counts)

**Output file**: `.claude/PRPs/research-plans/rt-4-impact-analysis.md`
**Effort**: MEDIUM

**What to do**: For every current SknApp UI component, count exact imports using grep and map which pages use each.

**Pre-determined classifications** (from merged report, DO NOT re-derive):

**KEEP (Do Not Replace)**:
- Button (9 variants), Card (6 variants), Badge (7 variants)
- Toast (Zustand-based), Modal, ModalAlert, Sidebar (inline)
- 13 domain-specific components

**MATCH (No Change Needed)**:
- Alert, Avatar, Checkbox, DropdownMenu, Input, Label, Progress, RadioGroup, Select, Separator, Skeleton, Switch, Tabs, Tooltip

**ADD (Net-New, Zero Risk)** - 10 missing:
- Table, Popover, Form, Sheet, Pagination, Chart, Calendar, Accordion, Command, Textarea

**Methodology**:
1. For each component in `frontend/components/ui/` - grep `frontend/` for imports, count distinct files
2. For each component in `frontend/components/admin/` - same
3. For each component in `frontend/app/admin/live-chat/_components/` - same
4. List which admin pages import each
5. Flag 10+ imports as "high-usage"

**Output format**:
```markdown
## Impact Analysis Report (Import Counts)

### Base UI Components (`components/ui/`)
| Component | File | Imports | Importing Pages | Classification | High-Usage |

### Admin Components (`components/admin/`)
| Component | File | Imports | Importing Pages | Classification | High-Usage |

### Live Chat Components (`live-chat/_components/`)
| Component | File | Imports | Importing Pages | Classification | High-Usage |

### High-Usage Components (10+ imports)
| Component | Import Count | Risk Note |

### Zero-Import Components (potentially dead code)
| Component | File | Notes |
```

**Quality bar**: Import counts from actual grep, not estimates. Show the grep pattern used.

---

## Wave 2: Synthesis (Run AFTER all Wave 1 tasks complete)

### Task RT-5: Migration Plan + Token Patch + Validation Playbook

**Output file**: `.claude/PRPs/research-plans/rt-5-migration-plan.md`
**Effort**: HIGH
**Model**: Use most capable model available

**Input - Read these files**:
1. `.claude/PRPs/research-plans/rt-2-dependency-analysis.md` (Wave 1 output)
2. `.claude/PRPs/research-plans/rt-3-component-adaptation.md` (Wave 1 output)
3. `.claude/PRPs/research-plans/rt-4-impact-analysis.md` (Wave 1 output)
4. `research/common/ui-design-system-comparison-merged.md` (ground truth)
5. `frontend/package.json` (for available scripts)
6. `frontend/tsconfig.json` (for TS config)

**Three deliverables in one file**:

#### Deliverable 1: Token CSS Patch
Write the **exact CSS** to add to `frontend/app/globals.css` `@theme` block:
- `--chart-1` through `--chart-5` (HSL matching purple brand)
- Accent color token (teal/green: `162 72% 45%`)
- `--sidebar-primary-fg` token
- Any other tokens from Wave 1 reports

#### Deliverable 2: 6-Phase Migration Plan
- Phase 0: Prerequisites (npm install, token patch)
- Phase 1: Zero-risk component additions (net-new only)
- Phase 2: Low-risk component additions
- Phase 3: Live chat UX micro-patterns (from RT-3 Part B)
- Phase 4: Documentation (4 named deliverables + typography recipes)
- Phase 5: Cleanup and audit

Each phase: component list, exact steps, rollback procedure, success criteria.

#### Deliverable 3: Validation Playbook
- Automated checks per phase (exact commands)
- Visual QA checklist (16 admin pages)
- Rollback triggers
- Final acceptance criteria

**Admin pages for visual QA**: `/admin`, `/admin/live-chat`, `/admin/live-chat/analytics`, `/admin/requests`, `/admin/friends`, `/admin/chatbot`, `/admin/auto-replies`, `/admin/rich-menus`, `/admin/settings`, `/admin/analytics`, `/admin/audit`, `/admin/users`, `/admin/files`, `/admin/reports`, `/admin/logs`, `/admin/design-system`

---

## Execution Checklist

- [ ] Read pre-reading files (research plan + merged report + example spec)
- [ ] Execute RT-2 (dependency analysis) -> write `rt-2-dependency-analysis.md`
- [ ] Execute RT-3 (component adaptation + UX patterns) -> write `rt-3-component-adaptation.md`
- [ ] Execute RT-4 (import count analysis) -> write `rt-4-impact-analysis.md`
- [ ] Verify all 3 Wave 1 outputs exist and are complete
- [ ] Execute RT-5 (synthesis) -> write `rt-5-migration-plan.md`
- [ ] Verify RT-5 covers every component from Wave 1 (in a phase or never-touch list)
- [ ] Verify all 16 admin pages in visual QA checklist

## Handoff Back

When complete, create:
- `.agents/state/checkpoints/handover-codeX-[YYYYMMDD-HHMM].json`
- `project-log-md/codeX/session-summary-[YYYYMMDD-HHMM].md`
- Update `.agents/state/TASK_LOG.md` (APPEND ONLY, Task #15)
- Update `.agents/state/SESSION_INDEX.md`

---

*Task assigned by Claude Code on 2026-02-15. Full research plan at `.claude/PRPs/research-plans/admin-ui-design-system-migration.research-plan.md`*
