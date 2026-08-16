import { useEffect, useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Loader2, SendHorizontal, Trash2, X } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { useProject } from '../../store/project';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { AIOrb } from './AIOrb';

const MAX_MESSAGE_CHARS = 4000;

const SUGGESTED_PROMPTS = [
  'Summarize what this sheet shows',
  'What should I double-check on site today?',
  'Help me write a clear punch-list item',
];

export function AIChatPanel({
  projectId,
  projectName,
  activeView,
  onClose,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  activeView: string;
  onClose: () => void;
}) {
  const messages = useQuery(api.chat.history, { projectId });
  const send = useAction(api.chat.send);
  const clear = useMutation(api.chat.clear);
  const fileName = useProject((state) => state.fileName);
  const currentPage = useProject((state) => state.currentPage);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messageCount = messages?.length ?? 0;

  // Keep the newest exchange in view as messages stream in or the typing
  // indicator appears.
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messageCount, pending]);

  const submit = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    setDraft('');
    setError(null);
    setPending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await send({
        projectId,
        content,
        context: {
          projectName,
          sheetName: fileName ?? undefined,
          page: currentPage,
          view: activeView,
        },
      });
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setPending(false);
      textareaRef.current?.focus();
    }
  };

  const autoGrow = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 128)}px`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Full-width close button pinned to the top of the panel. */}
      <Button
        variant="ghost"
        className="fp-chat-section h-10 w-full shrink-0 rounded-none border-b border-line bg-surface font-semibold"
        onClick={onClose}
      >
        <X />
        Close chat
      </Button>

      <div className="fp-chat-section flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-t1">FieldPilot AI</div>
          <div className="truncate text-[11px] text-t3">{projectName}</div>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          title="Clear conversation"
          aria-label="Clear conversation"
          disabled={!messageCount || pending}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="fp-chat-section flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        {messages === undefined ? (
          <div className="flex flex-1 items-center justify-center text-t2">
            <Loader2 className="size-4 animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="fp-chat-msg flex flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
            <AIOrb size="lg" />
            <div>
              <p className="text-sm font-semibold text-t1">Ask FieldPilot AI</p>
              <p className="mt-1 text-xs text-t2">
                Questions about this plan, tasks, quantities, or site work.
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-left text-xs text-t2 shadow-e1 transition-[background,border-color,color,transform] duration-(--fp-dur-fast) ease-(--fp-ease) hover:border-line-strong hover:bg-surface2 hover:text-t1 active:translate-y-px"
                  onClick={() => void submit(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatBubble key={message._id} role={message.role} content={message.content} />
          ))
        )}

        {pending && (
          <div className="fp-chat-msg flex justify-start">
            <div className="flex items-center rounded-full border border-line bg-surface px-3.5 py-1.5 shadow-e1">
              <span className="fp-chat-shimmer-text text-xs font-medium">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="fp-chat-msg rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
      </div>

      <form
        className="fp-chat-section shrink-0 border-t border-line bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              autoGrow();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit(draft);
              }
            }}
            placeholder="Ask about this plan…"
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none"
            aria-label="Message FieldPilot AI"
          />
          <Button
            type="submit"
            variant="default"
            size="icon"
            title="Send message"
            aria-label="Send message"
            disabled={!draft.trim() || pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-t3">Enter to send · Shift+Enter for a new line</p>
      </form>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this conversation?"
        description="This deletes your AI chat history for this project. This cannot be undone."
        confirmLabel="Clear conversation"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          setError(null);
          void clear({ projectId });
        }}
      />
    </div>
  );
}

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('fp-chat-msg flex items-end', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap',
          isUser
            ? 'rounded-br-xs bg-accent text-on-accent'
            : 'rounded-bl-xs border border-line bg-surface text-t1',
        )}
      >
        {content}
      </div>
    </div>
  );
}
