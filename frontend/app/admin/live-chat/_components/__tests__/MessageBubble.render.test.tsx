import { render } from '@testing-library/react';
import { describe, test, expect } from 'vitest';

import { MessageBubble } from '../MessageBubble';
import type { Message } from '@/lib/websocket/types';

function makeMessage(over: Partial<Message>): Message {
  return {
    id: 1,
    direction: 'OUTGOING',
    message_type: 'text',
    content: 'hello',
    created_at: '2026-07-05T00:00:00Z',
    ...over,
  } as unknown as Message;
}

function renderBubble(over: Partial<Message>) {
  return render(
    <MessageBubble
      message={makeMessage(over)}
      isPending={false}
      isFailed={false}
      formattedTime="10:00"
      senderLabel="ผู้ใช้"
      showSender={false}
      showAvatar={false}
    />
  );
}

describe('MessageBubble row alignment', () => {
  test('outgoing (bot/admin) bubbles align to the right edge', () => {
    const { container } = renderBubble({ direction: 'OUTGOING' });
    const row = container.firstElementChild!;
    expect(row.className).toContain('justify-end');
    // flex-row-reverse flips the main axis, sending justify-end content LEFT —
    // the exact bug where both parties rendered on the same side.
    expect(row.className).not.toContain('flex-row-reverse');
  });

  test('incoming (customer) bubbles align to the left edge', () => {
    const { container } = renderBubble({ direction: 'INCOMING' });
    expect(container.firstElementChild!.className).toContain('justify-start');
  });
});

describe('MessageBubble content types', () => {
  test('renders a video player for video messages', () => {
    const { container } = renderBubble({
      message_type: 'video',
      content: '[Video]',
      payload: { url: 'https://cdn.example/v.mp4' },
    } as Partial<Message>);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('https://cdn.example/v.mp4');
  });

  test('renders an audio player for audio messages', () => {
    const { container } = renderBubble({
      message_type: 'audio',
      content: '[Audio]',
      payload: { url: 'https://cdn.example/a.m4a' },
    } as Partial<Message>);
    expect(container.querySelector('audio')).not.toBeNull();
  });

  test('renders a map link with the title for location messages', () => {
    const { container } = renderBubble({
      message_type: 'location',
      content: 'สำนักงานยุติธรรม',
      payload: { lat: 13.75, lng: 100.5 },
    } as Partial<Message>);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toContain('13.75');
    expect(link!.textContent).toContain('สำนักงานยุติธรรม');
  });

  test('flex messages show their alt text instead of a generic label', () => {
    const { getByText } = renderBubble({ message_type: 'flex', content: 'เมนูบริการ' });
    expect(getByText(/เมนูบริการ/)).toBeTruthy();
  });

  test('template messages show their alt text', () => {
    const { getByText } = renderBubble({ message_type: 'template', content: 'ยืนยันการทำรายการ' });
    expect(getByText(/ยืนยันการทำรายการ/)).toBeTruthy();
  });
});
