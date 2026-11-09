import { afterEach, describe, expect, it, vi } from 'vitest';

import { pagesRoute } from './pages.js';

// Same fake as auth.test.ts — the app-level test below constructs the real
// Better Auth instance, which must never make a network call.
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: vi.fn() } })),
}));

describe('public pages', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('GET /privacy returns a self-contained HTML privacy policy', async () => {
    const res = await pagesRoute.request('/privacy');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    for (const topic of [
      'Groq',
      'Resend',
      'Neon',
      'Better Auth',
      'camera',
      'daily',
      '/delete-account',
      'TODO',
    ]) {
      expect(html).toContain(topic);
    }
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
  });

  it("GET /delete-account returns an HTML form that only calls this origin's auth endpoints", async () => {
    const res = await pagesRoute.request('/delete-account');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("fetch('/api/auth/sign-in/email'");
    expect(html).toContain("fetch('/api/auth/delete-user'");
    // Best-effort sign-out when sign-in succeeded but deletion failed.
    expect(html).toContain("fetch('/api/auth/sign-out'");
    // Unverified accounts get a verification link that lands back here.
    expect(html).toContain("fetch('/api/auth/send-verification-email'");
    expect(html).toContain("callbackURL: '/delete-account'");
    expect(html).toContain('Send verification email');
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
    expect(html).not.toContain('innerHTML');
  });

  it('serves both pages through the full app, outside the /api/* CORS middleware', async () => {
    Object.assign(process.env, {
      BETTER_AUTH_SECRET: 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      BETTER_AUTH_URL: 'http://localhost:8787',
      RESEND_API_KEY: 'test-resend-key',
    });
    const { app } = await import('../app.js');

    for (const path of ['/privacy', '/delete-account']) {
      const res = await app.request(path, { headers: { origin: 'https://evil.example' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
  });
});
