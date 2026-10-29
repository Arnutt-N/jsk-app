'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { capabilityOf, usePermissions } from '@/lib/permissions';
import { capabilityFor, requiredRolesFor } from '@/lib/route-permissions';

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
  const roleAllowed =
    !!role &&
    role !== 'USER' &&
    (manifestRoles as readonly string[]).includes(role) &&
    (!allowedRoles || allowedRoles.includes(role));
  // Until the map resolves the role list alone decides — same behaviour as
  // before this module existed (no flash of a bounced page on first paint).
  const capabilityAllowed = !capability || !permissions || capabilityOf(permissions, capability);
  const isAllowed = roleAllowed && capabilityAllowed;

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
