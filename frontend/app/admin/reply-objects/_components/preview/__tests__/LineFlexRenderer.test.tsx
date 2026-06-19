import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LineFlexRenderer } from '../LineFlexRenderer';
import type { FlexBubble, FlexCarousel } from '@/lib/line/message-types';

describe('LineFlexRenderer', () => {
  it('renders a bubble with text and button from body', () => {
    const bubble: FlexBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'Hello LINE', weight: 'bold', size: 'lg' },
          { type: 'button', style: 'primary', action: { type: 'message', label: 'Tap me', text: 'hi' } },
        ],
      },
    };
    render(<LineFlexRenderer container={bubble} />);

    expect(screen.getByTestId('flex-bubble')).toBeInTheDocument();
    expect(screen.getByText('Hello LINE')).toBeInTheDocument();
    expect(screen.getByText('Tap me')).toBeInTheDocument();
  });

  it('renders a carousel as N bubble columns', () => {
    const mkBubble = (label: string): FlexBubble => ({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: label }] },
    });
    const carousel: FlexCarousel = {
      type: 'carousel',
      contents: [mkBubble('A'), mkBubble('B'), mkBubble('C')],
    };
    render(<LineFlexRenderer container={carousel} />);

    expect(screen.getByTestId('flex-carousel')).toBeInTheDocument();
    expect(screen.getAllByTestId('flex-bubble')).toHaveLength(3);
  });

  it('renders nested boxes recursively', () => {
    const bubble: FlexBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'left' },
              { type: 'text', text: 'right' },
            ],
          },
        ],
      },
    };
    render(<LineFlexRenderer container={bubble} />);
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.getByText('right')).toBeInTheDocument();
    // outer body box + inner horizontal box = at least 2 boxes
    expect(screen.getAllByTestId('flex-box').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a placeholder for an image node without url instead of throwing', () => {
    const bubble: FlexBubble = {
      type: 'bubble',
      hero: { type: 'image' }, // no url
    };
    render(<LineFlexRenderer container={bubble} />);
    expect(screen.getAllByTestId('flex-placeholder').length).toBeGreaterThanOrEqual(1);
  });

  it('does not crash on a null / invalid container', () => {
    const { rerender } = render(<LineFlexRenderer container={null} />);
    expect(screen.getByTestId('flex-placeholder')).toBeInTheDocument();

    // partial garbage payload cast through unknown — renderer must guard it
    rerender(<LineFlexRenderer container={{} as unknown as FlexBubble} />);
    expect(screen.getByTestId('flex-placeholder')).toBeInTheDocument();
  });

  it('renders an empty carousel as a placeholder', () => {
    render(<LineFlexRenderer container={{ type: 'carousel', contents: [] }} />);
    expect(screen.getByTestId('flex-placeholder')).toBeInTheDocument();
  });

  it('blocks unsafe image URLs (javascript:) with a placeholder instead of an img', () => {
    const bubble: FlexBubble = {
      type: 'bubble',
      hero: { type: 'image', url: 'javascript:alert(1)' },
    };
    render(<LineFlexRenderer container={bubble} />);
    expect(screen.queryByTestId('flex-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('flex-placeholder')).toBeInTheDocument();
  });
});
