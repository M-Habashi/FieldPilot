import { Loader2 } from 'lucide-react';
import { Brand } from './Brand';

export function AuthLoadingScreen() {
  return (
    <div className="fp-auth-panel flex h-full items-center justify-center text-t1">
      <div className="rounded-lg bg-surface px-10 py-9 text-center shadow-e2 ring-1 ring-line">
        <Brand size="md" />
        <Loader2 className="mx-auto mt-4 size-6 animate-spin text-accent" />
        <p className="mt-3 text-sm text-t2">Checking your FieldPilot session…</p>
      </div>
    </div>
  );
}
