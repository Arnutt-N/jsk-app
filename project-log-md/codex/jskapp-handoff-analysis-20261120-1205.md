# JskApp handoff analysis

This review checks whether the six fixes reported in the 20 November 2026, 12:05 Bangkok handoff support the intended user behavior. It recommends what to resolve and verify before release. The review examined the existing uncommitted changes on `docs/handoff-20261119-1410` at `d370364`. [Claude Code handoff](../claude_code/session-summary-20261120-1205.md), [Original findings](jskapp-codebase-review-20261119.md).

<!--
1. Route through the **how** skill. For motivation questions, also route through the **why** skill.
skip: The request is a correctness review of a handoff.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Apply the **unslop** skill to the reply.
Review requirements. Assess F1 to F6 and give evidence, impact, and acceptance checks in one Markdown file.
Review plan. Compare the handoff with the diff and tests, check reminder query semantics in isolation, then verify evidence links and repository state.
-->

## Overview

**Recommendation. Hold release of the combined changes.** The source shows three high-priority problems. A citizen can finish a second case and receive the first case as the response. Editing a booking while email is disabled can erase the saved address. A reminder worker can use an outdated booking status after rereading it. Resolve these before treating the six fixes as closed.

| Handoff item | Assessment | Next verification |
| --- | --- | --- |
| F1. Upload while submitting | Submit guards are present in all three forms. | Check the flow in LINE on a phone with a slow upload. |
| F2. Booking reminders | Status refresh can reuse an old booking. Provider results also need clearer classification. | Run a two-session check with a cancelled booking and test provider outcomes at the scheduler boundary. |
| F3. Broadcast cancellation | The database update blocks cancellation after sending starts. A stale page can still show a generic failure after sending completes. | Confirm that both in-progress and completed broadcasts refresh the status shown to staff. |
| F4. Duplicate case retry | Server replay is present. The wizard reuses its identifier for a deliberate new case. | Submit two separate cases from the same wizard and retry one after a lost response. |
| F5. Clear account email | The server distinguishes an omitted address from an explicit clear and records the field name in the audit log. | Verify the saved record and audit entry through the normal admin request. |
| F6. Clear booking note | The note behavior is present. The same change can clear a hidden booking email. | Clear the note while email is disabled and verify that the saved address survives. |

## High-priority findings

### P1. The wizard treats a new case as a retry of the previous case

