import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { GOOGLE_AUTH_CALLBACK_ROUTE, googleAuthRedirectTo } from '../../lib/auth-redirect';
import { getAuthPersistence, setAuthPersistence } from '../../lib/auth-storage';
import { userFacingError } from '../../lib/errors';
import { Brand } from '../Brand';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Notice } from '../ui/notice';

export type AuthMode = 'login' | 'signup';
type AuthStep = 'credentials' | 'verify' | 'reset-request' | 'reset-code';

export { GOOGLE_AUTH_CALLBACK_ROUTE };

const COPY: Record<
  AuthMode,
  { heading: string; sub: string; submit: string; switchLabel: string; switchHref: string }
> = {
  login: {
    heading: 'Good to see you',
    sub: 'Your projects are right where you left them.',
    submit: 'Sign in',
    switchLabel: 'Sign up',
    switchHref: '#/signup',
  },
  signup: {
    heading: 'Sign up',
    sub: 'Drop your first plan and put the crew on the same sheet.',
    submit: 'Create account',
    switchLabel: 'Sign in',
    switchHref: '#/login',
  },
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

const SSO_BUTTON =
  'inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-line-strong bg-surface text-sm font-semibold text-t1 transition-[background,border-color,transform] hover:border-accent hover:bg-accent-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';

const PRIMARY_BUTTON =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-on-accent shadow-e1 transition-[background,box-shadow,transform] hover:bg-accent-hover hover:shadow-e2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u;

function validateEmail(email: string) {
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

function validateCode(code: string) {
  return /^\d{6}$/u.test(code) ? null : 'Enter the six-digit code from your email.';
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  shown,
  onToggle,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={128}
          required
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-t3 transition-colors hover:text-t1"
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AuthPage({
  mode,
  initialError = null,
}: {
  mode: AuthMode;
  initialError?: string | null;
}) {
  const { signIn } = useAuthActions();
  const copy = COPY[mode];
  const [step, setStep] = useState<AuthStep>('credentials');
  const [pendingEmail, setPendingEmail] = useState('');
  const [submitting, setSubmitting] = useState<'google' | 'email' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => mode === 'signup' || getAuthPersistence() === 'persistent',
  );
  const [error, setError] = useState<string | null>(initialError);
  const [resendAvailableIn, setResendAvailableIn] = useState(0);
  const [codeResent, setCodeResent] = useState(false);
  const pendingPassword = useRef('');

  useEffect(() => {
    setStep('credentials');
    setPendingEmail('');
    setError(initialError);
    setResendAvailableIn(0);
    setCodeResent(false);
    setRememberMe(mode === 'signup' || getAuthPersistence() === 'persistent');
    pendingPassword.current = '';
  }, [initialError, mode]);

  useEffect(() => {
    if (resendAvailableIn <= 0) return;
    const timeout = window.setTimeout(
      () => setResendAvailableIn((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [resendAvailableIn]);

  const busy = submitting !== null;
  const clearError = () => {
    if (error) setError(null);
  };

  const signInWithGoogle = async () => {
    setSubmitting('google');
    setError(null);
    try {
      setAuthPersistence(mode === 'signup' || rememberMe);
      await signIn('google', { redirectTo: googleAuthRedirectTo(window.location.origin) });
    } catch {
      setError('Google sign-in is unavailable. Try again.');
      setSubmitting(null);
    }
  };

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(values.get('password') ?? '');
    const confirmPassword = String(values.get('confirmPassword') ?? '');
    setError(null);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }
    if (mode === 'signup' && !String(values.get('name') ?? '').trim()) {
      setError('Enter your name.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    values.delete('confirmPassword');
    values.set('email', email);
    values.set('flow', mode === 'signup' ? 'signUp' : 'signIn');
    pendingPassword.current = password;
    setSubmitting('email');
    setError(null);

    try {
      setAuthPersistence(mode === 'signup' || rememberMe);
      const result = await signIn('password', values);
      if (!result.signingIn) {
        setPendingEmail(email);
        setResendAvailableIn(30);
        setCodeResent(false);
        setStep('verify');
      }
    } catch (caught) {
      setError(
        userFacingError(
          caught,
          mode === 'login'
            ? 'The email address or password is incorrect.'
            : 'We couldn’t create your account. Try again.',
        ),
      );
    } finally {
      setSubmitting(null);
    }
  };

  const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const code = String(values.get('code') ?? '').trim();
    setError(null);
    const codeError = validateCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }
    values.set('code', code);
    values.set('flow', 'email-verification');
    values.set('email', pendingEmail);
    setSubmitting('email');
    setError(null);

    try {
      setAuthPersistence(mode === 'signup' || rememberMe);
      const result = await signIn('password', values);
      if (!result.signingIn) {
        setError('That code is incorrect or expired. Request a new code and try again.');
      } else {
        window.sessionStorage.setItem(
          'fp:auth-notice',
          mode === 'login'
            ? 'Email verified. You are signed in.'
            : 'Email verified. Your account is ready.',
        );
        pendingPassword.current = '';
      }
    } catch (caught) {
      setError(
        userFacingError(
          caught,
          'That code is incorrect or expired. Request a new code and try again.',
        ),
      );
    } finally {
      setSubmitting(null);
    }
  };

  const resendVerificationCode = async () => {
    if (resendAvailableIn > 0 || busy) return;
    if (!pendingPassword.current) {
      setError('Return to sign in before requesting another code.');
      return;
    }

    const values = new FormData();
    values.set('flow', 'signIn');
    values.set('email', pendingEmail);
    values.set('password', pendingPassword.current);
    setSubmitting('email');
    setError(null);

    try {
      setAuthPersistence(mode === 'signup' || rememberMe);
      const result = await signIn('password', values);
      if (result.signingIn) return;
      setCodeResent(true);
      setResendAvailableIn(30);
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t send a new code. Try again.'));
    } finally {
      setSubmitting(null);
    }
  };

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') ?? '')
      .trim()
      .toLowerCase();
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    values.set('flow', 'reset');
    values.set('email', email);
    setSubmitting('email');
    setError(null);

    try {
      await signIn('password', values);
      setPendingEmail(email);
      setStep('reset-code');
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t send a reset code. Try again.'));
    } finally {
      setSubmitting(null);
    }
  };

  const completePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const code = String(values.get('code') ?? '').trim();
    const newPassword = String(values.get('newPassword') ?? '');
    const confirmPassword = String(values.get('confirmPassword') ?? '');
    setError(null);
    const codeError = validateCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    values.set('code', code);
    values.delete('confirmPassword');
    values.set('flow', 'reset-verification');
    values.set('email', pendingEmail);
    setSubmitting('email');
    setError(null);

    try {
      setAuthPersistence(mode === 'signup' || rememberMe);
      const result = await signIn('password', values);
      if (!result.signingIn) {
        setError('That code is incorrect or expired. Request a new code.');
      } else {
        window.sessionStorage.setItem('fp:auth-notice', 'Password updated. You are signed in.');
      }
    } catch (caught) {
      setError(userFacingError(caught, 'That code is incorrect or expired. Request a new code.'));
    } finally {
      setSubmitting(null);
    }
  };

  const returnToCredentials = () => {
    setStep('credentials');
    setError(null);
    setResendAvailableIn(0);
    setCodeResent(false);
    pendingPassword.current = '';
  };

  const heading =
    step === 'verify'
      ? mode === 'login'
        ? 'Verify your email to sign in'
        : 'Verify your email'
      : step === 'reset-request'
        ? 'Reset your password'
        : step === 'reset-code'
          ? 'Choose a new password'
          : copy.heading;

  const sub =
    step === 'verify'
      ? mode === 'login'
        ? `This email address hasn’t been verified. Enter the six-digit code sent to ${pendingEmail}.`
        : `Enter the six-digit code sent to ${pendingEmail}.`
      : step === 'reset-request'
        ? 'Enter your email address to receive a six-digit reset code.'
        : step === 'reset-code'
          ? `If an account exists for ${pendingEmail}, enter the six-digit code we sent.`
          : copy.sub;

  return (
    <div className="grid h-full bg-surface font-sans text-t1 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="fp-auth-panel flex h-full flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 sm:px-10">
          <a
            href="#/"
            className="mkt-rise inline-flex w-fit"
            style={{ '--rise-delay': '0ms' } as CSSProperties}
          >
            <Brand size="md" />
          </a>

          <main className="flex flex-1 flex-col justify-center py-10">
            <h1
              className="mkt-rise text-balance font-display text-5xl font-bold leading-[0.95] tracking-[-0.02em]"
              style={{ '--rise-delay': '80ms' } as CSSProperties}
            >
              {heading}
            </h1>
            <p
              className="mkt-rise mt-3 max-w-sm text-sm leading-6 text-t2"
              style={{ '--rise-delay': '150ms' } as CSSProperties}
            >
              {sub}
            </p>

            <div className="mkt-rise mt-7" style={{ '--rise-delay': '220ms' } as CSSProperties}>
              {step === 'credentials' && (
                <>
                  <button
                    type="button"
                    className={SSO_BUTTON}
                    disabled={busy}
                    onClick={() => void signInWithGoogle()}
                  >
                    {submitting === 'google' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GoogleMark />
                    )}
                    Continue with Google
                  </button>

                  <div className="my-5 flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-xs text-t3">or use your email</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>

                  <form
                    noValidate
                    onSubmit={(event) => void submitCredentials(event)}
                    onChange={clearError}
                    className="space-y-3.5"
                  >
                    {mode === 'signup' && (
                      <div>
                        <Label htmlFor="signup-name">Name</Label>
                        <Input
                          id="signup-name"
                          name="name"
                          autoComplete="name"
                          maxLength={100}
                          required
                        />
                      </div>
                    )}
                    <div>
                      <Label htmlFor={`${mode}-email`}>Email address</Label>
                      <Input
                        id={`${mode}-email`}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </div>
                    <PasswordField
                      id={`${mode}-password`}
                      name="password"
                      label="Password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      shown={showPassword}
                      onToggle={() => setShowPassword((value) => !value)}
                    />
                    {mode === 'signup' && (
                      <PasswordField
                        id="signup-confirm-password"
                        name="confirmPassword"
                        label="Confirm password"
                        autoComplete="new-password"
                        shown={showPassword}
                        onToggle={() => setShowPassword((value) => !value)}
                      />
                    )}
                    {mode === 'login' && (
                      <label
                        htmlFor="remember-me"
                        className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-t2"
                      >
                        <input
                          id="remember-me"
                          name="rememberMe"
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.currentTarget.checked)}
                          className="size-4 cursor-pointer rounded-xs border-line-strong accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        <span>Remember me</span>
                      </label>
                    )}
                    <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
                      {submitting === 'email' && <Loader2 className="size-4 animate-spin" />}
                      {copy.submit}
                    </button>
                  </form>
                </>
              )}

              {step === 'verify' && (
                <form
                  noValidate
                  onSubmit={(event) => void verifyEmail(event)}
                  onChange={clearError}
                  className="space-y-4"
                >
                  <Notice tone="info" compact>
                    {codeResent
                      ? 'A new code was sent. Enter it within 15 minutes.'
                      : mode === 'login'
                        ? 'For your security, unverified accounts cannot sign in.'
                        : 'Enter the six-digit code within 15 minutes.'}
                  </Notice>
                  <div>
                    <Label htmlFor="verification-code">Verification code</Label>
                    <Input
                      id="verification-code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      className="font-mono tracking-[0.28em]"
                    />
                  </div>
                  <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
                    {submitting === 'email' && <Loader2 className="size-4 animate-spin" />}
                    {mode === 'login' ? 'Verify and sign in' : 'Verify email'}
                  </button>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <button
                      type="button"
                      disabled={busy || resendAvailableIn > 0}
                      onClick={() => void resendVerificationCode()}
                      className="cursor-pointer font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:text-t3 disabled:no-underline"
                    >
                      {resendAvailableIn > 0
                        ? `Resend code in ${resendAvailableIn}s`
                        : 'Resend code'}
                    </button>
                    <button
                      type="button"
                      onClick={returnToCredentials}
                      className="cursor-pointer font-semibold text-t2 hover:text-t1"
                    >
                      {mode === 'login' ? 'Back to sign in' : 'Use a different email'}
                    </button>
                  </div>
                </form>
              )}

              {step === 'reset-request' && (
                <form
                  noValidate
                  onSubmit={(event) => void requestPasswordReset(event)}
                  onChange={clearError}
                  className="space-y-4"
                >
                  <div>
                    <Label htmlFor="reset-email">Email address</Label>
                    <Input
                      id="reset-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
                    {submitting === 'email' && <Loader2 className="size-4 animate-spin" />}
                    Send reset code
                  </button>
                  <button
                    type="button"
                    onClick={returnToCredentials}
                    className="w-full cursor-pointer text-xs font-semibold text-t2 hover:text-t1"
                  >
                    Back to sign in
                  </button>
                </form>
              )}

              {step === 'reset-code' && (
                <form
                  noValidate
                  onSubmit={(event) => void completePasswordReset(event)}
                  onChange={clearError}
                  className="space-y-3.5"
                >
                  <div>
                    <Label htmlFor="reset-code">Reset code</Label>
                    <Input
                      id="reset-code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      className="font-mono tracking-[0.28em]"
                    />
                  </div>
                  <PasswordField
                    id="new-password"
                    name="newPassword"
                    label="New password"
                    autoComplete="new-password"
                    shown={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                  />
                  <PasswordField
                    id="confirm-new-password"
                    name="confirmPassword"
                    label="Confirm new password"
                    autoComplete="new-password"
                    shown={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                  />
                  <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
                    {submitting === 'email' && <Loader2 className="size-4 animate-spin" />}
                    Reset password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('reset-request');
                      setError(null);
                    }}
                    className="w-full cursor-pointer text-xs font-semibold text-t2 hover:text-t1"
                  >
                    Request a new code
                  </button>
                </form>
              )}
            </div>

            <div className="mt-3 min-h-5" aria-live="polite" aria-atomic="true">
              {error && (
                <p role="alert" className="break-words text-xs font-medium leading-5 text-danger">
                  {error}
                </p>
              )}
            </div>

            {step === 'credentials' && (
              <div
                className="mkt-rise mt-3 flex items-center justify-between text-xs"
                style={{ '--rise-delay': '300ms' } as CSSProperties}
              >
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('reset-request');
                      setError(null);
                    }}
                    className="cursor-pointer text-t2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-t1"
                  >
                    Reset password
                  </button>
                ) : (
                  <span />
                )}
                <a href={copy.switchHref} className="font-semibold text-accent hover:underline">
                  {copy.switchLabel}
                </a>
              </div>
            )}
          </main>
        </div>
      </div>

      <div className="relative hidden overflow-hidden lg:block" aria-hidden>
        <img
          src="/images/auth/blueprint-collage.png"
          alt=""
          className="mkt-img-in absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(15_40_72_/_0.78))]" />
        <p className="absolute bottom-12 left-12 max-w-sm font-display text-5xl font-bold leading-[0.95] text-white drop-shadow-lg">
          Plans move.
          <br />
          Work follows.
        </p>
      </div>
    </div>
  );
}
