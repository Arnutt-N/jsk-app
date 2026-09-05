# Login Flake Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful login, the admin dashboard opens on the first try — no bounce back to /login — and a logout in one tab can never evict a different tab's valid session.

**Architecture:** Replace the two disconnected React auth-provider trees (/login and /admin each mount their own `AuthProvider`) with one module-level auth store that both trees read via `useSyncExternalStore`, so login state survives the client-side route swap without a re-verification round-trip. Verify cross-tab logout broadcasts against the server before clearing a local session.

**Tech Stack:** Next.js 16 App Router (client components), React 19, TypeScript, Vitest + React Testing Library, Playwright (chromium-only). No new dependencies. Backend untouched.

**PRD:** `.claude/PRPs/prds/2026-09-05-login-flake.prd.md`

## Global Constraints

- Frontend-only change: no files under `backend/`, no schema, no API contract change.
- The public `AuthContextType` contract and all `useAuth()` consumers stay unchanged.
- No new npm dependencies. No new user-visible strings.
- 2-space indent, UTF-8, LF line endings. Tailwind v4 + `cn()` if any styling is touched (none planned).
- E2E runs chromium-only per `frontend/playwright.config.ts`; CI sets `AUTH_LOGIN_RATE_LIMIT=100` in the E2E workflow — local repro runs must respect the 5/60s login limiter or set the same env.
- All existing Vitest suites must stay green after each task.

## Static Evidence (investigated 2026-09-05, branch `fix/login-flake`)

| # | Finding | Location |
|---|---------|----------|
| E1 | Auth state is split: login page and admin console each mount their own `AuthProvider` (two disconnected React state instances); there is no provider at the root layout | `frontend/app/login/page.tsx:471`, `frontend/app/admin/layout.tsx:445` (none in `frontend/app/layout.tsx`) |
| E2 | Mounting /admin boots a fresh provider that re-verifies via `GET /auth/me` over the network | `frontend/contexts/AuthContext.tsx:118-200` (effect keyed on `bootstrapAttempt`) |
| E3 | A definitive non-transient `/auth/me` response (401) sets `unauthenticated`, and both the admin gate and page guard redirect to /login | `frontend/contexts/AuthContext.tsx:186-188`, `frontend/app/admin/layout.tsx:47-49` (`AdminAuthGate`), `frontend/components/admin/PageAccessGuard.tsx:48-51` |
| E4 | Any admin API 401 that survives one silent refresh dispatches `jsk:auth-expired`; the provider listens and calls `logout()` unconditionally | `frontend/lib/authFetch.ts:126-153` + `:47-52`, `frontend/contexts/AuthContext.tsx:346-354` |
| E5 | `logout()` broadcasts `{type:'logout'}` on the cross-tab channel, and every other tab clears its session **without verifying** and redirects to /login | `frontend/contexts/AuthContext.tsx:304-313` (broadcast), `:208-214` (receiver) |
| E6 | **Leading hypothesis (full chain):** opening/sitting on the login page with stale cookies → bootstrap `/me` 401 → interceptor silent-refresh also 401s → `notifyAuthExpired` → `logout()` → broadcast → the *other* tab where the user *just* logged in successfully receives it and bounces. Explains the success-toast-then-bounce symptom and why a second attempt (after the stale tab settled) works. | chain of E2 → E4 → E5 via `AuthContext.tsx:162` |
| E7 | Refresh-token rotation has reuse detection: presenting a consumed refresh token revokes the whole session family — a multi-tab cookie-jar race burns all sessions | `backend/app/services/auth_session_service.py:186-203` |
| E8 | ELIMINATED: "backend didn't save the session before responding" — login commits the session before returning | `backend/app/api/v1/endpoints/auth.py:183-194` (`await db.commit()` precedes `return`) |
| E9 | Dead state: `setIsLoading` is set during login/bootstrap but the exposed `isLoading` derives from `status` only — the flag is never read | `frontend/contexts/AuthContext.tsx:107` vs `:360`; writes at `:128,193,229,300` |
| E10 | No server-side route gate exists (`middleware.ts`/`proxy.ts` absent) — the client guard is the only /admin gate today (out of scope per PRD) | frontend root, confirmed 2026-09-05 |
| E11 | CI's Playwright suite passes because it does not exercise the timing window (single fresh tab, fast local /me) | `frontend/e2e/cookie-auth.spec.ts` |

## File Structure

