import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { usePresence } from '../../hooks/usePresence';
import { ActionBarButton } from '../ui/action-bar';
import { AIChatPanel } from './AIChatPanel';
import { ChatErrorBoundary } from './ChatErrorBoundary';

/**
 * AI assistant entry point for the plan workspace. The launch button anchors
 * to the top-right of the content area, directly below the header's Sign out
 * control, and opens a right-hand chat panel that overlays the viewer.
 */
export function AIChat({
  projectId,
  projectName,
  activeView,
  threadId,
  onNewThread,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  activeView: string;
  threadId: string;
  onNewThread: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, state, onAnimationEnd } = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <ActionBarButton
        icon={<Bot />}
        label="AI Chat"
        active={open}
        className="fp-chat-launch absolute top-1 right-2 z-40"
        data-open={open}
        aria-hidden={open}
        tabIndex={open ? -1 : undefined}
        title="Ask the AI assistant"
        onClick={() => setOpen(true)}
      />
      {mounted && (
        <aside
          data-state={state}
          onAnimationEnd={onAnimationEnd}
          aria-label="AI chat"
          className="fp-panel fp-chat-panel absolute inset-y-0 right-0 z-40 flex min-h-0 w-full max-w-[380px] flex-col"
        >
          <ChatErrorBoundary onClose={() => setOpen(false)}>
            <AIChatPanel
              key={threadId}
              projectId={projectId}
              projectName={projectName}
              activeView={activeView}
              threadId={threadId}
              onNewThread={onNewThread}
              onClose={() => setOpen(false)}
            />
          </ChatErrorBoundary>
        </aside>
      )}
    </>
  );
}
