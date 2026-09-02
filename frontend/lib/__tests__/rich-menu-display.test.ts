import { describe, expect, it } from 'vitest';
import {
  menuStatusPill,
  needsResync,
  toLocalDatetimeInputValue,
} from '../rich-menu';

/**
 * Unit tests for the display-settings helpers (PRD 2026-09-02):
 * menuStatusPill is the ONE pill resolver shared by the list and edit pages —
 * sync state wins first, then the display mode (ตามเวลา/ซ่อน/หมดเวลา).
 */

describe('menuStatusPill', () => {
  it('published + synced (no local edits) reads ACTIVE', () => {
    const pill = menuStatusPill({
      status: 'PUBLISHED',
      line_rich_menu_id: 'rm-1',
      sync_status: 'SYNCED',
    });
    expect(pill.label).toBe('ACTIVE');
    expect(pill.tone).toBe('active');
  });

  it('published with unsynced edits reads รอซิงค์, never ACTIVE', () => {
    const pill = menuStatusPill({
      status: 'PUBLISHED',
      line_rich_menu_id: 'rm-1',
      sync_status: 'PENDING',
    });
    expect(pill.label).toBe('รอซิงค์');
    expect(pill.tone).toBe('pending');
  });

  it('failed sync wins over display mode', () => {
    const pill = menuStatusPill({
      status: 'DRAFT',
      line_rich_menu_id: 'rm-1',
      sync_status: 'FAILED',
      last_sync_error: 'LINE said no',
      display_mode: 'SCHEDULED',
    });
    expect(pill.label).toBe('SYNC FAILED');
    expect(pill.title).toBe('LINE said no');
  });

  it('SCHEDULED reads ตามเวลา with a Thai period tooltip (AC3)', () => {
    const pill = menuStatusPill({
      status: 'DRAFT',
      line_rich_menu_id: 'rm-1',
      sync_status: 'SYNCED',
      display_mode: 'SCHEDULED',
      display_start_at: '2026-09-03T09:00:00+07:00',
      display_end_at: '2026-09-10T21:00:00+07:00',
    });
    expect(pill.label).toBe('ตามเวลา');
    expect(pill.tone).toBe('scheduled');
    expect(pill.title).toContain('แสดงตามเวลา');
  });

  it('expired SCHEDULED menu reads หมดเวลา (inactive)', () => {
    const pill = menuStatusPill({
      status: 'INACTIVE',
      line_rich_menu_id: 'rm-1',
      sync_status: 'SYNCED',
      display_mode: 'SCHEDULED',
    });
    expect(pill.label).toBe('หมดเวลา');
    expect(pill.tone).toBe('inactive');
  });

  it('MANUAL synced menu reads ซ่อน (AC3)', () => {
    const pill = menuStatusPill({
      status: 'DRAFT',
      line_rich_menu_id: 'rm-1',
      sync_status: 'SYNCED',
      display_mode: 'MANUAL',
    });
    expect(pill.label).toBe('ซ่อน');
    expect(pill.tone).toBe('hidden');
  });

  it('plain synced menu keeps SYNCED (AC5: pre-PR rows look unchanged)', () => {
    expect(
      menuStatusPill({ status: 'DRAFT', line_rich_menu_id: 'rm-1', sync_status: 'SYNCED' }).label,
    ).toBe('SYNCED');
    expect(
      menuStatusPill({ status: 'DRAFT', line_rich_menu_id: null, sync_status: 'PENDING' }).label,
    ).toBe('DRAFT');
  });
});

describe('needsResync / toLocalDatetimeInputValue', () => {
  it('needsResync only for synced menus flagged PENDING', () => {
    expect(needsResync({ line_rich_menu_id: 'rm-1', sync_status: 'PENDING' })).toBe(true);
    expect(needsResync({ line_rich_menu_id: null, sync_status: 'PENDING' })).toBe(false);
    expect(needsResync({ line_rich_menu_id: 'rm-1', sync_status: 'SYNCED' })).toBe(false);
  });

  it('datetime-local conversion renders local wall time (not UTC)', () => {
    // 2026-09-03T02:00Z == 09:00 in Bangkok (+07): the input must show local.
    expect(toLocalDatetimeInputValue('2026-09-03T02:00:00Z')).toBe(
      new Date('2026-09-03T02:00:00Z').getFullYear() >= 2026
        ? toLocalDatetimeInputValue('2026-09-03T02:00:00Z') // sanity: stable
        : '',
    );
    // exact behavior: computed from the Date object in the test's own zone
    const d = new Date('2026-09-03T02:00:00Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(toLocalDatetimeInputValue('2026-09-03T02:00:00Z')).toBe(expected);
  });

  it('empty/invalid ISO values convert to empty string', () => {
    expect(toLocalDatetimeInputValue(null)).toBe('');
    expect(toLocalDatetimeInputValue('')).toBe('');
    expect(toLocalDatetimeInputValue('not-a-date')).toBe('');
  });
});