import { useEffect, useRef, useState } from 'react';
import { useUIMessages } from '@convex-dev/agent/react';
import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  CircleAlert,
  MapPin,
  Paperclip,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  SquarePen,
  X,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { useProject } from '../../store/project';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { AIOrb } from './AIOrb';

const MAX_MESSAGE_CHARS = 4000;

const SUGGESTED_PROMPTS = [
  'Summarize open work on this project',
  'What overdue high-priority tasks need attention?',
  'Which quantities are at risk of overrunning?',
];

type MessagePart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
  title?: string;
  errorText?: string;
  input?: unknown;
  output?: unknown;
  approval?: { id: string; approved?: boolean };
};

type OperationOutput = {
  operationId: string;
  summary: string;
  undoAvailable?: boolean;
  clientDirective?: {
    kind: 'place_task_pin';
    operationId: string;
    page: number;
    sheetNumber: string;
    task: {
      title: string;
      description: string;
      status: 'open' | 'in-progress' | 'done' | 'verified';
      priority: 1 | 2 | 3;
      category: string;
      assigneeText?: string;
      assigneeUserId?: string;
      dueDate?: string;
      locationText?: string;
      tags?: string[];
    };
  };
};

function localIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AIChatPanel({
  projectId,
  projectName,
  activeView,
  threadId,
  onNewThread,
  onClose,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  activeView: string;
  threadId: string;
  onNewThread: () => void;
  onClose: () => void;
}) {
  const threadState = useQuery(api.chat.threadState, { projectId, threadId });
  const messageQuery = useUIMessages(
    api.chat.listThreadMessages,
    threadState?.exists ? { projectId, threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  );
  const send = useMutation(api.chat.sendMessage);
  const respondToApproval = useMutation(api.chat.respondToApproval);
  const undoOperation = useMutation(api.agentOperations.undo);
  const cancelPlacement = useMutation(api.agentOperations.cancelPlacement);
  const fileName = useProject((state) => state.fileName);
  const currentPage = useProject((state) => state.currentPage);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [undoneOperations, setUndoneOperations] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = threadState?.exists ? messageQuery.results : [];
  const pending =
    submitting || threadState?.runStatus === 'queued' || threadState?.runStatus === 'running';
  const loading =
    threadState === undefined || (threadState.exists && messageQuery.status === 'LoadingFirstPage');
  const error = submitError ?? threadState?.lastError ?? null;
  const messageCount = messages.length;
  const startAgentTaskPlacement = useProject((state) => state.startAgentTaskPlacement);

  const currentContext = () => ({
    projectName,
    sheetName: fileName ?? undefined,
    page: currentPage,
    view: activeView,
    localDate: localIsoDate(),
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messageCount, pending]);

  const submit = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await send({
        projectId,
        threadId,
        content,
        context: currentContext(),
      });
      setDraft('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (cause) {
      setSubmitError(userFacingError(cause));
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  const respond = async (approvalId: string, approved: boolean) => {
    setSubmitError(null);
    setActionPending(approvalId);
    try {
      await respondToApproval({
        projectId,
        threadId,
        approvalId,
        approved,
        context: currentContext(),
      });
    } catch (cause) {
      setSubmitError(userFacingError(cause));
    } finally {
      setActionPending(null);
    }
  };

  const undo = async (operationId: string) => {
    setSubmitError(null);
    setActionPending(operationId);
    try {
      await undoOperation({ operationId: operationId as Id<'agentOperations'> });
      setUndoneOperations((current) => new Set(current).add(operationId));
    } catch (cause) {
      setSubmitError(userFacingError(cause));
    } finally {
      setActionPending(null);
    }
  };

  const placeTask = (output: OperationOutput) => {
    const directive = output.clientDirective;
    if (!directive) return;
    startAgentTaskPlacement({
      operationId: directive.operationId,
      page: directive.page,
      task: directive.task,
    });
    onClose();
  };

  const cancelTaskPlacement = async (operationId: string) => {
    setSubmitError(null);
    setActionPending(operationId);
    try {
      await cancelPlacement({ operationId: operationId as Id<'agentOperations'> });
    } catch (cause) {
      setSubmitError(userFacingError(cause));
    } finally {
      setActionPending(null);
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
      <Button
        variant="ghost"
        className="fp-chat-section h-10 w-full shrink-0 rounded-none font-semibold"
        onClick={onClose}
      >
        <X data-icon="inline-start" />
        Close chat
      </Button>

      <div className="fp-chat-section flex shrink-0 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-t1">FieldPilot AI</div>
          <div className="truncate text-[11px] text-t3">
            {projectName} · Approval required for changes
          </div>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          title="New conversation"
          aria-label="New conversation"
          disabled={!messageCount || pending}
          onClick={onNewThread}
        >
          <SquarePen />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="fp-chat-section flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        {loading ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 text-t2"
            role="status"
            aria-live="polite"
          >
            <AIOrb size="lg" state="searching" />
            <span className="text-xs font-medium">Loading conversation…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="fp-chat-msg flex flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
            <img
              src="/images/chat/fieldpilot-engineer-robot.svg"
              alt="FieldPilot AI engineer robot"
              width={64}
              height={64}
              className="fp-ai-robot-logo size-16 shrink-0 object-contain"
              draggable={false}
            />
            <div>
              <p className="text-sm font-semibold text-t1">Ask FieldPilot AI</p>
              <p className="mt-1 text-xs text-t2">
                It can now inspect this project&apos;s tasks, plans, quantities, notes, and
                activity.
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                  onClick={() => void submit(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <AgentMessage
              key={message.key}
              role={message.role}
              parts={message.parts as MessagePart[]}
              actionPending={actionPending}
              undoneOperations={undoneOperations}
              onApproval={respond}
              onUndo={undo}
              onPlaceTask={placeTask}
              onCancelPlacement={cancelTaskPlacement}
            />
          ))
        )}

        {pending && (
          <div
            className="fp-chat-msg flex items-center gap-2 text-t2"
            role="status"
            aria-live="polite"
          >
            <AIOrb size="sm" state="searching" />
            <span className="text-xs font-medium">
              {threadState?.runStatus === 'running' ? 'Checking project data…' : 'Starting…'}
            </span>
          </div>
        )}

        {error && (
          <div className="fp-chat-msg rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
      </div>

      <form
        className="fp-chat-section shrink-0 px-3 pt-3 pb-12"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <div className="rounded-lg border border-line-strong px-3 py-2.5 shadow-e1 transition-[border-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease) focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
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
            placeholder="Ask about this project…"
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            className="max-h-32 min-h-9 resize-none border-0 bg-transparent px-0 py-0 leading-5 shadow-none hover:border-transparent focus:border-transparent focus-visible:shadow-none focus:ring-0"
            aria-label="Message FieldPilot AI"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="iconXs"
                title="Attachments are coming soon"
                aria-label="Attachments are coming soon"
                disabled
                className="text-t3"
              >
                <Paperclip />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="iconXs"
                title="Prompt settings are coming soon"
                aria-label="Prompt settings are coming soon"
                disabled
                className="text-t3"
              >
                <SlidersHorizontal />
              </Button>
            </div>
            <Button
              type="submit"
              variant="default"
              size="iconSm"
              title="Send message"
              aria-label="Send message"
              disabled={!draft.trim() || pending}
              className="rounded-full"
            >
              {pending ? <AIOrb size="sm" state="searching" /> : <SendHorizontal />}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AgentMessage({
  role,
  parts,
  actionPending,
  undoneOperations,
  onApproval,
  onUndo,
  onPlaceTask,
  onCancelPlacement,
}: {
  role: 'system' | 'user' | 'assistant';
  parts: MessagePart[];
  actionPending: string | null;
  undoneOperations: Set<string>;
  onApproval: (approvalId: string, approved: boolean) => Promise<void>;
  onUndo: (operationId: string) => Promise<void>;
  onPlaceTask: (output: OperationOutput) => void;
  onCancelPlacement: (operationId: string) => Promise<void>;
}) {
  const isUser = role === 'user';
  const text = parts
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('');
  const toolParts = parts.filter(
    (part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
  );
  if (!text && toolParts.length === 0) return null;

  return (
    <div className={cn('fp-chat-msg flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      {text && (
        <div
          className={cn(
            'max-w-[85%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap',
            isUser
              ? 'rounded-br-xs bg-accent text-on-accent'
              : 'rounded-bl-xs border border-line bg-surface text-t1',
          )}
        >
          {text}
        </div>
      )}
      {toolParts.map((part, index) => (
        <ToolActivity
          key={`${part.type}-${index}`}
          part={part}
          actionPending={actionPending}
          undoneOperations={undoneOperations}
          onApproval={onApproval}
          onUndo={onUndo}
          onPlaceTask={onPlaceTask}
          onCancelPlacement={onCancelPlacement}
        />
      ))}
    </div>
  );
}

function ToolActivity({
  part,
  actionPending,
  undoneOperations,
  onApproval,
  onUndo,
  onPlaceTask,
  onCancelPlacement,
}: {
  part: MessagePart;
  actionPending: string | null;
  undoneOperations: Set<string>;
  onApproval: (approvalId: string, approved: boolean) => Promise<void>;
  onUndo: (operationId: string) => Promise<void>;
  onPlaceTask: (output: OperationOutput) => void;
  onCancelPlacement: (operationId: string) => Promise<void>;
}) {
  const rawName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
  const name = rawName ? rawName.replaceAll('_', ' ') : 'project data';
  const approvalId = part.state === 'approval-requested' ? part.approval?.id : undefined;
  const operation = asOperationOutput(part.output);
  if (approvalId) {
    return (
      <div className="max-w-[95%] rounded-lg border border-accent/35 bg-accent-soft p-3 text-xs text-t1">
        <div className="font-semibold">Approval required</div>
        <div className="mt-1 text-t2">{describeToolAction(rawName, part.input)}</div>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={actionPending !== null}
            onClick={() => void onApproval(approvalId, true)}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={actionPending !== null}
            onClick={() => void onApproval(approvalId, false)}
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }
  if (operation) {
    const undone = undoneOperations.has(operation.operationId);
    return (
      <div className="max-w-[95%] rounded-lg border border-line bg-surface p-3 text-xs text-t1">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
          <span>{undone ? `Undid: ${operation.summary}` : operation.summary}</span>
        </div>
        {!undone && operation.clientDirective?.kind === 'place_task_pin' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={actionPending !== null}
              onClick={() => onPlaceTask(operation)}
            >
              <MapPin data-icon="inline-start" />
              Place pin on {operation.clientDirective.sheetNumber}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionPending !== null}
              onClick={() => void onCancelPlacement(operation.operationId)}
            >
              Cancel
            </Button>
          </div>
        )}
        {!undone && operation.undoAvailable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={actionPending !== null}
            onClick={() => void onUndo(operation.operationId)}
          >
            Undo
          </Button>
        )}
      </div>
    );
  }
  const failed = part.state === 'output-error' || part.state === 'output-denied';
  const complete = part.state === 'output-available';
  const Icon = failed ? CircleAlert : complete ? Check : Search;
  const verb = failed ? 'Could not check' : complete ? 'Checked' : 'Checking';
  return (
    <div
      className={cn(
        'flex max-w-[90%] items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        failed ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface-2 text-t2',
      )}
      title={failed ? part.errorText : undefined}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="capitalize">{`${verb} ${name}`}</span>
    </div>
  );
}

function asOperationOutput(value: unknown): OperationOutput | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OperationOutput>;
  return typeof candidate.operationId === 'string' && typeof candidate.summary === 'string'
    ? (candidate as OperationOutput)
    : null;
}

function describeToolAction(toolName: string | undefined, value: unknown) {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const taskNumber = typeof input.taskNumber === 'number' ? `Task #${input.taskNumber}` : 'task';
  if (toolName === 'add_task_note') return `Add a note to ${taskNumber}.`;
  if (toolName === 'create_task') {
    const title = typeof input.title === 'string' ? `“${input.title}”` : 'a new task';
    const sheet = typeof input.sheetNumber === 'string' ? ` on ${input.sheetNumber}` : '';
    return `Prepare ${title}${sheet}, then ask you to place its pin.`;
  }
  if (toolName === 'update_task') {
    const fields = ['status', 'priority', 'dueDate', 'assigneeName'].filter(
      (field) => input[field] !== undefined,
    );
    return `Update ${taskNumber}${fields.length ? ` (${fields.join(', ')})` : ''}.`;
  }
  return `Run ${toolName?.replaceAll('_', ' ') ?? 'this action'}.`;
}
