import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Bot } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { usePresence } from '../../hooks/usePresence';
import { ActionBarButton } from '../ui/action-bar';
import { AIChatPanel } from './AIChatPanel';
import { ChatErrorBoundary } from './ChatErrorBoundary';

const CHAT_PANEL_DEFAULT_WIDTH = 380;
const CHAT_PANEL_EXPANDED_WIDTH = 640;
const CHAT_PANEL_MIN_WIDTH = 340;
const CHAT_PANEL_MAX_WIDTH = 760;
const CHAT_PANEL_VIEWPORT_MARGIN = 72;

function maximumPanelWidth() {
  if (typeof window === 'undefined') return CHAT_PANEL_MAX_WIDTH;
  return Math.max(
    CHAT_PANEL_MIN_WIDTH,
    Math.min(CHAT_PANEL_MAX_WIDTH, window.innerWidth - CHAT_PANEL_VIEWPORT_MARGIN),
  );
}

function clampPanelWidth(width: number) {
  return Math.min(maximumPanelWidth(), Math.max(CHAT_PANEL_MIN_WIDTH, width));
}

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
  const [panelWidth, setPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const { mounted, state, onAnimationEnd } = usePresence(open);
  const expanded = panelWidth > CHAT_PANEL_DEFAULT_WIDTH + 60;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(
    () => () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    [],
  );

  const togglePanelWidth = () => {
    setPanelWidth(expanded ? CHAT_PANEL_DEFAULT_WIDTH : clampPanelWidth(CHAT_PANEL_EXPANDED_WIDTH));
  };

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    resizeStart.current = { pointerId: event.pointerId, x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setResizing(true);
  };

  const continueResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (start === null || start.pointerId !== event.pointerId) return;
    setPanelWidth(clampPanelWidth(start.width + start.x - event.clientX));
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeStart.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeStart.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setResizing(false);
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let width: number | null = null;
    if (event.key === 'ArrowLeft') width = panelWidth + 32;
    if (event.key === 'ArrowRight') width = panelWidth - 32;
    if (event.key === 'Home') width = CHAT_PANEL_MIN_WIDTH;
    if (event.key === 'End') width = maximumPanelWidth();
    if (width === null) return;
    event.preventDefault();
    setPanelWidth(clampPanelWidth(width));
  };

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
          className="fp-panel fp-chat-panel absolute inset-y-0 right-0 z-40 flex min-h-0 max-w-full flex-col"
          style={{
            width: `min(100%, ${panelWidth}px)`,
            transition: resizing ? 'none' : 'width var(--fp-dur-med) var(--fp-ease)',
          }}
        >
          <div
            role="separator"
            aria-label="Resize AI chat panel"
            aria-orientation="vertical"
            aria-valuemin={CHAT_PANEL_MIN_WIDTH}
            aria-valuemax={maximumPanelWidth()}
            aria-valuenow={Math.round(panelWidth)}
            tabIndex={0}
            className="group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none outline-none sm:block"
            onDoubleClick={togglePanelWidth}
            onPointerDown={beginResize}
            onPointerMove={continueResize}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onKeyDown={resizeWithKeyboard}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line-strong transition-[width,background-color] group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent" />
          </div>
          <ChatErrorBoundary onClose={() => setOpen(false)}>
            <AIChatPanel
              key={threadId}
              projectId={projectId}
              projectName={projectName}
              activeView={activeView}
              threadId={threadId}
              expanded={expanded}
              onToggleExpanded={togglePanelWidth}
              onNewThread={onNewThread}
              onClose={() => setOpen(false)}
            />
          </ChatErrorBoundary>
        </aside>
      )}
    </>
  );
}
