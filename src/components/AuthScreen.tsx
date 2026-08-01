import { Loader2 } from 'lucide-react';

export function AuthLoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-surface text-t1">
      <div className="text-center">
        <p className="font-display text-lg font-bold tracking-tight">FieldPilot</p>
        <Loader2 className="mx-auto mt-4 size-6 animate-spin text-accent" />
        <p className="mt-3 text-sm text-t2">Checking your FieldPilot session…</p>
      </div>
    </div>
  );
}
