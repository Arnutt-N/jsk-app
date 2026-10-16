# Todo — PR #259 review (poteto-mode Investigation, read-only)

Playbook steps (verbatim from playbooks/investigation.md):
- [x] 1. Route through the how skill. For motivation questions, also route through the why skill.
- [x] 2. Throughput checkpoint stays one line: throughput checkpoint: n/a, read-only investigation.
- [ ] 3. Produce the how-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
- [ ] 4. Apply the unslop skill to the reply.

Task todos:
- [x] R1. Two independent read-only reviewers fan out (correctness; tests/contracts), structured findings
- [x] R2. Parent verifies committed diff == validated diff, checks reviewer findings against code
- [x] R3. Verdict: merge / merge-with-followups / needs-changes, with cited evidence
- [ ] skip deslop: no working-tree edits by me in this task, nothing to clean
- [ ] skip no-comments: read-only review produces no code comments to audit
