import { Loader2 } from 'lucide-react';
import { Brand } from './Brand';

export function AuthLoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-surface text-t1">
      <div className="text-center">
        <Brand size="md" />
        <Loader2 className="mx-auto mt-4 size-6 animate-spin text-accent" />
        <p className="mt-3 text-sm text-t2">Checking your FieldPilot session…</p>
      </div>
    </div>
  );
}
