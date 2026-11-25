# Codex N01 — VIEWER read-only policy

Goal. Make VIEWER stay read-only when `permission_settings` is edited. Smallest change.

- [ ] Reproduce the override on the real permission resolver with a synthetic policy.
- [ ] Trace the cause and confirm the surviving mechanism with runtime evidence.
- [ ] Plan a fix that keeps interfaces and state semantics. Security change, so run architect and independent correctness review.
- [ ] Write the failing regression test first.
- [ ] Implement at the policy resolution boundary and the settings write boundary.
- [ ] Verify the original repro passes and run the relevant suites.
- [ ] Open PR.
- skip: full codex backlog. Scope is N01 only.
- skip: benchmark. No number was measured.
