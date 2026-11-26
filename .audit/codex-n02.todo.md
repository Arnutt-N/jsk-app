# Codex N02 — rich-menu assignment data for VIEWER

Goal. Keep VIEWER on catalog and preview reads, remove per-person rich-menu assignment lookup and raw LINE id from that role's surface. Smallest change.

- [x] Reproduce current VIEWER access to `GET /rich-menus/{id}/users/{line_user_id}`.
- [x] Trace gateway and response shape. Runtime proof: VIEWER reaches handler (404 only from missing fixture).
- [x] Architect: one-line dependency swap to `require_permission(KEY_MANAGE_RICH_MENUS)`.
- [ ] Write failing test first with isolated FastAPI app and fake policy, avoiding external DB refresh.
- [ ] Implement at the route dependency.
- [ ] Verify original repro now returns 403 and staff still reaches handler.
- [ ] Deslop, commit, open PR.
- [ ] Independent correctness review before merge.
- skip: benchmark. No number was measured.
- skip: frontend changes. No GET caller exists.
- Baseline note: `tests/test_rich_menu_peruser_endpoints.py` fails 10/14 on `main` in this environment because permission refresh connects to unavailable local PostgreSQL and denies all. Pre-existing, unrelated to N02.
