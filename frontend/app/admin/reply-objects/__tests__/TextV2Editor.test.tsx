import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TextV2Editor } from '../_components/editors/TextV2Editor';

function lastCallArg(fn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const calls = fn.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('TextV2Editor', () => {
  it('propagates typed text through onChange', () => {
    const onChange = vi.fn();
    render(<TextV2Editor payload={{ text: '' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ข้อความ (text) *'), {
      target: { value: 'สวัสดีครับ' },
    });

    expect(lastCallArg(onChange).text).toBe('สวัสดีครับ');
  });

  it('preserves sibling payload fields (e.g. quickReply) when text changes', () => {
    const onChange = vi.fn();
    const quickReply = { items: [{ type: 'action', action: { type: 'message', label: 'A' } }] };
    render(<TextV2Editor payload={{ text: 'เดิม', quickReply }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ข้อความ (text) *'), {
      target: { value: 'ใหม่' },
    });

    const arg = lastCallArg(onChange);
    expect(arg.text).toBe('ใหม่');
    expect(arg.quickReply).toEqual(quickReply);
  });

  it('appends the chosen emoji to the current text', () => {
    const onChange = vi.fn();
    render(<TextV2Editor payload={{ text: 'ขอบคุณ' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'แทรก 🙏' }));

    expect(lastCallArg(onChange).text).toBe('ขอบคุณ🙏');
  });

  it('shows the character count of the current text', () => {
    render(<TextV2Editor payload={{ text: 'abcd' }} onChange={vi.fn()} />);

    expect(screen.getByText('4 ตัวอักษร')).toBeInTheDocument();
  });

  it('treats a non-string payload.text as empty instead of crashing (legacy compat)', () => {
    render(<TextV2Editor payload={{ text: 42 as unknown as string }} onChange={vi.fn()} />);

    expect((screen.getByLabelText('ข้อความ (text) *') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText('0 ตัวอักษร')).toBeInTheDocument();
  });

  it('associates the helper hint with the textarea via aria-describedby', () => {
    render(<TextV2Editor payload={{ text: '' }} onChange={vi.fn()} />);

    const textarea = screen.getByLabelText('ข้อความ (text) *');
    const hintId = textarea.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toContain('รองรับอีโมจิ');
  });
});
