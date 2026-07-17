import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useProject } from '../store/project';
import { Button } from './ui/button';

interface StatusBarProps {
  hasDoc: boolean;
}

export function StatusBar({ hasDoc }: StatusBarProps) {
  const currentPage = useProject((s) => s.currentPage);
  const pageCount = useProject((s) => s.pageCount);
  const setPage = useProject((s) => s.setPage);
  const addPinMode = useProject((s) => s.addPinMode);
  const taskCount = useProject((s) => Object.keys(s.tasks).length);

  return (
    <footer className="fp-statusbar z-30 flex shrink-0 items-center gap-3 px-3">
      <div className="flex items-center gap-1">
        {hasDoc && pageCount > 1 && (
          <>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Previous sheet"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center font-mono text-xs text-t2 tabular-nums">
              Sheet {currentPage} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Next sheet"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 text-[11px] text-t3">
        {hasDoc && (
          <>
            <span className="font-mono tabular-nums">
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </span>
            <span
              className="hidden transition-opacity duration-(--fp-dur-fast) ease-(--fp-ease) sm:inline"
              style={{ opacity: addPinMode ? 1 : 0.55 }}
            >
              <kbd className="font-mono">P</kbd> add pin ·{' '}
              <kbd className="font-mono">Esc</kbd> cancel
            </span>
          </>
        )}
      </div>
    </footer>
  );
}
