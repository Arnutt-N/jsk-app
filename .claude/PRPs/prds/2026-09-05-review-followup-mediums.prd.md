# PRD — Review Follow-ups: webhook lock release + update_user role guard

> **Status**: READY (self-reviewed) · **Date**: 2026-09-05 · **Branch**: `fix/webhook-lock-and-role-guard`
> **Source**: two Medium follow-ups deferred by the 2026-09-02 codebase-review-fix pipeline (PR #222),
> re-verified still present in code on 2026-09-05.

## Problem Statement

Two known defects remain on critical paths:

1. **Duplicate LINE-message processing** (webhook): when two deliveries of the same event race
   for the processing lock, the loser's cleanup path deletes the **winner's** lock while the
   winner is still processing — so a third delivery can acquire the lock and process the same
   event again (duplicate replies / duplicate service requests).
2. **Permission gap on user updates** (admin console): editing an account WITHOUT sending the
   `role` field (profile edit / enable-disable) skips the target-role permission check, so an
   ADMIN can modify DIRECTOR/HEAD accounts (name, email, activation) despite being barred from
   managing those roles when the role field IS sent.

## Solution

1. The webhook lock is released only by the invocation that acquired it; a lost race or a
   Redis outage never touches anyone else's lock.
2. Every user update first checks that the caller may manage the target's **current** role —
   with the natural exception that users may always edit their own account.

## User Stories

1. As a citizen messaging the LINE OA, I want each message processed exactly once, so that I never get duplicate replies or duplicate requests.
2. As an admin, I want my edits to other people's accounts always permission-checked, so that the role hierarchy cannot be bypassed by omitting a field.
3. As an ADMIN, I want to still edit my own profile, so that the guard does not over-reach.
4. As a SUPER_ADMIN, I want to manage every role as before, so that nothing legitimate breaks.
5. As a maintainer, I want both fixes covered by tests that name the exact failure mode, so that neither regresses.

## Implementation Decisions

1. Webhook (`process_webhook_events`): track per-event whether this invocation **acquired** the
   lock (tri-state already returned by the Redis wrapper). The `finally` block releases only
   when the lock was actually acquired — the `continue` paths (lock lost, Redis down) still run
   `finally`, which is exactly how the winner's lock was getting destroyed. `RedisClient.delete`
   already swallows Redis errors, so release cannot crash the batch loop.
2. `update_user`: check `_check_role_permission(current_admin, user.role)` on EVERY update when
   the target is not the caller. Self-edits skip the check (a user may always edit themselves;
   self role-change and self-deactivation were already separately blocked). The now-redundant
   current-role check inside the role-change branch is removed.
3. No schema, no API contract, no permission-policy change; backend-only, frontend untouched.

## Testing Decisions

- Tests name the failure mode, not internals: "loser does not delete the winner's lock",
  "winner releases own lock", "Redis-down fails open without deleting", "ADMIN profile-PUT on
  DIRECTOR is 403", "ADMIN self profile-PUT is 200", "SUPER_ADMIN profile-PUT on DIRECTOR is 200".
- Webhook tests reuse the existing mock-redis fixture in `test_webhook_deduplication.py`.
- User tests follow the TestClient + dependency-overrides pattern already used in
  `test_admin_users.py` (override `get_db` + `get_current_user`; DEFAULT_POLICY supplies
  manage_users for ADMIN/SUPER_ADMIN).

## Out of Scope

- Token-based (Lua compare-and-delete) lock release guarding the theoretical TTL-expiry race —
  the 5-minute TTL vs per-event processing makes this academic; noted for future hardening.
- Permission-matrix redesign; audit-log changes.

## Further Notes

Both defects were documented in `session-summary-20260902-1758.md` pending list and re-verified
in code (webhook.py finally-block; admin_users.py role branch gated on `body.role is not None`).
