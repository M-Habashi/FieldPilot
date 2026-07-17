import { useRef, useState } from 'react';
import { FileText, FolderOpen, Loader2, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface EmptyStateProps {
  loading: boolean;
  error: string | null;
  onOpen: (file: File) => void;
  onLoadDemo: () => void;
}

export function EmptyState({ loading, error, onOpen, onLoadDemo }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="fp-canvas-stage flex h-full w-full items-center justify-center p-6">
      <div
        className={cn(
          'fp-empty w-full max-w-md p-10 text-center shadow-e1',
          dragOver && 'fp-empty-dragover',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onOpen(file);
        }}
      >
        {loading ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-4 text-sm text-t2">Opening plan…</p>
          </>
        ) : (
          <>
            <span className="mx-auto flex size-14 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <MapPin className="size-7" />
            </span>
            <h1 className="mt-5 font-display text-xl font-bold text-t1">Start with a plan</h1>
            <p className="mt-2 text-sm text-t2">
              Open a PDF plan set, then drop pins to track tasks, notes, and photos right on the
              sheet. Everything is saved in this browser.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button variant="default" onClick={() => inputRef.current?.click()}>
                <FolderOpen /> Open PDF plan
              </Button>
              <Button variant="secondary" onClick={onLoadDemo}>
                <FileText /> Load demo plan
              </Button>
            </div>
            <p className="mt-4 text-xs text-t3">…or drag a PDF here</p>
            {error && (
              <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                {error}
              </p>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onOpen(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
