# JskApp codebase review

This review identifies defects that affect staff or citizens and recommends changes with clear acceptance checks. It uses the checkout at `d370364`, whose tracked files matched the locally stored `origin/main` revision `888ea90` when the review began.

<!-- Investigation requirements and plan, self-reviewed before report drafting.
Product requirements. Provide one Markdown report with prioritized findings, source evidence, practical recommendations, and verification limits. Maintain the existing application files.
Implementation plan. Inspect the handoff and repository graph, trace selected paths through their callers and storage, check existing coverage, and validate the report links and tracked-file status.
[x] 1. Route through the **how** skill. For motivation questions, also route through the **why** skill.
skip: The user requested a defect review and recommendations.
[x] 2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
[x] 3. Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
[x] 4. Apply the **unslop** skill to the reply.
-->

## Overview

Fix attachment submission first. Citizens can receive a success message while the case is missing a file they selected. Next, make booking reminder outcomes and broadcast cancellation reflect what the system actually did. The account email and booking note findings share a smaller problem. Both forms send a request to clear a field, and both servers interpret the request as leaving it unchanged.

| Priority | Finding | Who is affected |
| --- | --- | --- |
| P1 | F1. Case submission can omit an upload in progress | Citizens and case officers |
| P1 | F2. Booking reminders can be lost after a temporary failure | Citizens waiting for an appointment |
| P2 | F3. A broadcast can continue after cancellation succeeds | Staff and broadcast recipients |
| P2 | F4. Retrying a case submission can create a duplicate | Citizens and case officers |
| P2 | F5. Staff cannot clear an existing account email | Staff managing accounts |
| P2 | F6. Citizens cannot clear an existing booking note | Citizens editing appointments |

P1 means the failure can silently lose information or a time-sensitive message. P2 means the failure can create misleading status, duplicate work, or prevent a specific edit. The review traced the paths below in the checkout. Occurrence rates and the live deployment were outside the review.

## How the workflows fail

### F1. A case can be saved before its attachment finishes uploading

