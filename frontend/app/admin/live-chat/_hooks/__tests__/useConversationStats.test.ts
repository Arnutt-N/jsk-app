import { describe, it, expect } from 'vitest';
import { computeConversationStats } from '../useConversationStats';
import type { Conversation } from '../../_types';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    line_user_id: 'U001',
    display_name: 'Test User',
    picture_url: '',
    friend_status: 'following',
    chat_mode: 'HUMAN',
    unread_count: 0,
    tags: [],
    ...overrides,
  };
}

const waiting = makeConversation({
  line_user_id: 'Uwaiting',
  display_name: 'สมชาย รอคิว',
  session: { id: 1, status: 'WAITING' },
  tags: [{ id: 1, name: 'VIP', color: '#f00' }],
});
const active = makeConversation({
  line_user_id: 'Uactive',
  display_name: 'Alice Active',
  session: { id: 2, status: 'ACTIVE' },
  tags: [{ id: 2, name: 'ด่วน', color: '#0f0' }],
});
const closed = makeConversation({
  line_user_id: 'Uclosed',
  display_name: 'Bob Closed',
  session: { id: 3, status: 'CLOSED' },
});
const noSession = makeConversation({
  line_user_id: 'Unosession',
  display_name: 'Carol NoSession',
  session: undefined,
});

const fixtures: Conversation[] = [waiting, active, closed, noSession];

describe('computeConversationStats', () => {
  it('นับ WAITING/ACTIVE/closed แบบ single-pass ได้ถูกต้อง', () => {
    const stats = computeConversationStats(fixtures, '');
    expect(stats.waitingCount).toBe(1);
    expect(stats.activeCount).toBe(1);
    // CLOSED + no-session นับเป็น closed รวมกัน
    expect(stats.closedCount).toBe(2);
  });

  it('query ว่างเปล่า คืนค่าทุกรายการ', () => {
    const stats = computeConversationStats(fixtures, '');
    expect(stats.filtered).toHaveLength(fixtures.length);
    expect(stats.filtered).toEqual(fixtures);
  });

  it('query ว่างเปล่า (เว้นวรรคล้วน) คืนค่าทุกรายการ', () => {
    const stats = computeConversationStats(fixtures, '   ');
    expect(stats.filtered).toHaveLength(fixtures.length);
  });

  it('no-session นับเป็น closed', () => {
    const stats = computeConversationStats([noSession], '');
    expect(stats.closedCount).toBe(1);
    expect(stats.waitingCount).toBe(0);
    expect(stats.activeCount).toBe(0);
  });

  it('กรองด้วย display_name แบบไม่สนตัวพิมพ์ใหญ่เล็ก', () => {
    const stats = computeConversationStats(fixtures, 'ALICE');
    expect(stats.filtered).toHaveLength(1);
    expect(stats.filtered[0].line_user_id).toBe('Uactive');
  });

  it('กรองด้วย line_user_id แบบไม่สนตัวพิมพ์ใหญ่เล็ก', () => {
    const stats = computeConversationStats(fixtures, 'uclosed');
    expect(stats.filtered).toHaveLength(1);
    expect(stats.filtered[0].line_user_id).toBe('Uclosed');
  });

  it('กรองด้วย tag เมื่อ query ขึ้นต้นด้วย #', () => {
    const stats = computeConversationStats(fixtures, '#vip');
    expect(stats.filtered).toHaveLength(1);
    expect(stats.filtered[0].line_user_id).toBe('Uwaiting');
  });

  it('กรองด้วย tag เมื่อ query ขึ้นต้นด้วย tag:', () => {
    const stats = computeConversationStats(fixtures, 'tag:ด่วน');
    expect(stats.filtered).toHaveLength(1);
    expect(stats.filtered[0].line_user_id).toBe('Uactive');
  });

  it('นับ count คงเดิมไม่ขึ้นกับ query (กรองเฉพาะ filtered)', () => {
    const stats = computeConversationStats(fixtures, 'alice');
    // ถึง filtered เหลือ 1 แต่ count ยังนับจากทั้งหมด
    expect(stats.filtered).toHaveLength(1);
    expect(stats.waitingCount).toBe(1);
    expect(stats.activeCount).toBe(1);
    expect(stats.closedCount).toBe(2);
  });
});
