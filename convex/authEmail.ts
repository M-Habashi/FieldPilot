import type { EmailConfig } from '@convex-dev/auth/server';

const CODE_MAX_AGE_SECONDS = 15 * 60;
const BREVO_TRANSACTIONAL_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

function environment(name: 'AUTH_BREVO_KEY' | 'AUTH_EMAIL_FROM') {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

export function assertAuthEmailConfigured() {
  if (!environment('AUTH_BREVO_KEY') || !environment('AUTH_EMAIL_FROM')) {
    throw new Error(
      'Email verification is temporarily unavailable. Continue with Google or try again later.',
    );
  }
}

function generateSixDigitCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100_000 + (values[0] % 900_000));
}

function normalizeEmail(identifier: string) {
  return identifier.trim().toLowerCase();
}

function emailBody(code: string, purpose: 'verify' | 'reset') {
  const title =
    purpose === 'verify' ? 'Verify your FieldPilot email' : 'Reset your FieldPilot password';
  const intro =
    purpose === 'verify'
      ? 'Use this code to finish creating your FieldPilot account.'
      : 'Use this code to choose a new password for your FieldPilot account.';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:520px;margin:40px auto;padding:32px;background:#ffffff;border:1px solid #dfe3e8;border-radius:10px">
      <div style="font-size:20px;font-weight:700;margin-bottom:22px">FieldPilot</div>
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${title}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#4b5563">${intro}</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px 20px;background:#f3f6fb;border-radius:8px;text-align:center">${code}</div>
      <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#6b7280">This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  </body>
</html>`;
}

function brevoOtpProvider(
  id: 'fieldpilot-email-verification' | 'fieldpilot-password-reset',
  purpose: 'verify' | 'reset',
): EmailConfig {
  return {
    id,
    type: 'email',
    name: purpose === 'verify' ? 'FieldPilot email verification' : 'FieldPilot password reset',
    from: environment('AUTH_EMAIL_FROM'),
    maxAge: CODE_MAX_AGE_SECONDS,
    normalizeIdentifier: normalizeEmail,
    generateVerificationToken: async () => generateSixDigitCode(),
    authorize: async (params, account) => {
      const emailParam = params.email;
      const suppliedEmail = typeof emailParam === 'string' ? normalizeEmail(emailParam) : '';
      const accountEmail = account.providerAccountId;
      if (
        !suppliedEmail ||
        typeof accountEmail !== 'string' ||
        suppliedEmail !== normalizeEmail(accountEmail)
      ) {
        throw new Error('Invalid verification code');
      }
    },
    sendVerificationRequest: async ({ identifier, token }) => {
      assertAuthEmailConfigured();
      const apiKey = environment('AUTH_BREVO_KEY')!;
      const from = environment('AUTH_EMAIL_FROM')!;

      // Brevo is the temporary alpha sender because it can verify an existing mailbox before
      // FieldPilot owns a domain. Keep this call server-side: AUTH_BREVO_KEY must never be exposed
      // through a VITE_* variable or sent to the browser. AUTH_EMAIL_FROM is the mailbox verified
      // in Brevo; Brevo may rewrite its visible address until a FieldPilot domain is authenticated.
      const response = await fetch(BREVO_TRANSACTIONAL_EMAIL_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'FieldPilot',
            email: from,
          },
          to: [{ email: identifier }],
          subject:
            purpose === 'verify'
              ? 'Verify your FieldPilot email'
              : 'Reset your FieldPilot password',
          htmlContent: emailBody(token, purpose),
        }),
      });

      if (!response.ok) {
        // Do not log Brevo's response body: provider errors can echo recipient information.
        console.error('Brevo rejected an authentication email', response.status);
        throw new Error('We couldn’t send the email code. Try again.');
      }
    },
  };
}

export const emailVerificationProvider = brevoOtpProvider(
  'fieldpilot-email-verification',
  'verify',
);

export const passwordResetProvider = brevoOtpProvider('fieldpilot-password-reset', 'reset');