All three LINE case forms add an attachment to form state after the upload response. The final submit reads the current form state and can finish before that update. The server saves the received attachment list, so a successful case can be missing the selected document. The in-progress counter limits how many files can be selected. The three submit functions do not consult it. [Request v2 upload](../../frontend/app/liff/request-v2/page.tsx#L159), [Request v2 submit](../../frontend/app/liff/request-v2/page.tsx#L215), [Wizard upload](../../frontend/app/liff/service-request/page.tsx#L199), [Wizard submit](../../frontend/app/liff/service-request/page.tsx#L289), [Single-page upload](../../frontend/app/liff/service-request-single/page.tsx#L179), [Single-page submit](../../frontend/app/liff/service-request-single/page.tsx#L239), [Case persistence](../../backend/app/api/v1/endpoints/liff.py#L240).

**Recommendation.** Show a visible upload status and prevent final submit until uploads settle. Apply the same guard inside all three submit handlers so pressing Enter or confirming a dialog respects it. Show a retry or removal choice for a failed attachment. Apply the wizard's file input reset to the other two forms so users can select the same file after an upload error. Verify with a delayed upload in each form. Once the upload succeeds, the saved case must contain the selected file. [Wizard reset and regression test](../../frontend/app/liff/service-request/__tests__/upload-retry.test.tsx#L46), [Request v2 cleanup](../../frontend/app/liff/request-v2/page.tsx#L179), [Single-page cleanup](../../frontend/app/liff/service-request-single/page.tsx#L197).

### F2. Booking reminders can be marked as sent before any channel accepts them

The scheduler sets and commits `reminder_sent_at` before delivery, which prevents two workers from sending the same reminder. The delivery function returns whether any channel succeeded, but the scheduler discards that result. If every channel fails or the worker stops after the commit, the next scheduler pass excludes the booking. A second timing issue uses the same flow. The initial selection checks that the appointment is confirmed, but the claim and reload do not repeat that status check. A cancellation between selection and claim can therefore still produce a reminder. [Due booking selection](../../backend/app/services/booking_service.py#L573), [Reload and claim](../../backend/app/services/booking_service.py#L585), [Reminder scheduler](../../backend/app/tasks/booking_reminder.py#L81), [Delivery result](../../backend/app/services/booking_notifications.py#L84).

**Recommendation.** Store a claim with an expiry separately from a confirmed delivery. Recheck appointment status and time when claiming and immediately before sending. Track the result per channel so a retry can target a failed channel without repeating an acknowledged delivery. Treat an unknown provider outcome separately from a confirmed failure. Verify with two workers, an all-channel failure, a worker interruption, and a booking cancelled before the claim or after the claim but before the delivery check.

### F3. A broadcast can continue after cancellation succeeds

The detail page offers cancellation for a scheduled broadcast. Its status can change between loading the page and confirming the action. The server accepts cancellation for a broadcast already in `SENDING` and saves `CANCELLED`. The sender continues after its earlier claim and records its own final status. Staff can see cancellation accepted even though messages continue to go out. [Cancel action in the detail page](../../frontend/app/admin/chatbot/broadcast/%5Bid%5D/page.tsx#L410), [Cancel request](../../backend/app/api/v1/endpoints/admin_broadcast.py#L303), [Send claim and delivery](../../backend/app/services/broadcast_service.py#L205), [Final sender status](../../backend/app/services/broadcast_service.py#L267), [Cancel write](../../backend/app/services/broadcast_service.py#L317).

**Recommendation.** Make cancellation conditional on the broadcast still being scheduled or a draft in the database when the update occurs. If sending already started, return a conflict and refresh the displayed status. The current UI already limits cancellation to the scheduled state, so the smallest change is to enforce that boundary at the write. Verify the outcome when cancellation wins and when sending wins.

### F4. A retry can create a second case after the first was saved

The case handler inserts and commits a new row. If the connection drops after that commit and before the citizen sees the response, the form reports an error and allows another submit. The handler has no request identifier that ties the retry to the original row. Staff can receive two open cases for one submission. [Form response and retry behavior](../../frontend/app/liff/request-v2/page.tsx#L235), [Shared request helper](../../frontend/lib/liff/submit-service-request.ts#L14), [Case insert and commit](../../backend/app/api/v1/endpoints/liff.py#L212).

**Recommendation.** Generate one submission identifier per form attempt and reuse it after an uncertain response. Persist it with the case under a database uniqueness constraint, scoped to the verified caller or submission session. Return the original case on a matching retry. Verify simultaneous requests with one identifier, a lost first response, and two deliberate submissions with different identifiers.

### F5. Clearing an account email appears to succeed and keeps the old address

The edit page sends `email: null` when staff erase the address. The server writes the address only when its value is non-null. The database allows a null email. The edit page shows success and reloads the old value. The audit comparison uses the same non-null condition. [Edit payload and success response](../../frontend/app/admin/users/%5Bid%5D/page.tsx#L133), [Server update](../../backend/app/api/v1/endpoints/admin_users.py#L438), [Email audit comparison](../../backend/app/api/v1/endpoints/admin_users.py#L469), [Nullable account email](../../backend/app/models/user.py#L55).

**Recommendation.** Use field presence to distinguish an omitted email from a supplied null. Keep uniqueness checks for a supplied address. Record the field name when the email is cleared. Verify both clear and omit against the saved account and the server response.

### F6. Clearing a booking note appears to succeed and keeps the old text

The booking form trims a blank note to null, including during an edit, and displays a success notice after saving. The server forwards the null value. The booking service assigns a note only when its value is non-null, so the original text stays on the booking. [Contact payload](../../frontend/app/liff/booking/page.tsx#L56), [Edit success](../../frontend/app/liff/booking/page.tsx#L493), [Server forwards note](../../backend/app/api/v1/endpoints/liff_bookings.py#L318), [Booking note update](../../backend/app/services/booking_service.py#L535).

**Recommendation.** Carry field presence from the update request into the service and persist null for an explicit clear. Keep the original note when the field is omitted. Verify by reopening the booking after clearing its note, then by editing an unrelated field on a booking that still has a note.

## Verification and coverage

The findings are based on source inspection of the account, case, booking, and broadcast paths above. The review checked the frontend request and the corresponding server write wherever both were relevant. Three existing user-list tests passed in Vitest with simulated server responses. They cover the default role when creating an account, clearing list filters, and opening edit mode. The findings' acceptance checks remain to be run after fixes. Production behavior was outside scope. Live chat, menus, permissions as a whole, and infrastructure need their own focused review. [User-list tests](../../frontend/app/admin/users/__tests__/page.test.tsx#L48).
