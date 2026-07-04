import { describe, test, expect, vi, afterEach } from 'vitest';
import { buildLiveChatWsUrl, getLiveChatWsUrl } from '../wsUrl';

describe('buildLiveChatWsUrl', () => {
  const pageLocation = { protocol: 'https:', host: 'jsk-app.vercel.app' };

  test('connects directly to backend when API URL is absolute https', () => {
    // Arrange
    const apiUrl = 'https://backend.example.koyeb.app/api/v1';

    // Act
    const url = buildLiveChatWsUrl(apiUrl, pageLocation);

    // Assert
    expect(url).toBe('wss://backend.example.koyeb.app/api/v1/ws/live-chat');
  });

  test('uses ws scheme when API URL is absolute http', () => {
    const url = buildLiveChatWsUrl('http://localhost:8000/api/v1', {
      protocol: 'http:',
      host: 'localhost:3000',
    });

    expect(url).toBe('ws://localhost:8000/api/v1/ws/live-chat');
  });

  test('strips trailing slashes from the API URL before appending the path', () => {
    const url = buildLiveChatWsUrl('https://backend.example.koyeb.app/api/v1/', pageLocation);

    expect(url).toBe('wss://backend.example.koyeb.app/api/v1/ws/live-chat');
  });

  test('falls back to page host when API URL is undefined', () => {
    const url = buildLiveChatWsUrl(undefined, pageLocation);

    expect(url).toBe('wss://jsk-app.vercel.app/api/v1/ws/live-chat');
  });

  test('falls back to page host when API URL is relative', () => {
    const url = buildLiveChatWsUrl('/api/v1', pageLocation);

    expect(url).toBe('wss://jsk-app.vercel.app/api/v1/ws/live-chat');
  });

  test('fallback uses ws scheme on plain http pages', () => {
    const url = buildLiveChatWsUrl(undefined, { protocol: 'http:', host: 'localhost:3000' });

    expect(url).toBe('ws://localhost:3000/api/v1/ws/live-chat');
  });
});

describe('getLiveChatWsUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('derives the URL from NEXT_PUBLIC_API_URL when set to an absolute URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://backend.example.koyeb.app/api/v1');

    expect(getLiveChatWsUrl()).toBe('wss://backend.example.koyeb.app/api/v1/ws/live-chat');
  });
});
