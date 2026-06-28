import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCustomerNotes } from '@/hooks/useCustomerNotes';

/**
 * Unit tests for useCustomerNotes — localStorage-backed Internal Notes keyed
 * per conversation with a debounced autosave. Fake timers drive the debounce
 * window deterministically; localStorage is cleared between cases so values
 * cannot bleed across tests.
 */

const key = (id: string): string => `livechat:notes:${id}`;
const DEBOUNCE = 600;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCustomerNotes', () => {
  test('reads the initial value from localStorage for the given conversation', () => {
    // Arrange
    localStorage.setItem(key('U_A'), 'existing note');

    // Act
    const { result } = renderHook(() => useCustomerNotes('U_A'));

    // Assert
    expect(result.current.notes).toBe('existing note');
    expect(result.current.saved).toBe(true);
  });

  test('returns an empty string when no note is stored', () => {
    // Act
    const { result } = renderHook(() => useCustomerNotes('U_new'));

    // Assert
    expect(result.current.notes).toBe('');
  });

  test('persists notes to localStorage after the debounce window', () => {
    // Arrange
    const { result } = renderHook(() => useCustomerNotes('U_A'));

    // Act — type, but the write should not land before the debounce elapses
    act(() => {
      result.current.setNotes('hello');
    });
    expect(localStorage.getItem(key('U_A'))).toBeNull();

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    // Assert
    expect(localStorage.getItem(key('U_A'))).toBe('hello');
    expect(result.current.notes).toBe('hello');
  });

  test('toggles saved false→true around the debounced write', () => {
    // Arrange
    const { result } = renderHook(() => useCustomerNotes('U_A'));
    expect(result.current.saved).toBe(true);

    // Act — typing flips the indicator to "saving"
    act(() => {
      result.current.setNotes('typing...');
    });
    expect(result.current.saved).toBe(false);

    // Act — the debounce flushes and confirms the save
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    // Assert
    expect(result.current.saved).toBe(true);
  });

  test('isolates values per conversation when switching ids (no bleed)', () => {
    // Arrange
    localStorage.setItem(key('U_A'), 'note A');
    localStorage.setItem(key('U_B'), 'note B');
    const { result, rerender } = renderHook(({ id }) => useCustomerNotes(id), {
      initialProps: { id: 'U_A' as string | null },
    });
    expect(result.current.notes).toBe('note A');

    // Act — switch to B
    rerender({ id: 'U_B' });

    // Assert — loads B's value, not A's
    expect(result.current.notes).toBe('note B');

    // Act — edit B and flush
    act(() => {
      result.current.setNotes('note B edited');
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(localStorage.getItem(key('U_B'))).toBe('note B edited');

    // Act — switch back to A
    rerender({ id: 'U_A' });

    // Assert — A is untouched by edits made under B
    expect(result.current.notes).toBe('note A');
    expect(localStorage.getItem(key('U_A'))).toBe('note A');
  });

  test('cancels a pending write when the conversation changes (no wrong-key write)', () => {
    // Arrange
    const { result, rerender } = renderHook(({ id }) => useCustomerNotes(id), {
      initialProps: { id: 'U_A' as string | null },
    });

    // Act — type, then immediately switch before the debounce flushes
    act(() => {
      result.current.setNotes('half typed');
    });
    rerender({ id: 'U_B' });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    // Assert — the pending write was cancelled; neither key received it
    expect(localStorage.getItem(key('U_A'))).toBeNull();
    expect(localStorage.getItem(key('U_B'))).toBeNull();
  });

  test('is a no-op for a null conversation id (no write, no throw)', () => {
    // Arrange
    const { result } = renderHook(() => useCustomerNotes(null));

    // Act + Assert — typing with no conversation selected must not throw
    expect(() => {
      act(() => {
        result.current.setNotes('orphan note');
      });
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE);
      });
    }).not.toThrow();

    // Assert — nothing persisted, indicator stays "saved"
    expect(localStorage.length).toBe(0);
    expect(result.current.saved).toBe(true);
  });
});
