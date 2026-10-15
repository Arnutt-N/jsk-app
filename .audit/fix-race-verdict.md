# Fix-race verdict — poteto vs ECC on F1-F4 (evidence only, no PRs yet)

Lanes: `fix/audit-f1f4-poteto` @ `6f5d757` (pushed, clean) vs `fix/audit-f1f4-ecc` @ `1f6b92f` (pushed, clean).
Trails: worktree `.audit/audit-fixes-poteto.md` vs `.audit/audit-fixes-ecc.md`. Both honored the Iron Rule.

## Per-fix comparison

| Fix | Poteto | ECC | Verdict |
|---|---|---|---|
| F2 stale-DB InvalidToken | Probe: 99/103 rows undecryptable; fresh DB 2 passed; docs-only note | Probe: 4/8 token rows stale (ids listed); fresh DB 2 passed; `git diff main` empty on 5 related files (fails on base too); fail-loud contract deliberate, tolerant variant exists only for cleanup ticks; docs-only note | TIE, edge ECC on depth (base-diff proof + contract rationale) |
| F1 bypass test | monkeypatch bypass off, test-only; file 2 passed flag-on and flag-off | Same monkeypatch approach, test-only; file 2 passed both states | TIE (identical) |
| F1-F3 shape | one commit per fix, no .env touched, no secrets | one commit per fix, no .env touched, no secrets | TIE |
| F3 eslint ignores | one-line ignores; fixture proof; lint exit 0 (0 err, 11 warn), tsc 0, build 0 | one-line ignores after `npm ci` (lockfile identical); broken-stub proof; lint exit 0 (0 err, 11 warn) | TIE (identical outcome) |
| F4 warnings | 8/9 spots fixed; test file deliberately untouched → lint 0 errors, 2 warnings remain; tsc 0, build 0, image-resize tests 15 passed | 9/9 spots fixed incl. test mock retype (arg-free impl + explicit Mock annotation, all 30 assertions intact, mid-course tsc `never[][]` correction documented) → lint 0 errors, 0 warnings; tsc 0; build 0 (49/49 pages); full unit 785/785 | ECC WINS on completeness with full-suite proof |

## Recommendation
Land the ECC branch (it is a strict superset: F1-F3 identical, F4 complete). Open question for user: single PR with 4 commits, or one PR per fix.
