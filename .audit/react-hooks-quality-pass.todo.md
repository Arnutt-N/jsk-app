# Todo: pstack quality pass on the react-hooks sweep

Scope: `e6769f5..0fe03f0` on main (PRs #309, #310).

## 1. blast-radius — DONE
- [x] Read the change.
- [x] Find the one fact it's safe because of. -> "no cancelled guard discards an applied response"
- [x] Look where grep stops. -> found dispatch->saveDraft on render.
- [x] Be honest about each risk. -> 1 confirmed (level 4), 1 checked-benign.
- [x] Prove the one fact. -> safety-fact.test.tsx, 2 mounts pass.
- [x] For a big or wide change, run it as an arena. -> skipped: the one fact is already proven at level 4 by a run; an arena would re-answer a settled question.

## 2. babysit
- [ ] Declare the mode and resolve the forge before any poll.
- [ ] Work the merge frontier and nothing above it.
- [ ] One babysitter per stack.
- [ ] Never mutate stack topology.
- [ ] Order is conflicts, then review threads, then CI.
- [ ] Trust the active forge's verdict, not a green check list.
- [ ] Classify CI before any retrigger.
- [ ] Bugbot is triaged skeptically, always.
- [ ] Stop at the human's line.

## 3. interrogate
- [ ] Frame.
- [ ] Fan out.
- [ ] Verify each finding.
- [ ] Output.

## 4. thermos
- [ ] Determine the review scope.
- [ ] Gather the diff and file context.
- [ ] Launch both thermo subagents in the same message with run_in_background: true.
- [ ] Pass each subagent the same scoped diff context.
- [ ] After both finish, synthesize deduplicated.

## 5. correct — DONE
- [ ] Find the mistake classes.
- [ ] Fix each class at the highest level that works.
- [ ] Fix and prove.
- [ ] Keep the rule table.

## 6. deslop
- [ ] Check the diff against main and remove AI-generated slop.
