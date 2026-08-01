import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailVerificationProvider, passwordResetProvider } from './authEmail';

function verificationRequest(
  provider: typeof emailVerificationProvider,
  identifier = 'new-user@example.com',
) {
  return {
    identifier,
    token: '123456',
    url: 'https://fieldpilot.example/verify',
    expires: new Date(Date.now() + 15 * 60 * 1000),
    provider,
    theme: {},
    request: new Request('https://fieldpilot.example/sign-in'),
  } as Parameters<typeof provider.sendVerificationRequest>[0];
}

describe('Brevo authentication email delivery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps the API key server-side and sends the Brevo transactional payload', async () => {
    vi.stubEnv('AUTH_BREVO_KEY', 'test-brevo-key');
    vi.stubEnv('AUTH_EMAIL_FROM', 'fieldpilot-sender@example.com');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 }),
      );

    await emailVerificationProvider.sendVerificationRequest(
      verificationRequest(emailVerificationProvider),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      'api-key': 'test-brevo-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      sender: { name: 'FieldPilot', email: 'fieldpilot-sender@example.com' },
      to: [{ email: 'new-user@example.com' }],
      subject: 'Verify your FieldPilot email',
    });
    expect(JSON.parse(String(options?.body)).htmlContent).toContain('123456');
  });

  it('uses the same provider boundary for password-reset emails', async () => {
    vi.stubEnv('AUTH_BREVO_KEY', 'test-brevo-key');
    vi.stubEnv('AUTH_EMAIL_FROM', 'fieldpilot-sender@example.com');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 }),
      );

    await passwordResetProvider.sendVerificationRequest(verificationRequest(passwordResetProvider));

    const options = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(options?.body)).subject).toBe('Reset your FieldPilot password');
  });

  it('fails clearly when the Convex deployment is not configured', async () => {
    vi.stubEnv('AUTH_BREVO_KEY', '');
    vi.stubEnv('AUTH_EMAIL_FROM', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      emailVerificationProvider.sendVerificationRequest(
        verificationRequest(emailVerificationProvider),
      ),
    ).rejects.toThrow(
      'Email delivery is not configured. Set AUTH_BREVO_KEY and AUTH_EMAIL_FROM in Convex.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
