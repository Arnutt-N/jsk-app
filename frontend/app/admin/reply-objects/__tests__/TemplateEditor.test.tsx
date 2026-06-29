import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TemplateEditor } from '../_components/editors/TemplateEditor';

function lastCallArg(fn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const calls = fn.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('TemplateEditor', () => {
  it('emits an updated template.text when typing into the text field', () => {
    const onChange = vi.fn();
    render(
      <TemplateEditor
        payload={{ template: { type: 'buttons', title: '', text: '', actions: [{ type: 'message', label: '' }] } }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('ข้อความที่จะแสดง (text)'), {
      target: { value: 'hello' },
    });
    expect(onChange).toHaveBeenCalled();
    const arg = lastCallArg(onChange) as { template: { text: string } };
    expect(arg.template.text).toBe('hello');
  });

  it('switches sub-type to confirm with exactly 2 actions', () => {
    const onChange = vi.fn();
    render(
      <TemplateEditor
        payload={{ template: { type: 'buttons', text: '', actions: [{ type: 'message', label: '' }] } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Confirm'));
    const arg = lastCallArg(onChange) as { template: { type: string; actions: unknown[] } };
    expect(arg.template.type).toBe('confirm');
    expect(arg.template.actions).toHaveLength(2);
  });

  it('adds a button action up to the limit of 4', () => {
    const onChange = vi.fn();
    render(
      <TemplateEditor
        payload={{ template: { type: 'buttons', text: 'hi', actions: [{ type: 'message', label: 'a' }] } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('เพิ่ม'));
    const arg = lastCallArg(onChange) as { template: { actions: unknown[] } };
    expect(arg.template.actions).toHaveLength(2);
  });
});
