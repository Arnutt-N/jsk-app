import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionEditor } from '../_components/editors/ActionEditor';
import type { LineAction } from '@/lib/line/message-types';

function lastCallArg(fn: ReturnType<typeof vi.fn>): LineAction {
  const calls = fn.mock.calls;
  return calls[calls.length - 1][0] as LineAction;
}

describe('ActionEditor', () => {
  it('emits the updated label', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'message', label: '' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ป้ายปุ่ม (label)'), { target: { value: 'ดูเมนู' } });

    expect(lastCallArg(onChange).label).toBe('ดูเมนู');
  });

  it('emits the message text for a message action', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'message', label: 'A' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ข้อความที่จะส่ง (text)'), {
      target: { value: 'สนใจบริการ' },
    });

    expect(lastCallArg(onChange).text).toBe('สนใจบริการ');
  });

  it('switches the action type through the select', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'message', label: 'A' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ชนิด action'), { target: { value: 'postback' } });

    expect(lastCallArg(onChange).type).toBe('postback');
  });

  it('ignores a select value outside the allowed action types (ts-5 guard)', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'message', label: 'A' }} onChange={onChange} />);

    // jsdom resets a <select> to '' for values with no matching <option>.
    fireEvent.change(screen.getByLabelText('ชนิด action'), { target: { value: 'bogus' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits postback data and displayText', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'postback', label: 'A' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ข้อมูล postback (data)'), {
      target: { value: 'action=buy&id=1' },
    });
    expect(lastCallArg(onChange).data).toBe('action=buy&id=1');

    fireEvent.change(screen.getByLabelText('displayText (ไม่บังคับ)'), {
      target: { value: 'ซื้อเลย' },
    });
    expect(lastCallArg(onChange).displayText).toBe('ซื้อเลย');
  });

  it('emits the uri value and shows no error for an https URL (sec-1)', () => {
    const onChange = vi.fn();
    render(<ActionEditor action={{ type: 'uri', label: 'A', uri: '' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ลิงก์ (uri)'), {
      target: { value: 'https://example.com/page' },
    });
    expect(lastCallArg(onChange).uri).toBe('https://example.com/page');

    // Re-render with the accepted value: no scheme error must be shown.
    render(
      <ActionEditor
        action={{ type: 'uri', label: 'A', uri: 'https://example.com/page' }}
        onChange={onChange}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a Thai error and marks the input invalid for a javascript: uri (sec-1)', () => {
    render(
      <ActionEditor
        action={{ type: 'uri', label: 'A', uri: 'javascript:alert(1)' }}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('ลิงก์ (uri)');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert').textContent).toContain('ลิงก์ไม่ปลอดภัยหรือไม่รองรับ');
  });

  it('accepts tel:, mailto:, and line: schemes without an error (sec-1)', () => {
    for (const uri of ['tel:0812345678', 'mailto:contact@example.go.th', 'line://ti/p/@justice']) {
      const { unmount } = render(
        <ActionEditor action={{ type: 'uri', label: 'A', uri }} onChange={vi.fn()} />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('uses the provided unique removeLabel for the delete button (a11y-7)', () => {
    const onRemove = vi.fn();
    render(
      <ActionEditor
        action={{ type: 'message', label: 'A' }}
        onChange={vi.fn()}
        onRemove={onRemove}
        removeLabel="ลบปุ่มที่ 2"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ลบปุ่มที่ 2' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
