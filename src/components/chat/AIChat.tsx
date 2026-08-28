import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Bot } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { usePanelHandoff } from '../../hooks/usePanelHandoff';
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
 * AI assistant entry point for the project workspace. Its trigger is rendered
 * by the active view's action bar; this component owns the coordinated
 * right-hand panel below that persistent bar.
 */
export function AIChatTrigger({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <ActionBarButton
      icon={<Bot />}
      label="AI Chat"
      labelFrom="lg"
      active={open}
      aria-pressed={open}
      title="Ask the AI assistant"
      onClick={onOpen}
    />
  );
}

export function AIChat({
  projectId,
  projectName,
  activeView,
  threadId,
  open,
  handoffIncoming,
  handoffWidth,
  onClose,
  onHandoffComplete,
  onPanelWidthChange,
  onNewThread,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  activeView: string;
  threadId: string;
  open: boolean;
  handoffIncoming: boolean;
  handoffWidth: number | null;
  onClose: () => void;
  onHandoffComplete: () => void;
  onPanelWidthChange: (width: number) => void;
  onNewThread: () => void;
}) {
  const [panelWidth, setPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const resizeStart = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const { mounted, state, onAnimationEnd } = usePresence(open);
  const handoff = usePanelHandoff({
    incoming: handoffIncoming,
    targetWidth: handoffWidth,
    onComplete: onHandoffComplete,
  });
  const expanded = panelWidth > CHAT_PANEL_DEFAULT_WIDTH + 60;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const reportWidth = () => onPanelWidthChange(panel.getBoundingClientRect().width);
    reportWidth();
    const observer = new ResizeObserver(reportWidth);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [mounted, onPanelWidthChange]);

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
    document.body.style.cursor =
      "url('/cursors/macos-resize-horizontal-24.svg') 12 12, col-resize";
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
      {mounted && (
        <aside
          ref={panelRef}
          data-state={state}
          data-handoff={handoffIncoming ? 'incoming' : undefined}
          onAnimationEnd={(event) => {
            onAnimationEnd(event);
            handoff.onAnimationEnd(event);
          }}
          aria-label="AI chat"
          className="fp-panel fp-chat-panel absolute right-0 flex min-h-0 max-w-full flex-col"
          style={{
            width: `${handoff.handoffWidth ?? panelWidth}px`,
            zIndex: handoffIncoming ? 620 : 610,
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
          <ChatErrorBoundary onClose={onClose}>
            <AIChatPanel
              key={threadId}
              projectId={projectId}
              projectName={projectName}
              activeView={activeView}
              threadId={threadId}
              expanded={expanded}
              onToggleExpanded={togglePanelWidth}
              onNewThread={onNewThread}
              onClose={onClose}
            />
          </ChatErrorBoundary>
        </aside>
      )}
    </>
  );
}