- Create: `frontend/lib/authStore.ts` — module-level auth store (state + subscribe + set). One responsibility: hold auth state that survives route-tree swaps.
- Modify: `frontend/contexts/AuthContext.tsx` — provider becomes a subscriber of the store; broadcast receiver verifies before clearing; dead `isLoading` state removed. Public hook contract unchanged.
- Modify: `frontend/contexts/__tests__/AuthContext.cookie.test.tsx` — new unit tests + store reset between tests.
- Create: `frontend/e2e/login-stability.spec.ts` — permanent regression spec (10× login→dashboard).
- Create (temporary, deleted in Task 4): `frontend/e2e/login-flake-repro.spec.ts` + `.claude/PRPs/findings/2026-09-05-login-flake-repro.md`.
- Create (temporary, deleted in Task 4): `frontend/e2e/login-flake-twotab.spec.ts`.

---

### Task 1: Reproduce & confirm the bounce mechanism

**Files:**
- Create: `frontend/e2e/login-flake-repro.spec.ts` (temporary)
- Create: `frontend/e2e/login-flake-twotab.spec.ts` (temporary)
- Create: `.claude/PRPs/findings/2026-09-05-login-flake-repro.md`

**Interfaces:**
- Consumes: `loginAsAdmin` helper from `frontend/e2e/utils/auth.ts` (existing).
- Produces: a findings note naming which hypothesis (E6 primary, E3 secondary, E7 tertiary) fired, with console/network evidence. Later tasks rely on this to confirm scope.

- [ ] **Step 1: Start the local stack** (Docker is currently OFF on this machine)

```bash
docker-compose up -d db redis
# backend (backend/):  python run.py --target local
# frontend (frontend/): npm run dev
```

Expected: backend on localhost:8000, frontend on localhost:3000, both healthy.

- [ ] **Step 2: Write the single-tab loop spec**

```typescript
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// TEMPORARY repro for P1 login flake — deleted after findings are recorded.
test.describe('login flake repro (single tab)', () => {
  test('10 consecutive login -> /admin transitions, zero retries', async ({ page }) => {
    test.setTimeout(120_000)
    const bounces: string[] = []
    page.on('console', (msg) => {
      if (/auth|bootstrap|Cookie auth/i.test(msg.text())) bounces.push(msg.text())
    })
    for (let i = 1; i <= 10; i++) {
      await page.context().clearCookies()
      await page.goto('/login')
      await loginAsAdmin(page)
      // The flake: URL flips back to /login after the success toast.
      await page.waitForURL(/\/admin/, { timeout: 15_000 })
      await page.waitForTimeout(1_500) // let late guards/broadcasts fire
      expect(page).not.toHaveURL(/\/login/)
    }
    if (bounces.length) console.log('AUTH_CONSOLE:', bounces.join('\n'))
  })
})
```

If `loginAsAdmin` already clears cookies/uses storage state, adapt the loop but keep the 1.5 s settle window and the `/login` assertion — that window is what CI lacks (E11).

- [ ] **Step 3: Run it**

Run: `cd frontend && npx playwright test e2e/login-flake-repro.spec.ts`
Expected: either a failure at the `not.toHaveURL(/\/login/)` assertion (flake reproduced) or 10/10 pass locally — record which. If 10/10, run once against a **production-like** build (`npm run build && npm start`) before concluding.

- [ ] **Step 4: Write the two-tab spec (tests hypothesis E6 directly)**

```typescript
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// TEMPORARY repro: a stale login-page tab must not evict a fresh session.
test.describe('login flake repro (two tabs)', () => {
  test('stale /login bootstrap does not evict the freshly logged-in tab', async ({ browser }) => {
    const context = await browser.newContext()
    const freshTab = await context.newPage()
    await loginAsAdmin(freshTab)
    await expect(freshTab).toHaveURL(/\/admin/)

    const staleTab = await context.newPage()
    await staleTab.goto('/admin') // same session in this context
    // Corrupt the access cookie so the stale tab's next auth check 401s and
    // its silent refresh fails -> auth-expired -> logout broadcast (E4->E5).
    await context.addCookies([{
      name: 'access_token', value: 'corrupted', domain: 'localhost', path: '/',
    }])

    await staleTab.goto('/login') // fresh provider bootstraps -> /me 401 chain
    await staleTab.waitForTimeout(3_000)

    // Hypothesis E6 says freshTab gets bounced by the broadcast:
    await freshTab.waitForTimeout(1_000)
    await freshTab.reload()
    await expect(freshTab).toHaveURL(/\/admin|\/login/) // record which, in findings
  })
})
```

