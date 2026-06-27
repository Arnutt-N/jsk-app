'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import type { PresencePayload } from '@/lib/websocket/types';
import type { OperatorOption } from '../_types';
import { API_BASE } from '../_lib/constants';

/** Subset of the `/admin/users/workload` payload the roster picker consumes. */
interface WorkloadEntry {
  id: number;
  display_name: string;
  role?: string;
  active_tasks?: number;
}

interface OperatorRosterResult {
  operators: OperatorOption[];
  loading: boolean;
  error: string | null;
  refetch: (signal?: AbortSignal) => Promise<void>;
}

const ROSTER_LOAD_ERROR = 'โหลดรายชื่อผู้ดูแลไม่สำเร็จ';

/**
 * Merge the live presence list (online/away operators) with the offline roster
 * (`/admin/users/workload`) into a single sorted `OperatorOption[]` for the
 * Transfer picker.
 *
 * - Presence operators → `status: 'online' | 'away'`, `online: true`, with their
 *   `active_chats` count.
 * - Workload entries NOT present in presence → `status: 'offline'`, `online: false`.
 * - The current operator is excluded (you never transfer to yourself).
 * - `display_name` falls back: presence name → workload display_name → `Operator #id`.
 *
 * Fetching is lazy: pass `enabled` (e.g. the dialog-open flag) and the workload
 * is (re)fetched each time it flips true, so the offline list stays fresh without
 * over-fetching while the dialog is closed.
 */
export function useOperatorRoster(
  onlineOperators: PresencePayload['operators'],
  currentUserId: number,
  enabled = false,
): OperatorRosterResult {
  const { token } = useAuth();
  const [workload, setWorkload] = useState<WorkloadEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/admin/users/workload`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal,
        });
        if (!res.ok) throw new Error(`${ROSTER_LOAD_ERROR} (${res.status})`);
        const data: unknown = await res.json();
        setWorkload(Array.isArray(data) ? (data as WorkloadEntry[]) : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error && err.message ? err.message : ROSTER_LOAD_ERROR);
        setWorkload([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  // Lazy: (re)fetch the offline roster each time the picker is enabled (opened).
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [enabled, refetch]);

  // Derive the merged, sorted list during render (pure — no setState-in-effect).
  const operators = useMemo<OperatorOption[]>(() => {
    const workloadNameById = new Map<number, string>();
    for (const entry of workload) {
      const id = Number(entry.id);
      if (Number.isFinite(id)) workloadNameById.set(id, entry.display_name);
    }

    const byId = new Map<number, OperatorOption>();

    // Presence first → online/away.
    for (const op of onlineOperators) {
      const id = Number(op.id);
      if (!Number.isFinite(id) || id <= 0 || id === currentUserId) continue;
      byId.set(id, {
        id,
        display_name: op.display_name || op.name || workloadNameById.get(id) || `Operator #${id}`,
        status: op.status === 'away' ? 'away' : 'online',
        active_chats: op.active_chats ?? 0,
        online: true,
      });
    }

    // Workload entries not already online → offline.
    for (const entry of workload) {
      const id = Number(entry.id);
      if (!Number.isFinite(id) || id <= 0 || id === currentUserId || byId.has(id)) continue;
      byId.set(id, {
        id,
        display_name: entry.display_name || `Operator #${id}`,
        status: 'offline',
        active_chats: 0,
        online: false,
      });
    }

    // Online before offline, then fewest active chats first.
    return [...byId.values()].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.active_chats - b.active_chats;
    });
  }, [onlineOperators, workload, currentUserId]);

  return { operators, loading, error, refetch };
}
