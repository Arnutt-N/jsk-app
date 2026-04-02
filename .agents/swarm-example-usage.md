# 🚀 Agent Swarm - Quick Start Example

## Scenario: HR-IMS UI Integration with 4 Agents

### Step 1: Create Swarm State Directory

```powershell
$repoRoot = $PWD.Path
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot ".agents/swarm-state")
```

### Step 2: Create Manifest (Coordinator does this)

```json
{
  "swarm_id": "hr-ims-ui-migration",
  "mission": "Integrate HR-IMS dark theme UI into skn-app",
  "coordinator": "kimi-code-cli",
  "created_at": "2026-02-13T19:30:00+07:00",
  "base_commit": "abc123",
  "agents": [
    {
      "id": "agent-globals",
      "role": "Update globals.css with HR-IMS tokens",
      "priority": 1,
      "status": "ready"
    },
    {
      "id": "agent-components",
      "role": "Update Button, Card, Input components",
      "priority": 2,
      "depends_on": ["agent-globals"],
      "status": "waiting"
    },
    {
      "id": "agent-layout",
      "role": "Update admin layout and sidebar",
      "priority": 2,
      "depends_on": ["agent-globals"],
      "status": "waiting"
    },
    {
      "id": "agent-pages",
      "role": "Update login and dashboard pages",
      "priority": 3,
      "depends_on": ["agent-components", "agent-layout"],
      "status": "waiting"
    }
  ]
}
```

### Step 3: Spawn Agent Swarm (4 Agents in Parallel)

```typescript
// Agent 1: Update globals.css
Task({
  subagent_name: "coder",
  description: "HR-IMS: globals.css tokens",
  prompt: `
# AGENT SWARM ASSIGNMENT

## Your Identity
- Agent ID: agent-globals
- Role: CSS Design Tokens Specialist
- Task: Update globals.css with HR-IMS dark theme

## Project
- Root: [repo-root]\frontend
- Branch: main

## Mission
Integrate HR-IMS UI design system (dark navy theme with blue-indigo gradients)

## Your Task
Update globals.css to add HR-IMS design tokens while keeping existing structure.

Files to Modify:
- app/globals.css

Reference:
- research/kimi_code/hr-ims/ui-design-system.md

## Key Requirements
1. Add HR-IMS color tokens (--color-primary-*, --color-slate-*)
2. Add dark theme as default
3. Add glass morphism utilities
4. Add HR-IMS specific animations
5. KEEP existing brand colors for backward compatibility
6. Add scrollbar styling for dark theme

## Coordination
- Write progress to: .agents/swarm-state/hr-ims-ui-migration-agent-globals-progress.json
- Write summary to: .agents/swarm-state/hr-ims-ui-migration-agent-globals-summary.md
- You are FIRST - no dependencies
- Blocks: agent-components, agent-layout

When complete, update status so other agents can start.
`
})

// Agent 2: Update Components (waits for agent-globals)
Task({
  subagent_name: "coder",
  description: "HR-IMS: UI Components",
  prompt: `
# AGENT SWARM ASSIGNMENT

## Your Identity
- Agent ID: agent-components
- Role: UI Component Developer
- Task: Update Button, Card, Input, Badge for HR-IMS theme

## Project
- Root: [repo-root]\frontend

## Your Task
Update these components to use HR-IMS dark theme:
- components/ui/Button.tsx
- components/ui/Card.tsx
- components/ui/Input.tsx
- components/ui/Badge.tsx

## Key Changes
1. Button: Add "glass" variant, update primary to blue-indigo gradient
2. Card: Add "glass" variant, dark backgrounds
3. Input: Dark theme inputs with slate backgrounds
4. Badge: Dark badges with subtle backgrounds

## Coordination
BEFORE STARTING:
1. Read: .agents/swarm-state/hr-ims-ui-migration-current.json
2. Verify agent-globals status is "completed"
3. If not ready, wait and check again in 2 minutes

PROGRESS:
- Write to: .agents/swarm-state/hr-ims-ui-migration-agent-components-progress.json
- Write summary to: .agents/swarm-state/hr-ims-ui-migration-agent-components-summary.md

DEPENDENCIES:
- Depends On: agent-globals (CSS tokens must exist)
- Blocks: agent-pages
`
})

// Agent 3: Update Layout (waits for agent-globals)
Task({
  subagent_name: "coder",
  description: "HR-IMS: Admin Layout",
  prompt: `
# AGENT SWARM ASSIGNMENT

