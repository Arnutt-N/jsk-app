import { describe, it, expect } from 'vitest';
import {
  menuStatusPill,
  pillTone,
  RichMenuDisplayMode,
  RichMenuSyncStatus,
} from '@/lib/rich-menu';

const base = {
  status: 'DRAFT',
  sync_status: undefined as unknown,
  line_rich_menu_id: null as string | null,
  updated_at: '2026-01-02T00:00:00Z',
  last_synced_at: null as string | null,
  last_sync_error: null as string | null,
  display_mode: undefined as unknown,
  display_start_at: null as string | null,
  display_end_at: null as string | null,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pill = (o: Record<string, unknown>) => menuStatusPill({ ...base, ...o } as any);

describe('menuStatusPill (pinned output)', () => {
  it('PUBLISHED and in sync -> ACTIVE', () => {
    expect(pill({ status: 'PUBLISHED', line_rich_menu_id: 'rm', last_synced_at: '2026-01-03T00:00:00Z' }))
      .toMatchObject({ label: 'ACTIVE', tone: 'active' });
  });
  it('FAILED sync -> SYNC FAILED with error title', () => {
    expect(pill({ sync_status: RichMenuSyncStatus.FAILED, last_sync_error: 'boom' }))
      .toEqual({ label: 'SYNC FAILED', tone: 'error', title: 'boom' });
  });
  it('synced menu with PENDING local edits -> รอซิงค์', () => {
    expect(pill({ status: 'PUBLISHED', line_rich_menu_id: 'rm', sync_status: RichMenuSyncStatus.PENDING }))
      .toMatchObject({ label: 'รอซิงค์', tone: 'pending' });
  });
  it('SCHEDULED + INACTIVE -> หมดเวลา', () => {
    expect(pill({ display_mode: RichMenuDisplayMode.SCHEDULED, status: 'INACTIVE' }))
      .toMatchObject({ label: 'หมดเวลา', tone: 'inactive' });
  });
  it('SCHEDULED not yet inactive -> ตามเวลา', () => {
    expect(pill({ display_mode: RichMenuDisplayMode.SCHEDULED }))
      .toMatchObject({ label: 'ตามเวลา', tone: 'scheduled' });
  });
  it('MANUAL and not published -> ซ่อน', () => {
    expect(pill({ display_mode: RichMenuDisplayMode.MANUAL, line_rich_menu_id: 'rm', last_synced_at: '2026-01-03T00:00:00Z' }))
      .toMatchObject({ label: 'ซ่อน', tone: 'hidden' });
  });
  it('synced default -> SYNCED; never synced -> DRAFT', () => {
    expect(pill({ line_rich_menu_id: 'rm', last_synced_at: '2026-01-03T00:00:00Z' }).label).toBe('SYNCED');
    expect(pill({})).toMatchObject({ label: 'DRAFT', tone: 'draft' });
  });
});

describe('pillTone', () => {
  it('has a non-empty class for every tone menuStatusPill can return', () => {
    const tones = new Set<string>();
    for (const status of ['DRAFT', 'PUBLISHED', 'INACTIVE'])
      for (const sync_status of [undefined, ...Object.values(RichMenuSyncStatus)])
        for (const line_rich_menu_id of [null, 'rm'])
          for (const last_synced_at of [null, '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'])
            for (const display_mode of [undefined, ...Object.values(RichMenuDisplayMode)])
              tones.add(pill({ status, sync_status, line_rich_menu_id, last_synced_at, display_mode }).tone);
    expect(tones.size).toBe(8);
    for (const t of tones) expect((pillTone as Record<string, string>)[t]).toMatch(/\S/);
  });
});
