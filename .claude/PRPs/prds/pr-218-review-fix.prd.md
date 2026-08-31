# PRD — PR #218 debt-mediation review fixes

**Created:** 2026-08-31  
**Source findings:** `.claude/PRPs/findings/pr-218-debt-mediation-findings.md`  
**Branch:** `fix/pr-218-review-fixes` (from `feat/liff-debt-mediation`)  
**Type:** Bugfix / hardening (no new product surface)

---

## Problem

Nine independent reviews of PR #218 found **0 Critical** and several **High** defects in the LIFF ขอแก้หนี้ write path. CI is green on the current PR but green tests miss the failing contracts: a `1e20` amount 500s against `Numeric(14,2)`, switching ลูกหนี้→เจ้าหนี้ persists a leftover issue label, the phone field truncates valid `+66` / dashed numbers, and a failed province fetch looks like the user skipped the field.

These land on a **public** `POST /api/v1/liff/debt-mediation` (rate-limited `liff-submit`) that will become the Google Form replacement. They must be fixed before merge.

## Why now

- Overflow → unhandled 500 is an availability bug on a citizen form.
- Stale `issue_category` stores the wrong dispute type for staff who will later read the row.
- Phone truncation makes the documented 9–15 / `+66` contract unreachable from the UI.
- Silent province failure trains users to think the form is broken-required.

## In scope

Accepted High F01–F08 and accepted Medium F09–F19 from the findings file. Edit the unapplied migration `b8c9d0e1f2a3` in place (PR not merged; table not on prod).

## Out of scope (findings Deferred)

Admin list UI, rich-menu entry, audit-log on LIFF create, dropping `LIFF_STRICT_MODE` body fallback, Radix dialog rewrite, `next/head`, enum-class consolidation, TestClient 429 for this route, CHECK constraints, PEP8-only import shuffle.

## Success

- API 422s (not 500) on oversized / sub-cent / non-allowlisted / overlong payloads.
- Switching submitter cannot submit a cross-path issue; server rejects it too.
- UI accepts dashed local numbers and `+66…` up to 15 digits.
- Province fetch failure shows Thai error, not `Connecting...`.
- Schema tests assert `ValidationError`; invalid token does not `db.add`.
- 201 body has no raw LINE user id.
- Scoped pytest + vitest + `tsc --noEmit` green.
