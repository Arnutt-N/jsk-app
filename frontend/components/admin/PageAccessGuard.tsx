'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';

// Mirrors the User.role union in AuthContext (excluding USER, who is
// never an admin). DIRECTOR + HEAD added 2026-05-04 for the request
// workflow split -- they share AGENT-equivalent fallback behaviour
// since they are mid-tier supervisors, not top-level operators.
type AllowedRole = 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT';

interface PageAccessGuardProps {
  allowedRoles: AllowedRole[];
  fallbackPath?: string;
  children: React.ReactNode;
}

function resolveFallbackPath(
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT' | 'USER' | undefined
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
  const { user, isLoading, isAuthenticated, bootstrapFailed } = useAuth();

  const isAllowed = !!user && user.role !== 'USER' && allowedRoles.includes(user.role as AllowedRole);

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