The multi-step LINE form creates an identifier only when its reference is empty. After a successful submission, **Submit a new case** resets the wizard and leaves that reference populated. A second submission can return the original case even when the citizen has entered different details. The server tests use different identifiers for different cases, so they do not cover the wizard reusing its identifier. [Identifier assignment](../../frontend/app/liff/service-request/page.tsx#L310), [Wizard reset](../../frontend/app/liff/service-request/page.tsx#L359), [New-case button](../../frontend/app/liff/service-request/page.tsx#L424), [Server replay](../../backend/app/api/v1/endpoints/liff.py#L238), [Different-identifier test](../../backend/tests/test_liff_service_request_idempotency.py#L172).

**Recommendation.** Rotate the identifier when the citizen starts a new case. Reuse it when repeating the same submission after an uncertain response. Define what happens if the citizen edits the form after such a response. A repeated identifier with different case content should produce an explicit conflict or a recovery prompt. Before release, verify that a deliberate second case gets a new case number and one uncertain retry leaves a single saved case.

### P1. Clearing a booking note can remove the saved email

The booking form sends `email: null` when its email option is disabled. The update endpoint now passes the fields the form included, and the service interprets that null as an explicit clear. A citizen can erase a saved address while changing a note or phone number. The existing service tests cover omission and explicit values, but the disabled-email form sends the field. [Client payload](../../frontend/app/liff/booking/page.tsx#L56), [Booking edit call](../../frontend/app/liff/booking/page.tsx#L493), [Field presence](../../backend/app/api/v1/endpoints/liff_bookings.py#L318), [Service assignment](../../backend/app/services/booking_service.py#L541), [Email and note tests](../../backend/tests/test_admin_bookings_email.py#L268).

**Recommendation.** Omit email from an edit when the field is hidden. Reserve an explicit clear for an intentional edit of a visible field. Check both staff and citizen editing because the service is shared. Verify that clearing a note with email disabled preserves the stored address, and that an intentional email clear still works.

### P1. The reminder check can read the booking status it already held

The due query returns booking objects, and the scheduler keeps the original list while it works through the IDs. The database session keeps loaded values across commits. The reload issues another query for the same booking without refreshing previously loaded attributes. A cancellation committed after the claim can therefore leave the worker reading `CONFIRMED` from its existing object. The cancellation test supplies a cancelled object through a mock, so it bypasses this query behavior. In a separate in-memory SQLAlchemy check with two sessions, a plain select returned the held `CONFIRMED` value after cancellation. An explicit refresh returned `CANCELLED`. [Session settings](../../backend/app/db/session.py#L19), [Due booking query](../../backend/app/services/booking_service.py#L580), [Scheduler reload](../../backend/app/tasks/booking_reminder.py#L100), [Booking reload query](../../backend/app/services/booking_service.py#L602), [Mocked cancellation test](../../backend/tests/test_booking_reminder.py#L359).

**Recommendation.** Select only IDs for the due batch or explicitly refresh the booking and required fields on reload. Validate that the worker still owns the claim before sending. Use two real database connections to cancel after the claim commit and before the reload. Assert that the recipient receives no reminder. A cancellation after the final check remains a timing risk to document.

## Follow-up findings

**Reminder delivery outcomes.** The handoff distinguishes a definite failure from an unknown result, but the email helper returns false for every send exception, including a possible timeout after the receiving server accepts a message. The scheduler can retry such an email. Conversely, the LINE circuit breaker can reject a message before making a provider call, and the notification layer classifies the exception as unknown. The scheduler then marks it sent. Distinguish a pre-send failure, provider rejection, accepted delivery, and unknown result at the provider boundary. Record unknown outcomes separately from confirmed deliveries. Test timeouts, a circuit breaker that blocks a call, and a worker that loses its claim before finalizing. The report in the handoff also correctly identifies a duplicate risk if a process stops between provider acceptance and finalization. [Email helper](../../backend/app/services/booking_email.py#L85), [LINE circuit breaker](../../backend/app/services/line_service.py#L160), [Notification classification](../../backend/app/services/booking_notifications.py#L94), [Scheduler finalization](../../backend/app/tasks/booking_reminder.py#L121).

**Broadcast status after a late cancellation.** The conditional database update prevents a cancellation from overwriting a send already in progress. A request that loads a completed or failed broadcast takes the initial validation branch and returns 400. The detail page refreshes only on 409. Treat any transition that makes the displayed cancellation action stale as a refresh condition and show the current status to staff. Verify when the sender finishes between page load and cancellation. [Cancellation service](../../backend/app/services/broadcast_service.py#L317), [Response mapping](../../backend/app/api/v1/endpoints/admin_broadcast.py#L313), [Detail page handling](../../frontend/app/admin/chatbot/broadcast/%5Bid%5D/page.tsx#L139).

**Attachment and account-email checks.** The active-upload guard is in each final submit path. The focused tests check that the request waits and eventually includes the attachment. Test the flow on a phone in LINE and show an upload status before the first submit attempt. The account email code distinguishes null from omission and tests both with a simulated session. A request against a test database should verify the saved null and corresponding audit entry. [Wizard upload test](../../frontend/app/liff/service-request/__tests__/upload-submit-guard.test.tsx#L89), [Single-page confirm test](../../frontend/app/liff/service-request-single/__tests__/upload-submit-guard.test.tsx#L109), [Request-v2 upload test](../../frontend/app/liff/request-v2/__tests__/upload-submit-guard.test.tsx#L78), [Account email update](../../backend/app/api/v1/endpoints/admin_users.py#L436), [Account email tests](../../backend/tests/test_admin_users.py#L337).

## Release and evidence

1. Resolve the three high-priority findings. Run each acceptance check on the combined revision, including the new case lifecycle and the saved booking data.
2. Include both database migrations with the reviewed changes. The case migration depends on the reminder migration. The deployment workflow already makes backend deployment depend on the migration job. Verify that dependency in the release run. Plan the scheduler transition so old and new workers do not process reminders under different claim rules during rollout. [Reminder migration](../../backend/alembic/versions/f0a1b2c3d4e6_booking_reminder_claim_lease.py#L23), [Case migration](../../backend/alembic/versions/z2a3b4c5d6e7_service_request_submission_id.py#L15), [Deployment dependency](../../.github/workflows/cd.yml#L335).
3. Repeat the targeted and full tests against one immutable candidate revision. Capture exact pass, fail, and skip counts. Get an independent correctness verdict after the corrections and run the phone check with a test account.

The test counts and local migration success in the handoff are reported by the previous session. This review verified source paths and test coverage by inspection, checked the database migration dependency in the deployment workflow, and ran the isolated SQLAlchemy check described above. It did not rerun the application suites or contact LINE, PostgreSQL, or the deployed service. The read-only second review corroborated the wizard identifier and hidden email findings. The review adds only this Markdown report.
