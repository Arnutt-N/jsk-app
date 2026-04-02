# 🚀 Cross-Platform Agent Collaboration - Live Example

## Scenario: Implement HR-IMS UI Design System

This shows how Kimi, Claude, and CodeX would collaborate.

---

## Phase 1: Kimi Code Analyzes HR-IMS

**Kimi Code** researches the HR-IMS codebase and creates documentation.

### Kimi Creates:
```
research/kimi_code/hr-ims/
├── ui-design-system.md         # Complete design system doc
└── INTEGRATION_SUMMARY.md      # Integration guide
```

### Kimi Updates PROJECT_STATUS.md:
```markdown
## Recent Completions
- [2026-02-13 18:00] kimi_code: HR-IMS analysis complete

## 📋 Backlog
- [ ] Create integration plan (claude_code)
- [ ] Implement components (kimi_code)
- [ ] Update backend APIs (codex)
```

### Kimi Hands Off to Claude:

**Creates**: `project-log-md/claude_code/handover-kimi_code-20260213-1800.md`

```markdown
---
from_agent: kimi_code
to_agent: claude_code
timestamp: 2026-02-13T18:00:00+07:00
project: skn-app
branch: main
commit: abc123
status: handoff
priority: high
---

# Handover: HR-IMS UI Integration Planning

## 🎯 Context
I've analyzed the HR-IMS codebase and created comprehensive documentation of their UI design system. Now we need an integration plan.

## ✅ What's Done
- [x] Analyzed HR-IMS repository structure
- [x] Documented UI design system (colors, typography, components)
- [x] Created design tokens reference
- [x] Documented component patterns

## 📋 What's Next (Your Tasks)
1. **Review the documentation**
   - Read: `research/kimi_code/hr-ims/ui-design-system.md`
   - Read: `research/kimi_code/hr-ims/INTEGRATION_SUMMARY.md`

2. **Create integration architecture plan**
   - Decide migration strategy (incremental vs full)
   - Identify component mapping (HR-IMS → skn-app)
   - Define backwards compatibility approach
   - Create phased rollout plan

3. **Define tasks for other agents**
   - What should CodeX work on?
   - What components should I (Kimi) build?
   - Any backend changes needed?

## 📁 Files Created
- Created: `research/kimi_code/hr-ims/ui-design-system.md` - 22KB design system doc
- Created: `research/kimi_code/hr-ims/INTEGRATION_SUMMARY.md` - Implementation guide

## 🔗 References
- HR-IMS repo: https://github.com/Arnutt-N/hr-ims
- skn-app AGENTS.md: Project structure and conventions

## 💡 Suggestions
Consider a phased approach:
1. Phase 1: Add design tokens alongside existing (no breaking changes)
2. Phase 2: Build new components with HR-IMS style
3. Phase 3: Migrate pages incrementally
4. Phase 4: Remove old theme (optional)
```

---

## Phase 2: Claude Code Creates Plan

**Claude Code** picks up and creates the integration architecture.

### Claude Reads:
- `project-log-md/claude_code/handover-kimi_code-20260213-1800.md`
- `research/kimi_code/hr-ims/ui-design-system.md`

### Claude Creates:
```
PRPs/claude_code/
└── hr-ims-integration-plan.md
```

### Claude Updates PROJECT_STATUS.md:
```markdown
## 🔄 Active Handoffs
| From | To | Task | Status | Since |
|------|-----|------|--------|-------|
| kimi_code | claude_code | Integration plan | ✅ Complete | 2026-02-13 18:00 |

## ✅ Recent Completions
- [2026-02-13 19:30] claude_code: Integration architecture plan complete

## 🚧 In Progress
- Waiting for implementation to begin
```

### Claude Hands Off to Kimi & CodeX:

**Creates**: `project-log-md/kimi_code/handover-claude_code-20260213-1930.md`

