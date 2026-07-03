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

  // tcq-8 — buttons subtype upper boundary (LINE allows max 4 actions).
  it('disables adding a 5th action at the buttons 4-action boundary', () => {
    const onChange = vi.fn();
    const actions = Array.from({ length: 4 }, (_, i) => ({ type: 'message', label: `a${i}` }));
    render(
      <TemplateEditor
        payload={{ template: { type: 'buttons', text: 'hi', actions } }}
        onChange={onChange}
      />
    );

    const addButton = screen.getByText('เพิ่ม').closest('button');
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('ปุ่ม (actions) · 4/4')).toBeInTheDocument();
  });

  // tcq-7 — carousel subtype renders and edits columns.
  it('switches sub-type to carousel with a single default column', () => {
    const onChange = vi.fn();
    render(
      <TemplateEditor
        payload={{ template: { type: 'buttons', text: '', actions: [{ type: 'message', label: '' }] } }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Carousel'));

    const arg = lastCallArg(onChange) as { template: { type: string; columns: unknown[] } };
    expect(arg.template.type).toBe('carousel');
    expect(arg.template.columns).toHaveLength(1);
  });

  it('renders carousel columns and emits edits to the right column', () => {
    const onChange = vi.fn();
    const template = {
      type: 'carousel',
      columns: [
        { title: 'หนึ่ง', text: 'คอลัมน์แรก', actions: [{ type: 'message', label: 'A' }] },
        { title: 'สอง', text: 'คอลัมน์สอง', actions: [{ type: 'message', label: 'B' }] },
      ],
    };
    render(<TemplateEditor payload={{ template }} onChange={onChange} />);

    expect(screen.getByText('การ์ด #1')).toBeInTheDocument();
    expect(screen.getByText('การ์ด #2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('ข้อความการ์ดที่ 2 (text)'), {
      target: { value: 'แก้ไขแล้ว' },
    });

    const arg = lastCallArg(onChange) as {
      template: { columns: { text: string }[] };
    };
    expect(arg.template.columns[1].text).toBe('แก้ไขแล้ว');
    expect(arg.template.columns[0].text).toBe('คอลัมน์แรก');
  });

  it('removes the targeted carousel column via its uniquely labelled button', () => {
    const onChange = vi.fn();
    const template = {
      type: 'carousel',
      columns: [
        { title: '', text: 'หนึ่ง', actions: [{ type: 'message', label: 'A' }] },
        { title: '', text: 'สอง', actions: [{ type: 'message', label: 'B' }] },
      ],
    };
    render(<TemplateEditor payload={{ template }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'ลบการ์ดที่ 1' }));

    const arg = lastCallArg(onChange) as { template: { columns: { text: string }[] } };
    expect(arg.template.columns).toHaveLength(1);
    expect(arg.template.columns[0].text).toBe('สอง');
  });

  // tcq-10 — carousel column-count upper boundary (LINE allows max 10 columns).
  it('disables adding an 11th carousel column at the 10-column boundary', () => {
    const onChange = vi.fn();
    const columns = Array.from({ length: 10 }, (_, i) => ({
      title: `t${i}`,
      text: `x${i}`,
      actions: [{ type: 'message', label: 'A' }],
    }));
    render(<TemplateEditor payload={{ template: { type: 'carousel', columns } }} onChange={onChange} />);

    const addButton = screen.getByText('เพิ่มการ์ด').closest('button');
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('การ์ด (columns) · 10/10')).toBeInTheDocument();
  });

  // tcq-7 — image_carousel subtype renders and edits columns.
  it('renders image_carousel columns and emits imageUrl edits', () => {
    const onChange = vi.fn();
    const template = {
      type: 'image_carousel',
      columns: [
        { imageUrl: 'https://example.com/a.jpg', action: { type: 'uri', label: 'A', uri: 'https://a.example' } },
        { imageUrl: '', action: { type: 'uri', label: 'B', uri: '' } },
      ],
    };
    render(<TemplateEditor payload={{ template }} onChange={onChange} />);

    expect(screen.getByText('รูป #1')).toBeInTheDocument();
    expect(screen.getByText('รูป #2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('imageUrl รูปที่ 2'), {
      target: { value: 'https://example.com/b.jpg' },
    });

    const arg = lastCallArg(onChange) as { template: { columns: { imageUrl: string }[] } };
    expect(arg.template.columns[1].imageUrl).toBe('https://example.com/b.jpg');
    expect(arg.template.columns[0].imageUrl).toBe('https://example.com/a.jpg');
  });

  // tcq-10 — image_carousel shares the same 10-column boundary.
  it('disables adding an 11th image_carousel column at the 10-column boundary', () => {
    const onChange = vi.fn();
    const columns = Array.from({ length: 10 }, (_, i) => ({
      imageUrl: `https://example.com/${i}.jpg`,
      action: { type: 'uri', label: 'A', uri: 'https://a.example' },
    }));
    render(
      <TemplateEditor payload={{ template: { type: 'image_carousel', columns } }} onChange={onChange} />
    );

    const addButton = screen.getByText('เพิ่มรูป').closest('button');
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton!);

    expect(onChange).not.toHaveBeenCalled();
  });

  // tcq-9 — payloads that predate the structured editors still load.
  it('falls back to a default buttons template for a legacy/empty payload without crashing', () => {
    const onChange = vi.fn();
    render(<TemplateEditor payload={{}} onChange={onChange} />);

    // Default skeleton: buttons subtype selected with one empty action row.
    expect(screen.getByRole('button', { name: 'Buttons' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('ปุ่ม (actions) · 1/4')).toBeInTheDocument();
  });
});
