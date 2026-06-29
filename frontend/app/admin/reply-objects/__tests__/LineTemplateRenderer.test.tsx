import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LineTemplateRenderer } from '../_components/preview/LineTemplateRenderer';
import type {
  ButtonsTemplate,
  ConfirmTemplate,
  CarouselTemplate,
  ImageCarouselTemplate,
} from '@/lib/line/message-types';

describe('LineTemplateRenderer', () => {
  it('renders a buttons template with title, text and button label', () => {
    const t: ButtonsTemplate = {
      type: 'buttons',
      title: 'หัวข้อ',
      text: 'รายละเอียด',
      actions: [{ type: 'message', label: 'กดเลย', text: 'hi' }],
    };
    render(<LineTemplateRenderer template={t} />);
    expect(screen.getByTestId('template-buttons')).toBeInTheDocument();
    expect(screen.getByText('หัวข้อ')).toBeInTheDocument();
    expect(screen.getByText('รายละเอียด')).toBeInTheDocument();
    expect(screen.getByText('กดเลย')).toBeInTheDocument();
  });

  it('renders a confirm template with exactly 2 buttons', () => {
    const t: ConfirmTemplate = {
      type: 'confirm',
      text: 'ยืนยันหรือไม่?',
      actions: [
        { type: 'message', label: 'ใช่', text: 'yes' },
        { type: 'message', label: 'ไม่', text: 'no' },
      ],
    };
    render(<LineTemplateRenderer template={t} />);
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument();
    expect(screen.getAllByTestId('template-button')).toHaveLength(2);
  });

  it('renders a carousel as N columns', () => {
    const t: CarouselTemplate = {
      type: 'carousel',
      columns: [
        { title: 'A', text: '1', actions: [{ type: 'message', label: 'a' }] },
        { title: 'B', text: '2', actions: [{ type: 'message', label: 'b' }] },
        { title: 'C', text: '3', actions: [{ type: 'message', label: 'c' }] },
      ],
    };
    render(<LineTemplateRenderer template={t} />);
    expect(screen.getByTestId('template-carousel')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders an image_carousel with image placeholders for missing urls', () => {
    const t: ImageCarouselTemplate = {
      type: 'image_carousel',
      columns: [{ imageUrl: '', action: { type: 'uri', label: 'open', uri: 'https://x.test' } }],
    };
    render(<LineTemplateRenderer template={t} />);
    expect(screen.getByTestId('template-image-carousel')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('shows a placeholder for null / invalid template instead of throwing', () => {
    const { rerender } = render(<LineTemplateRenderer template={null} />);
    expect(screen.getByTestId('template-placeholder')).toBeInTheDocument();
    rerender(<LineTemplateRenderer template={{} as unknown as ButtonsTemplate} />);
    expect(screen.getByTestId('template-placeholder')).toBeInTheDocument();
  });
});
