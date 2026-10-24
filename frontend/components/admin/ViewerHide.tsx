'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** Single source of truth for the read-only demo role. */
export function useIsViewer(): boolean {
  const { user } = useAuth();
  return user?.role === 'VIEWER';
}

/** Renders children for every role except the read-only VIEWER demo role. */
export function ViewerHide({ children }: { children: ReactNode }) {
  if (useIsViewer()) return null;
  return <>{children}</>;
}
