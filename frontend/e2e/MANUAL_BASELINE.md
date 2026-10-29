# Manual screenshot baselines

Pixel baselines are captured by hand, not in CI (F-029). They go stale with
every design change, so a scheduled run would either fail constantly or be
permanently skipped — which is exactly the state this replaced: a
`test.skip(process.env.UPDATE_SCREENSHOTS !== '1')` that no workflow, script, or
`package.json` entry ever enabled, with no baseline image committed.

Capture a baseline when you have deliberately changed a screen's appearance and
want the new look pinned for review.

## Prerequisites

1. Backend + frontend dev servers running (see the repo `CLAUDE.md`).
2. The seeded admin password in the environment — the specs that take baselines
   log in first:
   ```bash
   export E2E_ADMIN_PASSWORD='<seeded admin password>'
   ```
   Never commit this value.

## Capture

```bash
cd frontend
node node_modules/playwright/cli.js test admin-requests-polish --update-snapshots
```

`--update-snapshots` writes the PNGs that the spec's `toHaveScreenshot(...)`
calls name, under `e2e/admin-requests-polish.spec.ts-snapshots/`. Commit those
PNGs with a message that says which screen changed and why.

## Review a change

```bash
cd frontend
node node_modules/playwright/cli.js test admin-requests-polish
```

A mismatch writes `test-results/` with the actual, expected, and diff images.
Open the diff to decide whether the change is intended; if it is, re-run with
`--update-snapshots`.

Baselines are OS- and font-rendering-sensitive. Capture them on the same
platform CI uses (Linux) if you want the committed images to be comparable with
a CI run; capturing on Windows is fine for a local design review.
