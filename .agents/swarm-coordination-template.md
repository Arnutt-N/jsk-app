# 🤖 Agent Swarm Coordination Protocol

> **Template for Multi-Agent Collaborative Tasks**

---

## 📋 AGENT SWARM PROMPT TEMPLATE

When spawning multiple agents, use this structure for EACH agent:

```markdown
# AGENT SWARM - TASK ASSIGNMENT

## 🎯 Your Identity
- **Agent ID**: {unique-agent-id} (e.g., "agent-frontend-001")
- **Role**: {specific-role} (e.g., "Frontend UI Specialist")
- **Task Domain**: {specific-domain} (e.g., "Login Page Components")

## 📁 Project Context
- **Project Root**: {absolute-path}
- **Repository**: {git-url}
- **Current Branch**: {branch-name}
- **Base Commit**: {commit-hash}

## 🎯 Shared Mission
{Clear description of the overall goal all agents are working toward}

Example:
> Transform the skn-app admin dashboard UI to match HR-IMS design system.
> This is a collaborative effort across multiple agents.

## 📋 Your Specific Task
{Detailed description of what THIS agent should accomplish}

### Scope
- **Files to Modify**: {list-specific-files}
- **Files to Read (Reference)**: {list-reference-files}
- **Output Location**: {where-to-save-results}

### Requirements
1. {specific requirement 1}
2. {specific requirement 2}
3. {specific requirement 3}

## 🔄 Swarm Coordination Protocol

### 1. BEFORE You Start - Check Dependencies
Read the shared state file to understand what other agents are doing:
```
{PROJECT_ROOT}/.agents/swarm-state/{swarm-id}-current.json
```

**Check for:**
- Files locked by other agents (don't modify these)
- Dependencies your work relies on (wait if not ready)
- Completed work you should build upon

### 2. WHILE You Work - Update Progress
Every 10 minutes or after completing a significant milestone, update:
```
{PROJECT_ROOT}/.agents/swarm-state/{swarm-id}-{agent-id}-progress.json
```

**Include:**
- Current status: "in_progress" | "blocked" | "completed" | "error"
- Files currently being modified
- Blockers (if any)
- ETA to completion

### 3. WHEN You Complete - Write Summary
Create your completion summary:
```
{PROJECT_ROOT}/.agents/swarm-state/{swarm-id}-{agent-id}-summary.md
```

**Must Include:**
```markdown
# Agent Summary: {agent-id}

## ✅ Completed Work
- List of files modified
- Key changes made
- Decisions taken

## 📊 Impact
- What depends on this work
- Integration points

## ⚠️ Important Notes
- Breaking changes
- Migration steps
- Known issues

## 🔗 Handoff to Other Agents
- What agent X should know
- What agent Y should wait for
- Suggested next steps
```

### 4. DEPENDENCIES - What You Need From Others
List what you need from other agents:
```
Depends On:
- agent-backend-001: API endpoint /api/users must be ready
- agent-design-001: Color tokens must be finalized
```

### 5. CONSUMERS - Who Needs Your Output
List which agents depend on your work:
```
Blocks:
- agent-frontend-002: Needs my Button component
- agent-frontend-003: Needs my color utilities
```

## 🚫 Coordination Rules

### DO NOT:
1. Modify files marked as "locked" in swarm state
2. Delete or rename files other agents are reading
3. Change interfaces/contracts without notifying dependents
4. Commit/push without checking other agents' status
5. Work on tasks outside your assigned scope

### DO:
1. Read other agents' summaries before starting
2. Update your progress regularly
3. Use atomic commits (one logical change per commit)
4. Document breaking changes immediately
5. Ask for clarification if dependencies are unclear

## 📤 Output Format

### Code Changes
- Use minimal, focused changes
- Follow existing code style
- Add comments for complex logic

### Documentation
- Update relevant .md files
- Document public APIs/interfaces
- Note any manual steps required

### State Updates
Always valid JSON:
```json
{
  "agent_id": "{agent-id}",
  "swarm_id": "{swarm-id}",
  "timestamp": "ISO-8601",
  "status": "in_progress|completed|blocked|error",
  "progress_percent": 75,
  "files_working_on": ["path/to/file1.tsx"],
  "files_modified": ["path/to/file2.tsx"],
  "blockers": ["waiting for agent-X"],
  "summary_file": ".agents/swarm-state/{swarm-id}-{agent-id}-summary.md"
}
```

## 🆘 Emergency Protocol

If you encounter:
- **Conflict with another agent's work** → STOP, document conflict, notify coordinator
- **Blocked dependency** → Update status to "blocked", specify what's needed
- **Critical error** → Update status to "error", preserve state, request help
- **Scope creep** → Document suggested additional work for coordinator review

---

## 📝 EXAMPLE: Full Prompt for Specific Agent

```markdown
# AGENT SWARM - TASK ASSIGNMENT

## 🎯 Your Identity
- **Agent ID**: agent-ui-button-001
- **Role**: UI Component Specialist
- **Task Domain**: Button Component System

## 📁 Project Context
- **Project Root**: D:/genAI/skn-app/frontend
- **Repository**: https://github.com/Arnutt-N/skn-app
- **Current Branch**: feature/hr-ims-integration
- **Base Commit**: abc123def

## 🎯 Shared Mission
Transform skn-app to use HR-IMS dark-themed UI design system.
Multiple agents working in parallel on different components.

