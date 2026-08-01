import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from './ui/button';

export function AuthLoadingScreen() {
  return (
    <div className="fp-canvas-stage flex h-full items-center justify-center bg-app text-t1">
      <div className="text-center">
        <Loader2 className="mx-auto size-7 animate-spin text-accent" />
        <p className="mt-3 text-sm text-t2">Checking your FieldPilot session…</p>
      </div>
    </div>
  );
}

export function SignInScreen() {
  const { signIn } = useAuthActions();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signIn('google');
    } catch {
      setError('Google sign-in could not be started. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fp-canvas-stage flex h-full items-center justify-center bg-app p-6 text-t1">
      <main className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 text-center shadow-e2">
        <span className="mx-auto flex size-14 items-center justify-center rounded-lg bg-accent text-on-accent">
          <MapPin className="size-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">FieldPilot</h1>
        <p className="mt-2 text-sm text-t2">
          Sign in to keep project ownership, task authorship, notes, and attachments tied to a real
          user.
        </p>
        <Button
          variant="default"
          className="mt-6 w-full"
          disabled={submitting}
          onClick={() => void signInWithGoogle()}
        >
          {submitting ? <Loader2 className="animate-spin" /> : <span className="font-bold">G</span>}
          Continue with Google
        </Button>
        <p className="mt-4 text-xs text-t3">Private alpha · approved Google test users only</p>
        {error && (
          <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
