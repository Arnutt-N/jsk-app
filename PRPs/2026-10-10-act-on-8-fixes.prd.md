# PRD: Fix 8 Act-On findings from whole-codebase interrogate (2026-10-10)

## Goal
Fix the 8 verified critical findings (C1, D4, B1, A1, A3, A2, C2, D1) from the
2026-10-10 adversarial review, one at a time, each with a failing-first
regression test and a green suite at the end. No behavior change beyond each
fix. No auto-merge.

## Scope (in fix order)
1. C1 phone-claim PII disclosure — DECIDED: masked-presence reply
   (found/not-found, no exact count) + staff-assisted linking. No auto-bind,
   no detail disclosure. (OTP rejected: SMS cost/scope.)
2. D4 LIFF attachment stored phishing — accept media ids only, resolve + verify
   ownership server-side, generate serving URLs server-side.
3. B1 forgeable webhooks — enforce LINE_CHANNEL_SECRET + LINE_CHANNEL_ACCESS_TOKEN
   in production guards.
4. A1 Redis always down — fix awaited sync `from_url` factory.
5. A3 broadcast double-send — atomic conditional status transition + fix the two
   docstrings that assert a guard that does not exist.
6. A2 failed push reported as success — return non-success, skip count/SLA
   updates, surface MESSAGE_FAILED; frontend must honor it.
7. C2 dead /uploads media links — migrate LINE/operator media into MediaFile
   served by /api/v1/media/{id}.
8. D1 /permissions/me gate — gate on any authenticated user; keep the matrix
   endpoints admin-gated.

## Out of scope
Consider/Noted/Dismissed items from the verdict. New features. Any change not
required by the 8 fixes.

## Acceptance
- Each fix has a committed regression test observed FAIL before and PASS after.
- Backend suite green at the end (focused suites per fix + full run).
- Frontend unit suite green if frontend files change (A2).
- One PR from fix/act-on-8-interrogate with failing-test-then-fix commit order.
