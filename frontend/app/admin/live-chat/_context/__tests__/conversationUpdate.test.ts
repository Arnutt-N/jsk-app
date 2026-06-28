import { describe, it, expect } from 'vitest';

import { reorderConversationsToTop } from '../../_hooks/liveChatApi';

/**
 * Unit tests for the move-to-top helper extracted from handleConversationUpdate
 * (Phase 5 / L9.4). The helper does a single-pass immutable reorder: the
 * updated conversation is placed first, the remaining conversations keep their
 * relative order, and a not-present id is simply prepended.
 */
describe('reorderConversationsToTop', () => {
  it('moves the updated item to the top while preserving the remaining order', () => {
    // Arrange
    const list = [
      { line_user_id: 'A', tag: 'a0' },
      { line_user_id: 'B', tag: 'b0' },
      { line_user_id: 'C', tag: 'c0' },
    ];
    const updated = { line_user_id: 'C', tag: 'c1' };

    // Act
    const result = reorderConversationsToTop(list, updated);

    // Assert
    expect(result.map((c) => c.line_user_id)).toEqual(['C', 'A', 'B']);
    // The new (updated) object is used at the top, not the stale one.
    expect(result[0]).toBe(updated);
    expect(result[0].tag).toBe('c1');
    // The remaining items keep their original relative order.
    expect(result.slice(1)).toEqual([
      { line_user_id: 'A', tag: 'a0' },
      { line_user_id: 'B', tag: 'b0' },
    ]);
  });

  it('does not leave a duplicate id when the updated item already exists', () => {
    // Arrange
    const list = [
      { line_user_id: 'A' },
      { line_user_id: 'B' },
      { line_user_id: 'C' },
    ];
    const updated = { line_user_id: 'B' };

    // Act
    const result = reorderConversationsToTop(list, updated);

    // Assert
    const ids = result.map((c) => c.line_user_id);
    expect(ids).toEqual(['B', 'A', 'C']);
    expect(ids.filter((id) => id === 'B')).toHaveLength(1);
    expect(result).toHaveLength(list.length);
  });

  it('prepends a not-present id (new conversation branch)', () => {
    // Arrange
    const list = [
      { line_user_id: 'A' },
      { line_user_id: 'B' },
    ];
    const updated = { line_user_id: 'Z' };

    // Act
    const result = reorderConversationsToTop(list, updated);

    // Assert
    expect(result.map((c) => c.line_user_id)).toEqual(['Z', 'A', 'B']);
    expect(result[0]).toBe(updated);
    expect(result).toHaveLength(list.length + 1);
  });

  it('returns a new array and does not mutate the input list', () => {
    // Arrange
    const list = [
      { line_user_id: 'A' },
      { line_user_id: 'B' },
    ];
    const snapshot = [...list];
    const updated = { line_user_id: 'B' };

    // Act
    const result = reorderConversationsToTop(list, updated);

    // Assert
    expect(result).not.toBe(list);
    expect(list).toEqual(snapshot);
  });
});
