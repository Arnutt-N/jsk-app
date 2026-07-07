import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SessionActions } from '../SessionActions';
import type { Session } from '../../_types';

// Minimal handler stubs shared by every render. Labels & aria are the unit
// under test (L10), so behavior is never exercised here.
const handlers = {
  onClaim: vi.fn(),
  onClose: vi.fn(),
  onTransfer: vi.fn(),
};

describe('SessionActions Thai labels (L10)', () => {
  it('WAITING session renders the รับแชท claim button', () => {
    // Arrange
    const session: Session = { id: 1, status: 'WAITING' };

    // Act
    render(<SessionActions session={session} claiming={false} {...handlers} />);

    // Assert — getByRole matches accessible name (aria-label "รับแชท")
    expect(screen.getByRole('button', { name: 'รับแชท' })).toBeInTheDocument();
  });

  it('WAITING + claiming shows the กำลังรับแชท… in-progress text', () => {
    // Arrange
    const session: Session = { id: 1, status: 'WAITING' };

    // Act — aria-label stays "รับแชท" while the visible text flips to the
    // loading copy, so assert on the rendered text node.
    render(<SessionActions session={session} claiming {...handlers} />);

    // Assert
    expect(screen.getByText('กำลังรับแชท…')).toBeInTheDocument();
  });

  it('ACTIVE session renders both โอนแชท and ปิดแชท buttons', () => {
    // Arrange
    const session: Session = { id: 2, status: 'ACTIVE' };

    // Act
    render(<SessionActions session={session} claiming={false} {...handlers} />);

    // Assert
    expect(screen.getByRole('button', { name: 'โอนแชท' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ปิดแชท' })).toBeInTheDocument();
    // Claim button must not appear in the ACTIVE state
    expect(screen.queryByRole('button', { name: 'รับแชท' })).not.toBeInTheDocument();
  });

  it('the action wrapper exposes the Thai group aria-label การจัดการแชท', () => {
    // Arrange
    const session: Session = { id: 3, status: 'ACTIVE' };

    // Act
    const { container } = render(
      <SessionActions session={session} claiming={false} {...handlers} />,
    );

    // Assert — read the aria-label directly to avoid accessible-name
    // computation quirks for the generic `group` role.
    const group = container.querySelector('[role="group"]');
    expect(group).not.toBeNull();
    expect(group).toHaveAttribute('aria-label', 'การจัดการแชท');
  });
});
