import { type Page } from '@playwright/test'

const API_PATH = process.env.E2E_API_PATH ?? '/api/v1'

const csrfTokens = new WeakMap<Page, string>()

/**
 * State-changing API calls need the CSRF token that the login response carries.
 * The app keeps it in memory and never exposes it to the DOM, so capture it off
 * the login response. Call this before the page logs in.
 */
export function captureCsrf(page: Page): void {
  page.on('response', (res) => {
    if (!res.url().includes('/auth/login') && !res.url().includes('/auth/refresh')) return
    void res
      .json()
      .then((body: { csrf_token?: string }) => {
        if (body.csrf_token) csrfTokens.set(page, body.csrf_token)
      })
      .catch(() => {})
  })
}

/**
 * Specs own the rows they operate on. The dev database is shared and other
 * specs delete request rows, so a spec that assumes seeded rows is flaky.
 */
export async function createRequestFixture(page: Page, firstname: string): Promise<number> {
  const csrf = csrfTokens.get(page)
  if (!csrf) {
    throw new Error('captureCsrf(page) must run before the page logs in, then retry the fixture.')
  }
  const res = await page.request.post(`${API_PATH}/admin/requests`, {
    headers: { 'x-csrf-token': csrf },
    data: {
      firstname,
      lastname: 'Fixture',
      topic_category: 'E2E',
      description: `e2e fixture ${firstname}`,
    },
  })
  if (!res.ok()) {
    throw new Error(`request fixture failed with status ${res.status()}`)
  }
  const body = (await res.json()) as { id: number }
  return body.id
}
