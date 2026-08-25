import { getMigrations } from 'better-auth/db/migration';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stand in for the real Resend SDK so these tests never make a network call.
// auth.ts only ever calls `resend.emails.send(...)`, so that's all this fake
// needs to provide.
const sendMock = vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

const REQUIRED_ENV = {
  BETTER_AUTH_SECRET: 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  BETTER_AUTH_URL: 'http://localhost:8787',
  RESEND_API_KEY: 'test-resend-key',
};

describe('auth.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('required env vars', () => {
    // vitest sets NODE_ENV=test, which auth.ts already reads to pick an
    // in-memory database — nothing here touches server/data/auth.db.
    for (const key of Object.keys(REQUIRED_ENV) as (keyof typeof REQUIRED_ENV)[]) {
      it(`exits with a clear message when ${key} is unset`, async () => {
        delete process.env[key];
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(import('./auth.js')).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(key));

        exitSpy.mockRestore();
        errorSpy.mockRestore();
      });
    }

    it('reports every missing var at once, not just the first', async () => {
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.RESEND_API_KEY;
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(import('./auth.js')).rejects.toThrow('process.exit called');

      const message = errorSpy.mock.calls[0]?.[0] as string;
      expect(message).toContain('BETTER_AUTH_SECRET');
      expect(message).toContain('RESEND_API_KEY');
      expect(message).not.toContain('BETTER_AUTH_URL');
    });
  });

  describe('instance construction', () => {
    it('constructs a working Better Auth instance given valid config', async () => {
      const { auth } = await import('./auth.js');

      expect(auth.handler).toBeInstanceOf(Function);
      expect(auth.options.emailAndPassword?.enabled).toBe(true);
      // 2026-08-25 security review (Vuln 3): required so sign-up returns
      // Better Auth's generic synthetic-user response for a duplicate email
      // instead of a distinguishable "already exists" error.
      expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
      expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
      expect(auth.options.emailVerification?.sendOnSignIn).toBe(true);
      // Scoped to exactly email/password + the Expo integration — no OAuth
      // providers configured, no plugin beyond expo().
      expect('socialProviders' in auth.options).toBe(false);
      expect(auth.options.plugins).toHaveLength(1);
    });

    it('trusts the app scheme so the Expo plugin can deep-link back into the app', async () => {
      const { auth } = await import('./auth.js');
      expect(auth.options.trustedOrigins).toContain('splitsy://');
    });
  });

  describe('route smoke test', () => {
    it('registers (no session, per requireEmailVerification), blocks sign-in until verified, and sends a reset email', async () => {
      const { auth } = await import('./auth.js');
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();

      const signUpRes = await auth.handler(
        new Request('http://localhost:8787/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password1234',
          }),
        }),
      );
      expect(signUpRes.status).toBe(200);
      const signUpBody = await signUpRes.json();
      expect(signUpBody.user.email).toBe('test@example.com');
      // No session on sign-up: requireEmailVerification makes
      // shouldSkipAutoSignIn true in Better Auth's own sign-up route — the
      // account exists, but isn't usable, until the emailed link is followed.
      expect(signUpBody.token).toBeNull();
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
        to: 'test@example.com',
        subject: expect.stringContaining('Verify your Splitsy email'),
      });
      sendMock.mockClear();

      // Correct password, but the account isn't verified yet — must be
      // rejected, not silently let through.
      const blockedSignInRes = await auth.handler(
        new Request('http://localhost:8787/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password1234' }),
        }),
      );
      expect(blockedSignInRes.status).toBe(403);
      expect((await blockedSignInRes.json()).code).toBe('EMAIL_NOT_VERIFIED');
      // sendOnSignIn: true — a blocked sign-in attempt also resends the
      // verification link, so a user who lost the first email isn't stuck.
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
        to: 'test@example.com',
        subject: expect.stringContaining('Verify your Splitsy email'),
      });
      sendMock.mockClear();

      const resetRes = await auth.handler(
        new Request('http://localhost:8787/api/auth/request-password-reset', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        }),
      );
      expect(resetRes.status).toBe(200);
      // Better Auth reports success regardless of whether the email exists,
      // to avoid leaking account existence — the real signal that
      // sendResetPassword ran is the mock having been called. Password reset
      // deliberately works even for an unverified account (it's a distinct
      // concern from email verification), so no EMAIL_NOT_VERIFIED gate here.
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
        to: 'test@example.com',
        subject: expect.stringContaining('Reset your Splitsy password'),
      });
    });

    it('rejects sign-in with the wrong password', async () => {
      const { auth } = await import('./auth.js');
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();

      await auth.handler(
        new Request('http://localhost:8787/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Test User',
            email: 'wrong-pw@example.com',
            password: 'password1234',
          }),
        }),
      );

      const signInRes = await auth.handler(
        new Request('http://localhost:8787/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'wrong-pw@example.com', password: 'not-the-password' }),
        }),
      );

      expect(signInRes.status).toBe(401);
    });
  });
});
