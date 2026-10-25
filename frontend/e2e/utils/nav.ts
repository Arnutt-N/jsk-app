import { type Page } from '@playwright/test'

/**
 * Cold dev-server compiles outlast Playwright's 15s navigation default, which
 * shows up as bare `page.goto` timeouts under load. Every admin route here is
 * compiled on first hit, so pay for it once per navigation instead of per run.
 */
export async function gotoAdmin(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
}