```markdown
---
from_agent: claude_code
to_agent: kimi_code
timestamp: 2026-02-13T19:30:00+07:00
project: skn-app
branch: feature/hr-ims-integration
commit: def456
status: handoff
priority: high
---

# Handover: Implementation Phase - Frontend Components

## 🎯 Context
Based on Kimi's analysis, I've created an integration plan. Now starting implementation phase.

## ✅ What's Done (by me)
- [x] Created integration architecture plan
- [x] Defined component mapping strategy
- [x] Identified backwards compatibility approach
- [x] Created phased rollout plan

## 📋 Your Tasks (Kimi Code)

### Task 1: Update Design Tokens (Priority: High)
Update `frontend/app/globals.css`:
- Add HR-IMS color tokens alongside existing tokens
- Add dark theme utilities
- Add glass morphism utilities
- Keep existing tokens for backwards compatibility

### Task 2: Update Button Component (Priority: High)
Update `frontend/components/ui/Button.tsx`:
- Add "glass" variant
- Update "primary" to support gradient (blue-indigo)
- Add glow effect option
- Maintain existing API (no breaking changes)

### Task 3: Update Card Component (Priority: Medium)
Update `frontend/components/ui/Card.tsx`:
- Add "glass" variant
- Add "gradient" variant
- Dark theme backgrounds

### Task 4: Create New Login Page (Priority: Medium)
Create HR-IMS styled login at `frontend/app/login/page.tsx`:
- Glass morphism card
- Dark gradient background
- Demo account buttons
- Framer Motion animations

## 📋 CodeX Tasks (Parallel)
CodeX is working on backend in parallel - see his handoff file.

## ⚠️ Important
- NO breaking changes to existing components
- Add new variants, don't replace existing ones yet
- Use feature flag or separate imports for new theme
- Test that existing pages still work

## 📁 Files to Modify
1. `frontend/app/globals.css`
2. `frontend/components/ui/Button.tsx`
3. `frontend/components/ui/Card.tsx`
4. `frontend/app/login/page.tsx` (new)

## 🔗 References
- Plan: `PRPs/claude_code/hr-ims-integration-plan.md`
- Design system: `research/kimi_code/hr-ims/ui-design-system.md`

## 🔄 Next Handoff
When complete, hand off to me (Claude) for integration testing, or to CodeX if backend work is ready.
```

**Also Creates**: `project-log-md/codex/handover-claude_code-20260213-1930.md`

```markdown
---
from_agent: claude_code
to_agent: codex
timestamp: 2026-02-13T19:30:00+07:00
project: skn-app
branch: feature/hr-ims-integration
commit: def456
status: handoff
priority: medium
---

# Handover: Backend API Updates

## 🎯 Context
Frontend is getting HR-IMS UI theme. Need to ensure backend supports any UI requirements.

## ✅ What's Done (by others)
- [x] HR-IMS UI design system documented
- [x] Integration architecture plan created
- [x] Frontend implementation started

## 📋 Your Tasks (CodeX)

### Task 1: Review API Requirements (Priority: Low-Medium)
Check if any backend changes needed:
- Does HR-IMS have any API patterns we should adopt?
- Any auth/session changes needed for new UI?
- Any new endpoints needed?

### Task 2: Environment Configuration (Priority: Medium)
Update backend config if needed:
- CORS settings for new frontend
- Any new environment variables

### Task 3: Testing Support (Priority: Low)
- Ensure backend tests still pass
- Add any test fixtures needed for new UI

## ⚠️ Note
This is lower priority than frontend work. If no backend changes needed, just verify tests pass and mark complete.

## 🔗 References
- Frontend work: See `project-log-md/kimi_code/handover-claude_code-20260213-1930.md`
```

---

## Phase 3: Parallel Implementation

**Kimi Code** and **CodeX** work in parallel.

### Kimi Code Updates Progress
Every 30 minutes, Kimi updates:

`.agents/state/kimi_code-progress.json`:
```json
{
  "agent": "kimi_code",
  "task": "HR-IMS Frontend Implementation",
  "status": "in_progress",
  "progress": 75,
  "completed": [
    "globals.css updated",
    "Button.tsx updated",
    "Card.tsx updated"
  ],
  "in_progress": "login/page.tsx",
  "blockers": []
}
```

### CodeX Completes (Nothing needed)

CodeX finds no backend changes needed, marks complete.

**Creates**: `project-log-md/claude_code/handover-codex-20260213-2000.md`

```markdown
---
from_agent: codex
to_agent: claude_code
timestamp: 2026-02-13T20:00:00+07:00
project: skn-app
status: completed
---

# Handover: Backend Review Complete

## ✅ What's Done
- [x] Reviewed API requirements - no changes needed
- [x] Verified CORS settings - already compatible
- [x] All backend tests passing
- [x] No new environment variables needed

## 📋 Conclusion
Backend is ready for HR-IMS UI integration. No action required.
```

---

## Phase 4: Kimi Code Completes & Hands Off

**Kimi Code** finishes frontend work.

**Creates**: `project-log-md/claude_code/handover-kimi_code-20260213-2100.md`

