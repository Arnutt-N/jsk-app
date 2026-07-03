import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuickReplyEditor } from '../_components/QuickReplyEditor';
import type { QuickReply, QuickReplyItem } from '@/lib/line/message-types';

function makeItems(count: number): QuickReplyItem[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'action' as const,
    action: { type: 'message' as const, label: `ปุ่ม ${i + 1}` },
  }));
}

function lastCallArg(fn: ReturnType<typeof vi.fn>): QuickReply | undefined {
  const calls = fn.mock.calls;
  return calls[calls.length - 1][0] as QuickReply | undefined;
}

describe('QuickReplyEditor', () => {
  it('starts unchecked and emits a single new item when toggled on', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={undefined} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    const arg = lastCallArg(onChange);
    expect(arg?.items).toHaveLength(1);
    expect(arg?.items?.[0].action?.type).toBe('message');
  });

  it('emits undefined when toggled off', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(2) }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('renders one action row and one imageUrl input per item', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(3) }} onChange={onChange} />);

    expect(screen.getByText('3/13 ปุ่ม')).toBeInTheDocument();
    expect(screen.getByLabelText('imageUrl ไอคอนปุ่มลัดที่ 3 (ไม่บังคับ)')).toBeInTheDocument();
  });

  it('appends a new item when clicking เพิ่มปุ่ม', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(2) }} onChange={onChange} />);

    fireEvent.click(screen.getByText('เพิ่มปุ่ม'));

    expect(lastCallArg(onChange)?.items).toHaveLength(3);
  });

  it('removes the targeted item via its uniquely labelled delete button', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(3) }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'ลบปุ่มลัดที่ 2' }));

    const items = lastCallArg(onChange)?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items.map((it) => it.action?.label)).toEqual(['ปุ่ม 1', 'ปุ่ม 3']);
  });

  it('still allows adding the 13th item (upper bound inclusive)', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(12) }} onChange={onChange} />);

    const addButton = screen.getByText('เพิ่มปุ่ม').closest('button');
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton!);

    expect(lastCallArg(onChange)?.items).toHaveLength(13);
  });

  it('disables the add button at the LINE 13-item boundary', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(13) }} onChange={onChange} />);

    const addButton = screen.getByText('เพิ่มปุ่ม').closest('button');
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('13/13 ปุ่ม')).toBeInTheDocument();
  });

  it('updates the imageUrl of the correct item', () => {
    const onChange = vi.fn();
    render(<QuickReplyEditor value={{ items: makeItems(2) }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('imageUrl ไอคอนปุ่มลัดที่ 2 (ไม่บังคับ)'), {
      target: { value: 'https://example.com/icon.png' },
    });

    const items = lastCallArg(onChange)?.items ?? [];
    expect(items[1].imageUrl).toBe('https://example.com/icon.png');
    expect(items[0].imageUrl).toBeUndefined();
  });
});
