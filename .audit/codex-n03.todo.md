# Codex N03 — viewer search on private contact fields

Goal. VIEWER search must not depend on phone or email values that are masked in its response. Smallest change at the query boundary for requests and bookings.

- [x] Reproduce search condition use of private contact fields on VIEWER list paths.
- [x] Architect before editing: privacy boundary and query shape change.
- [x] Write failing tests first with synthetic query capture.
- [x] Implement role-aware search field selection.
- [x] Verify staff search unchanged and VIEWER result independent of hidden contacts.
- [x] Deslop, commit, open PR.
- [ ] Independent correctness review before merge.
- skip: benchmark. No number was measured.
- skip: frontend changes unless field labels must change.
