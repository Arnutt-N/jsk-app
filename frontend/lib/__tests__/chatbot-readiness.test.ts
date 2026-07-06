import { describe, it, expect } from 'vitest';
import { getCategoryReadiness, readinessDotClass } from '../chatbot-readiness';

describe('getCategoryReadiness', () => {
  it('returns ready when active and has active responses', () => {
    expect(getCategoryReadiness({ is_active: true, active_response_count: 2 })).toBe('ready');
  });
  it('returns incomplete when active but zero active responses', () => {
    expect(getCategoryReadiness({ is_active: true, active_response_count: 0 })).toBe('incomplete');
  });
  it('returns inactive when not active regardless of responses', () => {
    expect(getCategoryReadiness({ is_active: false, active_response_count: 5 })).toBe('inactive');
  });
});

describe('readinessDotClass', () => {
  it('maps readiness to the right Tailwind color', () => {
    expect(readinessDotClass('ready')).toBe('bg-success');
    expect(readinessDotClass('incomplete')).toBe('bg-warning');
    expect(readinessDotClass('inactive')).toBe('bg-border-hover');
  });
});