## 📋 Your Specific Task
Update the Button component to support HR-IMS dark theme variants.

### Scope
- **Files to Modify**: 
  - components/ui/Button.tsx
- **Files to Read (Reference)**:
  - research/kimi_code/hr-ims/ui-design-system.md (for HR-IMS button specs)
  - components/ui/Button.tsx (current implementation)
- **Output Location**: components/ui/Button.tsx

### Requirements
1. Add "glass" variant for glass morphism effect
2. Update "primary" to use blue-indigo gradient
3. Add "glow" prop for glow effect
4. Maintain backward compatibility with existing variant names
5. Update to dark theme color tokens

## 🔄 Swarm Coordination

### Check Before Starting
Read: .agents/swarm-state/hr-ims-migration-current.json

### Dependencies
- Depends On: agent-theme-tokens-001 (color tokens must be ready)
- Blocks: agent-ui-cards-001, agent-ui-forms-001

### Progress Updates
Write to: .agents/swarm-state/hr-ims-migration-agent-ui-button-001-progress.json

### Completion Summary
Write to: .agents/swarm-state/hr-ims-migration-agent-ui-button-001-summary.md

## 🚫 Rules
- DO NOT modify Card.tsx or Input.tsx (other agents own these)
- DO NOT change Button prop interface (breaking change)
- DO update progress every 10 minutes
```

---

# 🗂️ SWARM STATE MANAGEMENT

## Directory Structure

```
.agents/
├── swarm-state/
│   ├── {swarm-id}-manifest.json          # Overall task definition
│   ├── {swarm-id}-current.json           # Live state (agents update this)
│   ├── {swarm-id}-{agent-id}-progress.json  # Per-agent progress
│   ├── {swarm-id}-{agent-id}-summary.md     # Per-agent completion summary
│   └── {swarm-id}-final-summary.md       # Coordinator merges all summaries
└── swarm-logs/
    └── {swarm-id}-{timestamp}.log        # Activity log
```

## State File Schemas

### 1. Manifest (Created by Coordinator)
```json
{
  "swarm_id": "hr-ims-migration-20240213",
  "mission": "Transform UI to HR-IMS design system",
  "coordinator": "kimi-code-cli",
  "created_at": "2026-02-13T19:30:00+07:00",
  "agents": [
    {
      "id": "agent-ui-button-001",
      "role": "Button Components",
      "status": "ready"
    },
    {
      "id": "agent-ui-card-001",
      "role": "Card Components",
      "status": "ready"
    }
  ],
  "dependencies": [
    {
      "from": "agent-theme-tokens-001",
      "to": "agent-ui-button-001"
    }
  ]
}
```

### 2. Current State (Live)
```json
{
  "swarm_id": "hr-ims-migration-20240213",
  "updated_at": "2026-02-13T19:45:00+07:00",
  "agents": [
    {
      "id": "agent-ui-button-001",
      "status": "in_progress",
      "progress": 75,
      "locked_files": ["components/ui/Button.tsx"],
      "blockers": []
    }
  ],
  "completed_tasks": [],
  "blocked_tasks": [],
  "errors": []
}
```

### 3. Agent Progress (Per-agent)
```json
{
  "agent_id": "agent-ui-button-001",
  "swarm_id": "hr-ims-migration-20240213",
  "timestamp": "2026-02-13T19:45:00+07:00",
  "status": "in_progress",
  "progress_percent": 75,
  "current_activity": "Adding glass variant",
  "files_working_on": ["components/ui/Button.tsx"],
  "files_modified": ["components/ui/Button.tsx"],
  "tests_passing": true,
  "blockers": [],
  "estimated_completion": "2026-02-13T20:00:00+07:00"
}
```

---

# 🚀 COORDINATOR WORKFLOW

## Step 1: Plan & Decompose
1. Define overall mission
2. Break into subtasks
3. Identify dependencies
4. Assign agent IDs and roles

## Step 2: Create Shared State
```bash
mkdir -p .agents/swarm-state
# Create manifest.json
# Create initial current.json
```

## Step 3: Spawn Agents
Use Task tool with the prompt template for each agent:
```javascript
Task({
  subagent_name: "coder",
  description: "Agent: Button Components",
  prompt: "# AGENT SWARM - TASK ASSIGNMENT\n... (full prompt from template)"
})
```

## Step 4: Monitor & Coordinate
1. Check swarm-state/current.json regularly
2. Resolve conflicts if agents report blockers
3. Update manifest if task scope changes

## Step 5: Merge & Finalize
1. Read all agent-summary.md files
2. Create final-summary.md
3. Verify all tasks complete
4. Run integration tests

---

# ✅ AGENT PICKUP CHECKLIST

When an agent starts, it MUST:

- [ ] Read the manifest to understand the mission
- [ ] Read current.json to see what others are doing
- [ ] Check for dependencies that must be ready first
- [ ] Verify no file conflicts with "locked_files"
- [ ] Create progress.json with "in_progress" status
- [ ] Begin work on assigned scope only

When an agent completes, it MUST:

- [ ] Test changes locally
- [ ] Update progress.json to 100%
- [ ] Write summary.md with handoff notes
- [ ] Update current.json to mark task complete
- [ ] Clear locked_files entry
- [ ] Notify dependent agents (if blocking them)

---

*Agent Swarm Coordination Protocol v1.0*
*Created by: Kimi Code CLI*
*2026-02-13*
