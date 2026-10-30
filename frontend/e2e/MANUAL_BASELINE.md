# Manual screenshot baselines

Pixel baselines are captured by hand, not in CI (F-029). They go stale with
every design change, so a scheduled run would either fail constantly or be
permanently skipped. That is exactly the state this replaced: a
`test.skip(process.env.UPDATE_SCREENSHOTS !== '1')` that no workflow, script, or
`package.json` entry ever enabled, with no baseline image committed.

Capture a baseline when you have deliberately changed a screen's appearance and
want the new look pinned for review.

## Prerequisites

1. Backend + frontend dev servers running (see the repo `CLAUDE.md`).
2. The seeded admin password in the environment, since the baseline spec logs
   in first:
   ```bash
   export E2E_ADMIN_PASSWORD='<seeded admin password>'
   ```
   Never commit this value.

## Capture

The suite holds no baseline test today: the one that existed was permanently
skipped and was removed. Capture starts by writing a throwaway spec that asserts
the screen you want pinned. Copy this to `e2e/zz-baseline.spec.ts`:

```ts
import { test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

test('baseline: requests list modal at 320px', async ({ page }) => {
  await loginAsAdmin(page)
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/admin/requests', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('button', { name: 'เรียกดู' }).first().click()
  await page.toHaveScreenshot('list-modal-320.png', { maxDiffPixelRatio: 0.02 })
})
```

Generate the PNG, then read it before committing anything:

```bash
cd frontend
node node_modules/playwright/cli.js test zz-baseline --update-snapshots
```

The image lands in `e2e/zz-baseline.spec.ts-snapshots/`. Commit it together with
the spec only if you intend to keep the baseline as a regression test, and give
the commit a message naming the screen and why it changed. Delete the spec
afterwards if the capture was a one-off for a design review.

## Review a change

```bash
cd frontend
node node_modules/playwright/cli.js test zz-baseline
```

A mismatch writes `test-results/` with the actual, expected, and diff images.
Open the diff to decide whether the change is intended; if it is, re-run with
`--update-snapshots`.

Baselines are OS- and font-rendering-sensitive. Capture them on the same
platform CI uses (Linux) if you want the committed images to be comparable with
a CI run; capturing on Windows is fine for a local design review.