```markdown
---
from_agent: kimi_code
to_agent: claude_code
timestamp: 2026-02-13T21:00:00+07:00
project: skn-app
branch: feature/hr-ims-integration
commit: ghi789
status: completed
---

# Handover: Frontend Implementation Complete

## ✅ What's Done
- [x] globals.css - Added HR-IMS design tokens
- [x] Button.tsx - Added glass variant, gradient support
- [x] Card.tsx - Added glass, gradient variants
- [x] Input.tsx - Updated for dark theme
- [x] Badge.tsx - Updated for dark theme
- [x] login/page.tsx - New HR-IMS styled login
- [x] admin/layout.tsx - Updated sidebar styling

## 📁 Files Modified
| File | Change |
|------|--------|
| `frontend/app/globals.css` | +HR-IMS tokens |
| `frontend/components/ui/Button.tsx` | +glass variant |
| `frontend/components/ui/Card.tsx` | +glass/gradient variants |
| `frontend/components/ui/Input.tsx` | Dark theme styling |
| `frontend/components/ui/Badge.tsx` | Dark theme styling |
| `frontend/app/login/page.tsx` | Complete rewrite |
| `frontend/app/admin/layout.tsx` | Sidebar restyle |

## ⚠️ Breaking Changes
NONE - all changes are additive or new pages.

## 🧪 Testing
- `npm run build` passes
- Login page renders correctly
- Admin sidebar looks good
- Existing pages still work (backwards compatible)

## 📋 What's Next (Your Tasks)
1. Review the implementation
2. Integration testing across all pages
3. Decide on rollout strategy
4. Merge to main or continue with more pages?

## 🔗 References
- CodeX handoff: `project-log-md/claude_code/handover-codex-20260213-2000.md`
```

---

## Phase 5: Claude Code Integrates & Tests

**Claude Code** reviews, tests, and merges.

### Claude Updates PROJECT_STATUS.md:
```markdown
## ✅ Recent Completions
- [2026-02-13 21:00] kimi_code: Frontend implementation complete
- [2026-02-13 20:00] codex: Backend review complete
- [2026-02-13 19:30] claude_code: Integration plan complete

## 🚧 In Progress
- claude_code: Integration testing and merge

## 📋 Backlog
- [ ] Migrate remaining admin pages (future sprint)
```

### Claude Completes Integration
- Tests all pages
- Fixes any integration issues
- Merges to main branch

**Creates**: `project-log-md/any/handover-claude_code-20260213-2200.md`

```markdown
---
from_agent: claude_code
to_agent: any
timestamp: 2026-02-13T22:00:00+07:00
project: skn-app
branch: main
commit: jkl012
status: completed
---

# ✅ Mission Complete: HR-IMS UI Integration

## Summary
Successfully integrated HR-IMS dark theme UI into skn-app.

## ✅ All Tasks Complete
- [x] Kimi: Analysis and documentation
- [x] Claude: Architecture and planning
- [x] Kimi: Frontend implementation
- [x] CodeX: Backend verification
- [x] Claude: Integration and merge

## 📦 Deliverables
- New HR-IMS themed login page
- Updated admin sidebar with dark theme
- Glass morphism component variants
- Backwards compatible with existing UI

## 🎉 Ready for Use
The new HR-IMS UI is now available at:
- `/login` - New dark themed login
- `/admin` - Updated admin dashboard
```

---

## Timeline Summary

| Time | Agent | Action |
|------|-------|--------|
| 18:00 | Kimi | Analyzes HR-IMS, creates docs |
| 18:00 | Kimi | → Hands off to Claude |
| 19:30 | Claude | Creates integration plan |
| 19:30 | Claude | → Hands off to Kimi + CodeX |
| 19:30 | Kimi + CodeX | Parallel implementation |
| 20:00 | CodeX | Completes (nothing needed) |
| 20:00 | CodeX | → Hands off to Claude |
| 21:00 | Kimi | Completes frontend |
| 21:00 | Kimi | → Hands off to Claude |
| 22:00 | Claude | Integrates, tests, merges |
| 22:00 | Claude | → Mission complete |

**Total Time**: 4 hours across 4 agents working in parallel.

---

## Key Points

1. **Each agent has clear scope** - No overlap, no confusion
2. **Handoff files are detailed** - Context, tasks, references included
3. **PROJECT_STATUS.md is live** - Everyone knows current state
4. **Parallel work when possible** - Kimi and CodeX work simultaneously
5. **No breaking changes** - Backwards compatibility maintained
6. **Clear ownership** - Each file/task has one owner

---

*This is how cross-platform agent collaboration works!*