- [ ] **Step 5: Record findings**

Append `.claude/PRPs/findings/2026-09-05-login-flake-repro.md` with: which URL each tab ended on, captured `AUTH_CONSOLE` lines, and the confirmed mechanism (E6 / E3 / E7 / other). If evidence contradicts a later task's premise, stop and update this plan before continuing.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/login-flake-repro.spec.ts frontend/e2e/login-flake-twotab.spec.ts .claude/PRPs/findings/2026-09-05-login-flake-repro.md
git commit -m "test(login): repro harness for P1 login flake + findings"
```

---

### Task 2: One shared auth store across route trees

**Files:**
- Create: `frontend/lib/authStore.ts`
- Modify: `frontend/contexts/AuthContext.tsx:11-16,105-200,228-302` (cut `User` interface here; provider subscribes to store; delete dead `isLoading` writes at `:107,128,193,229,300`)
- Test: `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getAuthSnapshot(): AuthSnapshot`, `subscribeAuth(l): () => void`, `setAuthState(patch): void`, `resetAuthStore(): void` from `@/lib/authStore`; `AuthStatus` and `User` re-exported from `AuthContext` so existing imports keep compiling.

- [ ] **Step 1: Write failing unit tests first** (append to `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`; reuse the file's existing mock admin and probe patterns — if no probe exists, add the one shown)

```tsx
import { resetAuthStore, setAuthState } from '@/lib/authStore'

describe('shared auth store across provider trees', () => {
  beforeEach(() => resetAuthStore())

  it('a freshly mounted provider does not re-verify when the store already holds a session', async () => {
    setAuthState({ user: MOCK_ADMIN, status: 'authenticated' })
    const meSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 500 }),
    )

    render(
      <AuthProvider>
        <div data-testid="probe">{useAuthSnapshotUserForProbe()}</div>
      </AuthProvider>,
    )

    await screen.findByTestId('probe')
    const meCalls = meSpy.mock.calls.filter(([url]) => String(url).includes('/auth/me'))
    expect(meCalls).toHaveLength(0)
    meSpy.mockRestore()
  })
})
```

Where `useAuthSnapshotUserForProbe()` is the existing test helper pattern in this file for reading `useAuth().user` inside a child component (see prior art in the same file). Run:

Run: `cd frontend && npx vitest run contexts/__tests__/AuthContext.cookie.test.tsx`
Expected: FAIL — provider still boots its own state and calls `/auth/me`.

- [ ] **Step 2: Create the store** (`frontend/lib/authStore.ts`)

```ts
// Single source of truth for admin auth state. The login page and the admin
// console each mount their own AuthProvider tree; without this module,
// crossing /login -> /admin remounts a fresh provider that re-verifies the
// session over the network — the login-flake window. State here survives
// those tree swaps.

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrap_error';

// AuthContext.tsx re-exports this as `User` (interface moved here verbatim).
export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

export interface AuthSnapshot {
  user: AuthUser | null;
  status: AuthStatus;
}

