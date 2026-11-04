# Follow-ups: PR #306, test timeout, remaining advisories

Three separate asks, decided on evidence rather than treated as one batch.

## 1. PR #306 — close it, do not merge

`.agents` and `project-log-md` only, 7 files, +213/−27, opened 2026-10-31. Its own handoff board, session index and checkpoint describe a state five sessions stale.

A later handoff (`317520d`, `2b95a73`) already regenerated all five of those files. Merging #306 would rewind `HANDOFF_BOARD.md`, `SESSION_INDEX.md`, `TASK_LOG.md` and `current-session.json` to 31 October, and add a duplicate `handover-claude_code-20261031-2156.json` beside the two newer checkpoints.

Decision: **close unmerged**, noting the session it recorded is superseded. Nothing in it is worth preserving: the checkpoint content survives in the newer one, and the generated views are regenerated on every handoff anyway.

## 2. `testTimeout` — leave at 20s, no change

Measured, not assumed.

| Where | calendar.test.tsx | walkin.test.tsx | `collect` |
|---|---|---|---|
| This machine | 16.1s–18.2s | 17.2s | 237–277s |
| CI (`41765851497`) | 0.85s | 1.2s | 38.3s |

The ceiling is correct for CI with roughly 17× headroom. Locally it is tight because collection on this box is about 7× slower, and any test unlucky enough to run while `tsc` or a full-project `eslint` is competing blows the limit.

Two other hypotheses were tested and discarded. `userEvent` delay costs 3.5× (`delay: null` measured 1210ms versus 4279ms for 50 clicks) but did not move the outliers, and re-testing showed the slow test changes between runs. That rules out per-test work as the cause. Changing the ceiling would hide a local-machine problem and weaken the guard CI relies on.

The already-present comment on `testTimeout` describes exactly this situation from an earlier session. No code change.

## 3. Remaining advisories — one fixable, two blocked

`npm audit --omit=dev`: 0 critical, 3 high.

**`source-map-js` 1.2.1 → 1.2.2 — fixable, blocked by machine policy.** A patch exists and every parent accepts `^1.2.x` (`postcss`, `magicast`, `@tailwindcss/node`). All three are build-time only, never in a deployed request. `npm install --package-lock-only` fails with `EALLOWREMOTE`; this npm has `allow-remote = "none"`, a deliberate guard against fetching remote tarballs. Overriding a machine-wide npm policy to refresh one lockfile is the operator's call, not mine.

**`lodash` 4.17.23 — not reachable from app code.** It arrives only through `recharts`; `grep` finds no direct import anywhere in `app`, `components`, `lib` or `hooks`. The advisories (`_.template` code injection, `_.unset` prototype pollution) need a call site passing attacker-controlled paths, and there is none. Bumping it means bumping `recharts`, which is not an advisory fix.

**`zod` 3.25.76 — no 3.x patch exists.** Latest stable 3.x is 3.25.76, already installed. The only fix is 4.6.7, a major. The advisory is memory exhaustion on oversized constrained collections, and the single call site (`app/admin/requests/create/page.tsx:41`) has no `.max()` collection constraints, so the vulnerable path is not exercised. A major upgrade of a form schema library for an unreachable issue is a bad trade.

Decision: **no changes.** Revisit zod if the schema grows a constrained collection, and lodash if a direct import appears.
