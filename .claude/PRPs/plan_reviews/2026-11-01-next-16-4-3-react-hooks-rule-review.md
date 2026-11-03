# Plan Review: next-16-4-3-react-hooks-rule

**Skill**: `prp-validate-plan` v2.0.0 (2026-10-25)
**Plan**: `.claude/PRPs/plans/2026-11-01-next-16-4-3-react-hooks-rule.plan.md` (v11, 891 lines)
**Source PRD**: `.claude/PRPs/prds/2026-11-01-next-16-4-3-react-hooks-rule.prd.md` (APPROVED 2026-11-01)
**Findings Input**: none
**Review Mode**: **single** — one independent reviewer per round, not two
**Reviewed**: 2026-11-01 → 2026-11-03 (11 rounds)
**Verdict**: **NOT READY** (gate incomplete)
**Confidence Score**: **5/10** — capped at 5 because the final round's review did not complete

## Why this is not a READY verdict

The skill requires two independent verdicts for READY. Over 11 rounds that was never reached:

- Rounds 1-7: dual review (sonnet + opus), all **FAIL**, all on real defects.
- Rounds 8-10: single review (opus), all **FAIL**, all on real defects.
- Round 11: the reviewer was terminated by an inference-gateway failure (503, `ENOTFOUND zenmux.ai`) — three attempts, three failures. Stopped at the user's direction.

A confidence cap of 5 is the skill's rule for `Review Mode: limited`. The plan is not failing on a known defect; it is failing the *gate*, because no final verdict exists.

## Round history

| Round | Rev | Reviewers | Verdict | Defect class found |
|---|---|---|---|---|
| 1 | v1 | sonnet + opus | FAIL | Invented counts, zero `SOURCE` refs, missing NOT-Building/Risks/GOTCHA, unrunnable commands, one shape assigned to effects it cannot fix |
| 2 | v2 | sonnet + opus | FAIL | `eslint-config-next` never actually bumped; `useSyncExternalStore` mandated against the PRD's own Non-Goal; `npx vitest` claim false |
| 3 | v3 | sonnet + opus | FAIL | Group headers contradicted tables; a file double-counted; `AvailabilityRange` has no `key`; ref written during render |
| 4 | v4 | sonnet + opus | FAIL | `rangeKey.service` is `string \| null` into a `string` param (TS2345); `rangeInfo` public contract would break; `outputUrl`/`clearOutput` unaddressed |
| 5 | v5 | sonnet + opus | FAIL | Wrong fetcher return type (`Slot[]` vs `Availability`); new state declared after `dispatch`; `clearOutput()` left in the effect; false eslint claim |
| 6 | v6/v7 | sonnet + opus | FAIL | Spinner and Thai error lost; `useOperatorRoster` AbortController dropped; S11 guard mismatched Step 3 |
| 7 | v8 | opus | FAIL | **Self-cancelling deadlock** (a `cancelled` flag in an effect whose body changes its own dep); read-only store replacing a toggleable checkbox; six stale `outputBlob` reads |
| 8 | v9 | opus | FAIL | **300 ms stale-blob window** in image-resize (buttons act on the previous blob while the UI shows the new dimensions); `suppressHydrationWarning` probed ineffective |
| 9 | v10 | opus | FAIL | Malformed snippet line (`setError(null)      try {`); circular `rangeStatus` evidence; **lint-proven non-converging Step 9 fallback** |
| 10 | v11 | opus | no verdict | gateway failure ×3 |

## What the rounds were actually worth

Nine of eleven rounds found a defect that would have shipped a bug:

| Defect | Would have | Caught by |
|---|---|---|
| Self-cancelling deadlock | `/liff/booking` spinner forever, slots never load | **mount probe** |
| 300 ms stale-blob window | Downloaded files whose dimensions and name disagree with their pixels | **mount probe** |
| Read-only `useSyncExternalStore` on `rememberMe` | Checkbox permanently untoggleable; remember-me silently dead | **mount probe** |
| Spinner-clear missing in the catch | Thai error shown behind an infinite spinner after a failed resize | **mount probe** |
| `string \| null` into `fetchAvailabilityRange` | `tsc` failure — the phase gate | `tsc` |
| Wrong fetcher return type | `tsc` failure | `tsc` |
| Dropped `latestSlotKeyRef` | Stale-response race in the booking flow | reading |
| Non-converging Step 9 fallback | Implementer stuck with a failing gate and no guidance | **eslint probe** |

**The lesson encoded in the plan.** Every one of those four mount-probe catches passed `npx eslint` with **zero errors**. The plan now carries a `Probing record` section that separates eslint verification from mount verification, and its VALIDATE lines point at `app/liff/booking/__tests__/page.test.tsx` — which mounts the store and would catch a deadlock recurrence.

## Residual state of the artifact

The plan at v11 is **891 lines**, with:

- 11 shapes (S1-S11), each lint-verified against the installed `eslint-plugin-react-hooks@7.1.1`, three of them additionally mount-verified
- Script-verified arithmetic: Group A 30/42 + B 9/9 + C 3/3 = **42 files / 54 errors**, no duplicates, no ungrouped file; Phase 1 40/48 + Phase 2 2/6
- Explicit "what must not change" lists for both risky files (`loadSlots`, `rangeInfo`, `dispatch`, `BookingStore`; `outputUrl`, `clearOutput`, the six `page.tsx` reads)
- A PRD whose shape table, phase split, risks and open questions match this plan

The outstanding risk is no longer a known defect — it is that round 11 never ran.

## Recommended next step

**Implement Phase 1 only.** It is 40 files / 48 errors of mechanical, individually-linted work, and it carries the CVE fix (`next@16.4.3`: 3 production criticals → 0). Phase 2's 2 files / 6 errors are the ones that took seven rounds to stabilise; they belong in their own PR after Phase 1 ships, which is already how the plan structures them.

Validate again before Phase 2, or accept the mount-probed shapes as sufficient evidence and proceed — but do not treat this report as a PASS.
