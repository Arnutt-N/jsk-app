import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessagePreview } from '../_components/preview/MessagePreview';

describe('MessagePreview', () => {
  it('renders a flex bubble for object_type=flex', () => {
    const payload = {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'Flex hi' }] },
    };
    render(<MessagePreview objectType="flex" payload={payload} />);
    expect(screen.getByTestId('flex-bubble')).toBeInTheDocument();
    expect(screen.getByText('Flex hi')).toBeInTheDocument();
  });

  it('renders a template via the template renderer for object_type=template', () => {
    const payload = {
      template: { type: 'buttons', text: 'ทำอะไรดี', actions: [{ type: 'message', label: 'เริ่ม' }] },
    };
    render(<MessagePreview objectType="template" payload={payload} />);
    expect(screen.getByTestId('template-buttons')).toBeInTheDocument();
    expect(screen.getByText('เริ่ม')).toBeInTheDocument();
  });

  it('renders a chat bubble for text_v2', () => {
    render(<MessagePreview objectType="text_v2" payload={{ text: 'สวัสดีครับ' }} />);
    expect(screen.getByTestId('chat-bubble')).toBeInTheDocument();
    expect(screen.getByText('สวัสดีครับ')).toBeInTheDocument();
  });

  it('renders quick-reply chips from payload.quickReply', () => {
    const payload = {
      text: 'เลือกเมนู',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: 'ดูคำร้อง' } },
          { type: 'action', action: { type: 'message', label: 'ส่งใหม่' } },
        ],
      },
    };
    render(<MessagePreview objectType="text_v2" payload={payload} />);
    expect(screen.getByTestId('quick-reply-chips')).toBeInTheDocument();
    expect(screen.getByText('ดูคำร้อง')).toBeInTheDocument();
    expect(screen.getByText('ส่งใหม่')).toBeInTheDocument();
  });

  it('does not crash on an empty / partial payload', () => {
    render(<MessagePreview objectType="template" payload={{}} />);
    expect(screen.getByTestId('message-preview')).toBeInTheDocument();
    // template with no content degrades to a placeholder, never throws
    expect(screen.getByTestId('template-placeholder')).toBeInTheDocument();
  });
});
