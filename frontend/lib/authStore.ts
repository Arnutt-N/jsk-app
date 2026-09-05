// Single source of truth for admin auth state.
//
// The login page and the admin console each mount their own AuthProvider
// tree; without this module, crossing /login -> /admin remounts a fresh
// provider that re-verifies the session over the network — the login-flake
// window (P1, 2026-09-05). State held here survives those tree swaps, so a
// provider mounting after a successful login sees "authenticated" instantly
// and skips the redundant /auth/me round-trip.

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrap_error';

// Shape of an authenticated user record stored in context (moved verbatim
// from AuthContext.tsx; re-exported there as `User`).
export interface AuthUser {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT' | 'USER';
  display_name?: string;
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
