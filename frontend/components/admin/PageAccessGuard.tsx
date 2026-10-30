'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { capabilityOf, usePermissions } from '@/lib/permissions';
import { capabilityAppliesTo, capabilityFor, requiredRolesFor } from '@/lib/route-permissions';

/**
 * F-033: the guard reads `lib/route-permissions` instead of taking an
 * `allowedRoles` prop. Three declarations of the same rule (sidebar, this
 * prop, backend key) used to disagree — e.g. DIRECTOR/HEAD saw the dashboard
 * in the menu while this guard bounced them back to it.
 *
 * `allowedRoles` is still accepted so existing call sites keep type-checking,
 * but the manifest wins; passing a list only narrows what the manifest already
 * allows (never widens it).
 */
interface PageAccessGuardProps {
  allowedRoles?: readonly string[];
  fallbackPath?: string;
  children: React.ReactNode;
}

function resolveFallbackPath(
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT' | 'VIEWER' | 'USER' | undefined
): string {
  if (role === 'AGENT') {
    return '/admin/live-chat';
  }

  return '/admin';
}

export default function PageAccessGuard({
  allowedRoles,
  fallbackPath,
  children,
}: PageAccessGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, bootstrapFailed } = useAuth();
  const permissions = usePermissions();

  const manifestRoles = requiredRolesFor(pathname);
  const capability = capabilityFor(pathname);

  const role = user?.role;
  // The role list is the PRE-LOAD fallback, not a second gate. Requiring both
  // made a matrix grant unreachable: adding DIRECTOR to `access_live_chat` in
  // Settings changed nothing while this list still said
  // SUPER_ADMIN/ADMIN/AGENT. Once the served map has the key, it decides.
  const roleAllowed =
    !!role &&
    role !== 'USER' &&
    (manifestRoles as readonly string[]).includes(role) &&
    (!allowedRoles || allowedRoles.includes(role));
  // `capabilityAppliesTo` keeps VIEWER off the write-gating keys, the same rule
  // the sidebar applies, so mounting this guard cannot bounce a role the page
  // itself admits.
  const capabilityConsulted = capabilityAppliesTo(pathname, role);
  const capabilityDecided = capabilityConsulted && !!permissions && !!capability;
  const isAllowed = capabilityDecided
    ? capabilityOf(permissions, capability)
    : roleAllowed;

  useEffect(() => {
    // bootstrapFailed = auth state unknown (transient backend failure) —
    // AdminAuthGate shows the retry UI; redirecting to /login here would
    // discard a possibly-valid session.
    if (isLoading || bootstrapFailed) {
      return;
    }

    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }

    if (!isAllowed) {
      router.replace(fallbackPath ?? resolveFallbackPath(user.role));
    }
  }, [bootstrapFailed, fallbackPath, isAllowed, isAuthenticated, isLoading, router, user]);

  if (isLoading || !isAuthenticated || !isAllowed) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
