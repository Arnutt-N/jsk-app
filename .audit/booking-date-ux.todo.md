# Booking date UX — Feature todolist (poteto-mode Feature playbook steps verbatim first)

- [x] `how` over the affected subsystem.
- [x] `architect` for parallel design exploration.
- [ ] Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
  - [ ] Blocking first steps. Gates run before fan-out.
  - [ ] Independent workstreams. Disjoint files, services, or layers parallelize. Shared writes serialize.
  - [ ] Shared mutable state. Default to splitting the target (the separate-before-serializing-shared-state principle skill). Serialize only for real invariants.
  - [ ] Smallest safe decomposition. If one worker is best, name why.
- [ ] Delegate code-writing to a subagent using your configured feature model (default in poteto-mode's Models section) with a specific scope (file paths, named data shape and its organizing structure per principle-model-the-domain, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the arena skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. Give every file-writing delegate its own worktree (spawn it with `isolation: "worktree"`, or hand it an exclusive branch), and do not write files or run a suite in a worktree a delegate still holds. On Claude Code, `isolation: "worktree"` branches from the remote default branch unless the `worktree.baseRef` setting is `"head"`. When the delegate builds on commits the default branch lacks, commit them, create its worktree with `git worktree add <path> -b <delegate-branch> HEAD`, and name that base commit in the brief. Fencing a file in the brief's prose is not a lock (principle-separate-before-serializing-shared-state). Comments per Comments. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
- [ ] Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
- [ ] Rebase into small, ordered commits. Stack follow-ups. Use the sequence-verifiable-units principle skill, building, verifying, and committing each small unit before the next.
- [x] If the design is contested, `interrogate` before shipping. (skip: design agreed with user via AskUserQuestion, not contested)
- [x] Run Opening a PR. (PR #260, ready, no babysit per playbook)
- [x] No-comments triage (2026-10-16): sicko proposed deleting all 47 added comment blocks + 9 structural refactors. Owner verdict: KEEP all prose (module docs encode single-writer ownership, fail-open policy, TTL rationale, DB-ready roadmap — an agent copying nearest example needs them; deleting raises reader load). MUST-KILL refactors (unify isDateDisabled/getDayState, branded date types, branded RawServiceString/DisplayLabel) filed as follow-up, out of this PR scope.

## Task todos (booking fix, design B chosen)
- [ ] PRD short + PRP plan written and reviewed
- [x] User locked open decisions (2026-10-16): TTL 30 min; strip 7-day paging; 3-state legend open/full/closed-holiday; single DB-backed taxonomy shared by service-request + booking (DB-ready adapter now, endpoint + admin UI stacked follow-up). Steered impl agent; PRD/PRP updated (c7eaa63).
- [ ] Unit 1: lib/booking/draft.ts + tests (reducer, TTL, idempotent clear)
- [ ] Unit 2: lib/booking/service-mapping.ts + mapping test
- [ ] Unit 3: components/liff/booking/DateSection.tsx (strip-first + affordances)
- [ ] Unit 4: page.tsx rewire (parallel boot, SectionClearHeader per block)
- [ ] Verify: vitest + build + manual LINE-width check
- [ ] no-comments + deslop before review, open PR
