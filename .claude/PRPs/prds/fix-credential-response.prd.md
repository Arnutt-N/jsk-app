# PRD — Fix CredentialResponse 500 on all credential CRUD routes

**Status:** READY-TO-EXECUTE
**Author:** Claude Fable 5 (planner) — 2026-07-15
**Implementer:** Claude Sonnet 5 · **Reviewers:** Fable 5 (code), Opus 4.8 (PR)
**Branch:** `claude/project-status-pending-nyb3xs` (== main @ `d1c8039`)
**Origin:** pre-existing bug found + verified during PR #131 (see
`docs/remediation/preflight-evidence-and-designs.md` §4.1 follow-up flag; Opus
reproduced it on unmodified code).

## Problem (verified 2026-07-15)

Every route in `backend/app/api/v1/endpoints/admin_credentials.py` that returns
`CredentialResponse` — list (line 36), create (68), get (106), update (136),
set-default (219) — calls `CredentialResponse.model_validate(credential)` on a bare
ORM object and raises `ValidationError` → HTTP 500, because:
1. Schema field `metadata` (from `CredentialBase`, `schemas/credential.py:16`)
   resolves via `from_attributes` to `credential.metadata` = SQLAlchemy's
   `Base.metadata` registry (a `MetaData` object, not a dict) — the ORM maps the
   JSONB column as attribute `metadata_json` (`models/credential.py:21`).
2. `credentials_masked: str` (schemas/credential.py:34) is required but the ORM has
   no such attribute; endpoints assign it only AFTER the failing line.

Effect: the credential management API is fully broken (500 on list/create/get/
update/set-default). delete and verify don't build this response and still work.

## Fix (FR1) — `backend/app/schemas/credential.py` only

1. `CredentialBase.metadata`: add
   `Field(default=None, validation_alias=AliasChoices("metadata", "metadata_json"), serialization_alias="metadata")`
   (import `AliasChoices` from pydantic) + `model_config` needs
   `populate_by_name=True` where required so:
   - ORM validation reads `metadata_json` (from_attributes path),
   - JSON clients keep sending/receiving `"metadata"` (CredentialCreate/Update
     input parsing must keep accepting `"metadata"` — verify with a test),
   - response serializes as `"metadata"`.
   Verify `CredentialUpdate.metadata` (independent definition, line 26) gets the
   same treatment IF it's ever populated from ORM (it isn't — client input only;
   leave it as-is unless tests show otherwise, but confirm `"metadata"` key still
   parses).
2. `credentials_masked: str = ""` (default empty) so `model_validate` succeeds;
   endpoints keep assigning the real mask right after (existing code, unchanged).

Do NOT touch the endpoint file (the assignment pattern works once validation
passes) — unless a one-line change is strictly required; justify any deviation.

## FR2 — Tests: new `backend/tests/test_credential_schema.py` (or extend the P0.3
audit test file if more natural)

1. `CredentialResponse.model_validate(<real Credential ORM instance>)` succeeds;
   `metadata` == the ORM's `metadata_json` value; `credentials_masked` == "".
2. Endpoint-level: `create_credential` and `get_credential` (direct-coroutine +
   fake/real db per the repo's established idiom) return 200/201-shaped data with
   `credentials_masked` populated and `metadata` correct — no ValidationError.
3. Input compatibility: `CredentialCreate.model_validate({"name": ..., "provider":
   "LINE", "metadata": {...}, "credentials": {...}})` still parses `metadata` from
   the JSON key `"metadata"`.
4. **Update the two P0.3 audit tests** in `test_admin_audit_endpoints.py` that
   currently tolerate the ValidationError (`test_create_credential_writes_one_audit_row`,
   `test_update_credential_redacts_secret_value`) — they must now assert clean
   success end-to-end (no expected-exception scaffolding).

## FR3 — Docs

`docs/remediation/preflight-evidence-and-designs.md` §4.1: mark the
CredentialResponse follow-up as FIXED with this PR's reference.

## Non-Goals

- No renaming of the DB column or ORM attribute (schema migration = out of scope).
- No change to mask format or credential_service.
- No new fields.

## Acceptance Criteria

- [ ] All five previously-500 routes return successfully against a real Credential
      ORM object (schema-level + endpoint-level tests prove it).
- [ ] JSON clients' `"metadata"` key still works for create/update input.
- [ ] Full backend suite: 617 baseline + new tests, 0 failures; the two adjusted
      audit tests assert clean success.
- [ ] `git diff --check` clean; commit convention; no model IDs.
