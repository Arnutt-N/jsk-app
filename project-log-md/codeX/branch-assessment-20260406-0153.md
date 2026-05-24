# Branch Merge Assessment - 2026-04-06 01:53

Agent: CodeX (Codex GPT-5)  
Branch evaluated from: `main` at `252a1e2`

## Objective
Assess the 5 local branches that are still `--no-merged` into `main` and recommend one of:
- merge
- close
- cherry-pick

## Method
- Checked `git branch --no-merged main`
- Reviewed branch commit lists and `git show --stat`
- Used `git cherry -v main <branch>` to detect duplicate/equivalent patches
- Spot-checked current `main` for key fixes already present

## Recommendation Summary

### 1. `chore/design-system-non-live-chat-followup`
**Recommendation:** Close

**Why**
- Only 1 commit: `ceb7a4a` from `2026-02-16`
- Touches 4 admin pages only:
  - `frontend/app/admin/analytics/page.tsx`
  - `frontend/app/admin/audit/page.tsx`
  - `frontend/app/admin/auto-replies/page.tsx`
  - `frontend/app/admin/requests/page.tsx`
- This branch predates the later March admin/UI work and current `main` has already moved on substantially.
- Merging now would re-open old page-level refactors from a stale base rather than bring in a clear missing feature.

**Notes**
- Keep only as historical reference if someone wants to compare earlier design-token direction.

### 2. `chore/rename-agent-to-agents`
**Recommendation:** Close

**Why**
- 2 commits ahead of `main`
- `git cherry -v main chore/rename-agent-to-agents` shows:
  - `aa232ef chore(agents): rename .agent hub to .agents` is already equivalent on `main`
  - `f3eefd7 chore(agents): clean swarm example formatting` is still unique, but it is documentation/agent-state churn only
- Remaining unique diff is not product code and spans agent docs/state formatting across hundreds of files.

**Notes**
- No merge value for application behavior.

### 3. `feat/ui-workflow-audit`
**Recommendation:** Close the branch; do not merge directly

**Why**
- 9 commits ahead of `main`
- Huge stale branch from `2026-03-15` to `2026-03-21`
- Includes product code, migrations, tests, handoff artifacts, and PR investigation docs all mixed together
- Direct merge risk is high because current `main` has already diverged significantly after landing redesign, CI fixes, production perf work, and Frankfurt migration

**Important finding**
- Many of the branch's headline fixes are already present on current `main`, including:
  - `frontend/lib/authFetch.ts`
  - `frontend/components/admin/PageAccessGuard.tsx`
  - media upload 10MB limit in `backend/app/api/v1/endpoints/media.py`
  - `SUPER_ADMIN` password restriction in `backend/app/api/v1/endpoints/admin_users.py`
  - workload `GROUP BY` query in `backend/app/api/v1/endpoints/admin_users.py`
  - future validation for `scheduled_at` in `backend/app/services/broadcast_service.py`
  - `422` invalid date handling in `backend/app/api/v1/endpoints/admin_reports.py`
  - timezone-aware `datetime.now(timezone.utc)` usage
  - integration update preserving existing `api_key` / `headers`
  - scoped refollow counts in `backend/app/api/v1/endpoints/admin_friends.py`

**If a regression appears later**
- Review these commits as reference only, then re-implement selectively on a fresh branch:
  - `896173d`
  - `c851d19`
  - `a80e4e2`
  - `292bdbb`

**Do not**
- merge the full branch
- cherry-pick the whole feature stack

### 4. `feat/ux-redesign`
**Recommendation:** Close

**Why**
- 2 commits ahead of `main`
- The big redesign commit `8f762f1` overlaps with later landing/login/admin UI changes already made elsewhere
- The smaller fix commit `b5e1887` is effectively already reflected on `main`

**Spot checks on current `main`**
- `bg-danger/10` already present in `frontend/app/admin/auto-replies/[id]/page.tsx`
- `bg-success` already present in `frontend/app/admin/chatbot/page.tsx`
- `bg-offline` already present in `frontend/components/admin/BotStatusIndicator.tsx`
- `bg-border-hover` already present in `frontend/app/admin/live-chat/_components/TypingIndicator.tsx`
- `hover:bg-border-hover` already present in `frontend/app/admin/live-chat/_components/ChatArea.tsx`

**Notes**
- No immediate cherry-pick needed.

### 5. `fix/backend-connection-startup-hints-oldbase`
**Recommendation:** Close

**Why**
- Exact same tip SHA as `chore/rename-agent-to-agents`:
  - `f3eefd7aac777262224b394fe1a8d1efcbbe78a9`
- The branch name is misleading; it does not currently represent unique startup-hints work.
- Actual startup-connection improvement work was handled separately and newer fixes are already on `main`.

## Final Recommendation

### Merge
- None

### Cherry-pick now
- None required

### Close
- `chore/design-system-non-live-chat-followup`
- `chore/rename-agent-to-agents`
- `feat/ui-workflow-audit`
- `feat/ux-redesign`
- `fix/backend-connection-startup-hints-oldbase`

## Note For Claude Code
- Treat all 5 branches as stale or duplicate.
- If anything must be recovered, recover by re-implementing from the referenced commit(s) on a fresh branch rather than merging old history.