let snapshot: AuthSnapshot = { user: null, status: 'loading' };
const listeners = new Set<() => void>();

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAuthState(patch: Partial<AuthSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function resetAuthStore(): void {
  snapshot = { user: null, status: 'loading' };
  for (const listener of listeners) listener();
}
```

Adjust `AuthUser` fields to exactly match the `User` interface at `AuthContext.tsx:11-16` when moving it (copy it verbatim; do not invent fields).

- [ ] **Step 3: Rewire AuthProvider to the store** (`frontend/contexts/AuthContext.tsx`)

- Move `interface User` (L11-16) into `authStore.ts` as `AuthUser`; in AuthContext replace it with `export type { AuthUser as User } from '@/lib/authStore';` and re-export `AuthStatus` likewise.
- Inside `AuthProvider` replace `useState` for `user`/`isLoading`/`status` (L106-108) with:

```tsx
import { useSyncExternalStore } from 'react';
import { getAuthSnapshot, setAuthState, subscribeAuth } from '@/lib/authStore';

// inside AuthProvider:
const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
const user = auth.user;
const status = auth.status;
const setUser = (u: User | null) => setAuthState({ user: u });
const setStatus = (s: AuthStatus) => setAuthState({ status: s });
```

- Delete the `isLoading` state and every `setIsLoading` call (L107, L128, L193, L229, L300) — dead per E9; the memo keeps deriving `isLoading: status === 'loading'`.
- At the top of `initCookieAuth` add the skip guard so a tree mounting after login doesn't re-verify:

```tsx
const initCookieAuth = async () => {
  // A tree remounting after a client-side login already holds fresh state
  // in the shared store — skip the network re-verification entirely.
  if (getAuthSnapshot().status !== 'loading') return;
  // ... existing body unchanged
```

- Keep `logout()`, `login()`, `refreshAccessToken()` bodies as-is (their `setUser`/`setStatus` calls now write through to the store).

- [ ] **Step 4: Run unit tests**

Run: `cd frontend && npx vitest run contexts/__tests__/AuthContext.cookie.test.tsx`
Expected: PASS — new test passes and all pre-existing tests in the file still pass (add `resetAuthStore()` to the file's shared `beforeEach` if pre-existing tests leak store state between tests).

- [ ] **Step 5: Full frontend unit suite + lint**

Run: `cd frontend && npm run test:unit && npm run lint`
Expected: all suites pass, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/authStore.ts frontend/contexts/AuthContext.tsx frontend/contexts/__tests__/AuthContext.cookie.test.tsx
git commit -m "fix(auth): single shared auth store across login and admin trees"
```

---

### Task 3: Verify cross-tab logout broadcasts before clearing the session

**Files:**
- Modify: `frontend/contexts/AuthContext.tsx:203-221` (broadcast receiver)
- Test: `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`

**Interfaces:**
- Consumes: store API from Task 2; existing `clearCsrfToken` from `@/lib/csrfStore`.
- Produces: behavior — a `{type:'logout'}`/`{type:'expired'}` broadcast no longer clears a session the server still recognises.

- [ ] **Step 1: Write the failing unit test** (same file, new describe block)

```tsx
describe('cross-tab logout broadcast', () => {
  beforeEach(() => resetAuthStore())

  it('ignores the broadcast when the server still recognises our session', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: ((e: MessageEvent) => void) | null = null;
        postMessage() {}
        close() {}
      },
    );
    setAuthState({ user: MOCK_ADMIN, status: 'authenticated' });
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ username: MOCK_ADMIN.username }), { status: 200 }),
    );

    render(
      <AuthProvider>
        <div data-testid="probe">{useAuthSnapshotUserForProbe()}</div>
      </AuthProvider>,
    );

    // Simulate another tab broadcasting logout on the 'jsk:auth' channel.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: undefined })); // no-op guard
    });
    const channel = (BroadcastChannel as unknown as { instances?: Array<{ onmessage: ((e: MessageEvent) => void) | null }> }).instances?.[0];
    await act(async () => {
      channel?.onmessage?.({ data: { type: 'logout' } } as MessageEvent);
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(MOCK_ADMIN.username);
    });
    vi.unstubAllGlobals();
  });

  it('clears the session when the server says 401', async () => {
    // Same stub + render as above, but mock fetch to resolve 401 for /auth/me,
    // fire channel.onmessage({ data: { type: 'logout' } }),
    // then assert the probe reports the logged-out state.
  });
});
```

Implement the second test fully using the same pattern as the first (mock 401, fire broadcast, assert the probe shows the logged-out state). Follow the file's existing BroadcastChannel mocking if it already has one — prefer its pattern.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run contexts/__tests__/AuthContext.cookie.test.tsx`
Expected: FAIL — today the receiver clears the session unconditionally (`AuthContext.tsx:208-214`).

- [ ] **Step 3: Implement the verification** (replace the receiver body)

```tsx
const bc = new BroadcastChannel(AUTH_CHANNEL_NAME);
bcRef.current = bc;
bc.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'logout' || event.data?.type === 'expired') {
    void verifyThenApplyRemoteLogout();
  }
};
```

with, inside `AuthProvider`:

```tsx
// A logout/expiry broadcast may come from a tab holding a different (older)
// session than ours. Confirm with the server before clearing anything:
// a 200 on /auth/me means the broadcast was not about our session.
const verifyThenApplyRemoteLogout = useCallback(async () => {
  try {
    const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
    if (res.ok) return;
    if (isTransientLoginStatus(res.status)) return; // unknown state — keep session
  } catch {
    return; // cannot verify on a network error — keep session
  }
  clearCsrfToken();
  setAuthState({ user: null, status: 'unauthenticated' });
  router.replace('/login');
}, [router]);
```

- [ ] **Step 4: Run unit tests**

Run: `cd frontend && npx vitest run contexts/__tests__/AuthContext.cookie.test.tsx`
Expected: PASS — both new tests green, no pre-existing regressions.

- [ ] **Step 5: Commit**

```bash
git add frontend/contexts/AuthContext.tsx frontend/contexts/__tests__/AuthContext.cookie.test.tsx
git commit -m "fix(auth): verify cross-tab logout broadcasts against the server"
```

---

### Task 4: Permanent regression spec + cleanup of repro scaffolding

**Files:**
- Create: `frontend/e2e/login-stability.spec.ts`
- Delete: `frontend/e2e/login-flake-repro.spec.ts`, `frontend/e2e/login-flake-twotab.spec.ts`

**Interfaces:**
- Consumes: `loginAsAdmin` from `frontend/e2e/utils/auth.ts`.
- Produces: the CI-visible regression guard for the flake (PRD story 10).

- [ ] **Step 1: Write the permanent spec**

```typescript
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// Regression guard for the P1 login flake: the success toast must be
// followed by the dashboard, every single time, with no retry.
test.describe('login stability', () => {
  test('10 consecutive login -> /admin transitions, zero bounces', async ({ page }) => {
    test.setTimeout(180_000)
    for (let i = 1; i <= 10; i++) {
      await page.context().clearCookies()
      await page.goto('/login')
      await loginAsAdmin(page)
      await page.waitForURL(/\/admin/, { timeout: 15_000 })
      await page.waitForTimeout(1_500) // settle window: late guards/broadcasts
      expect(page).not.toHaveURL(/\/login/)
    }
  })

  test('logged-in tab stays put while an idle tab sits on /login', async ({ browser }) => {
    const context = await browser.newContext()
    const adminTab = await context.newPage()
    await loginAsAdmin(adminTab)
    await expect(adminTab).toHaveURL(/\/admin/)

    const loginTab = await context.newPage()
    await loginTab.goto('/login')
    await loginTab.waitForTimeout(3_000)

    await expect(adminTab).toHaveURL(/\/admin/)
  })
})
```

- [ ] **Step 2: Run the new spec and the full E2E suite**

Run: `cd frontend && npx playwright test e2e/login-stability.spec.ts && npm run test:e2e`
Expected: new spec passes both tests; existing suite stays green.

- [ ] **Step 3: Delete temporary repro files**

```bash
git rm frontend/e2e/login-flake-repro.spec.ts frontend/e2e/login-flake-twotab.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/login-stability.spec.ts
git commit -m "test(e2e): login stability regression spec (10x, zero bounces)"
```

---

### Task 5: Validation, review, PR & handoff

**Files:**
- Modify (generated): `.agents/state/*` via the handoff script only.

- [ ] **Step 1: Full validation battery**

```bash
cd frontend && npm run test:unit && npm run lint && npm run build
cd ../backend && python -m pytest -q   # proof of no accidental coupling only
cd ../frontend && npm run test:e2e
```

Expected: everything green. Backend count unchanged from current main.

- [ ] **Step 2: Code review pass** — run the `code-review` skill on the diff (`main...fix/login-flake`); fix findings, re-run Step 1.

- [ ] **Step 3: PR & merge** — push branch, open PR referencing the PRD + findings note, wait for CI 4/4, squash-merge per repo convention.

- [ ] **Step 4: Handoff** — run the handoff script (`handoff-new.cjs`) to checkpoint state; update session summary per AGENTS.md.

---

## Self-Review (writing-plans checklist)

1. **Spec coverage:** PRD decisions 1→Task 2, 2→Task 2 (dead flag), 3→Task 3, 4→constraint (no backend), 5→preserved verbatim, 6→Task 1; stories 1-3,7-8 → Task 2/3; story 4 → Task 3; story 9 → Task 2; story 10 → Task 4; stories 5-6,12 → covered by the same fixes (role-independent); story 11 → constraint. No gaps.
2. **Placeholder scan:** Task 1 Step 2/4 and Task 4 Step 1 contain full code; Task 2/3 contain full code for every code step; the two "reuse existing helper/pattern" references point at named, existing files (`utils/auth.ts`, the cookie test file) — allowed prior-art references, not TBDs. Task 3 Step 1's second test is described with its exact assertion target and mock shape (401 → logged-out state) using the identical skeleton as the first — no invented symbols.
3. **Type consistency:** store API names (`getAuthSnapshot`, `subscribeAuth`, `setAuthState`, `resetAuthStore`, `AuthStatus`, `AuthSnapshot`) are used identically across Tasks 2 and 3; `verifyThenApplyRemoteLogout` appears once and is referenced once; probe helper name matches between Task 2 and Task 3 tests.