## Your Identity
- Agent ID: agent-layout
- Role: Layout Developer
- Task: Update admin layout with HR-IMS sidebar

## Project
- Root: [repo-root]\frontend

## Your Task
Update admin layout:
- app/admin/layout.tsx

## Key Changes
1. Update sidebar with HR-IMS gradient background
2. Update navigation items styling
3. Update header with glass morphism
4. Update user section styling

Reference:
- HR-IMS sidebar: research/kimi_code/hr-ims/ui-design-system.md

## Coordination
BEFORE STARTING:
1. Read: .agents/swarm-state/hr-ims-ui-migration-current.json
2. Verify agent-globals status is "completed"

PROGRESS:
- Write to: .agents/swarm-state/hr-ims-ui-migration-agent-layout-progress.json
- Write summary to: .agents/swarm-state/hr-ims-ui-migration-agent-layout-summary.md

DEPENDENCIES:
- Depends On: agent-globals
- Blocks: agent-pages
`
})

// Agent 4: Update Pages (waits for agent-components and agent-layout)
Task({
  subagent_name: "coder",
  description: "HR-IMS: Pages Update",
  prompt: `
# AGENT SWARM ASSIGNMENT

## Your Identity
- Agent ID: agent-pages
- Role: Page Developer
- Task: Update login and dashboard pages

## Project
- Root: [repo-root]\frontend

## Your Task
Update pages:
- app/login/page.tsx
- app/admin/page.tsx
- app/admin/components/StatsCard.tsx

## Key Changes
1. Login: Glass morphism card, HR-IMS colors
2. Dashboard: Hero section, dark stats cards
3. StatsCard: Gradient icon backgrounds

## Coordination
BEFORE STARTING:
1. Read: .agents/swarm-state/hr-ims-ui-migration-current.json
2. Verify agent-components AND agent-layout are "completed"
3. If not ready, wait and check again

PROGRESS:
- Write to: .agents/swarm-state/hr-ims-ui-migration-agent-pages-progress.json
- Write summary to: .agents/swarm-state/hr-ims-ui-migration-agent-pages-summary.md

DEPENDENCIES:
- Depends On: agent-components, agent-layout
- Blocks: None (last agent)
`
})
```

### Step 4: Monitor Progress

```powershell
# Check all agent statuses
Get-ChildItem .agents/swarm-state/*-progress.json | ForEach-Object {
    "=== $($_.Name) ===";
    Get-Content $_ | ConvertFrom-Json | Select-Object agent_id, status, progress_percent
}
```

### Step 5: Merge Results

Once all agents complete, coordinator reads all summary files and creates final integration.

---

## 📊 Agent Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATOR (You)                        │
│                    Creates manifest                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌──────────┐
   │ Agent 1 │    │ Agent 2  │    │ Agent 3  │
   │globals  │    │components│    │ layout   │
   │(Priority│    │(Priority │    │(Priority │
   │    1)   │    │    2)    │    │    2)    │
   └────┬────┘    └────┬─────┘    └────┬─────┘
        │              │               │
        │              └───────┬───────┘
        │                      ▼
        │               ┌──────────┐
        └──────────────►│ Agent 4  │
                        │  pages   │
                        │(Priority │
                        │    3)    │
                        └────┬─────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  FINAL MERGE    │
                    │  (Coordinator)  │
                    └─────────────────┘
```

---

## 🔄 Agent Pickup Protocol

When an agent wakes up, it does this:

```
1. READ manifest.json
   └─> Understand the overall mission

2. READ current.json
   └─> See what other agents are doing
   └─> Check which files are locked
   └─> Verify dependencies are ready

3. CHECK dependencies
   └─> If depends_on agents not complete → WAIT
   └─> If file conflicts → REPORT to coordinator
   └─> If all clear → START WORK

4. UPDATE progress.json every 10 min
   └─> status: "in_progress"
   └─> progress_percent: 0-100
   └─> current_activity: "what I'm doing"

5. COMPLETE work
   └─> Test changes
   └─> Write summary.md
   └─> Update progress.json: status "completed"
   └─> Update current.json: mark task done
```

---

## ✅ Summary

This system allows multiple agents to:
- Work in parallel on different parts
- Know what others are doing
- Wait for dependencies
- Handoff work seamlessly
- Avoid conflicts

**Key Files:**
- `swarm-coordination-template.md` - Full protocol documentation
- `swarm-example-usage.md` - This file - practical example

**Want me to actually run this swarm?** Just say "run the swarm" and I'll spawn all 4 agents!
