import type { EmailConfig } from '@convex-dev/auth/server';

const CODE_MAX_AGE_SECONDS = 15 * 60;

function environment(name: 'AUTH_RESEND_KEY' | 'AUTH_EMAIL_FROM') {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
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

function resendOtpProvider(
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
      const apiKey = environment('AUTH_RESEND_KEY');
      const from = environment('AUTH_EMAIL_FROM');
      if (!apiKey || !from) {
        throw new Error(
          'Email delivery is not configured. Set AUTH_RESEND_KEY and AUTH_EMAIL_FROM in Convex.',
        );
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [identifier],
          subject:
            purpose === 'verify'
              ? 'Verify your FieldPilot email'
              : 'Reset your FieldPilot password',
          html: emailBody(token, purpose),
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error('Resend rejected an authentication email', response.status, detail);
        throw new Error('We could not send the email code. Please try again.');
      }
    },
  };
}

export const emailVerificationProvider = resendOtpProvider(
  'fieldpilot-email-verification',
  'verify',
);

export const passwordResetProvider = resendOtpProvider('fieldpilot-password-reset', 'reset');
