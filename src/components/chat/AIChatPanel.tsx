import { useEffect, useRef, useState } from 'react';
import { useUIMessages } from '@convex-dev/agent/react';
import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  CircleAlert,
  MapPin,
  Maximize2,
  Minimize2,
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
import { MarkdownMessage } from './MarkdownMessage';

const MAX_MESSAGE_CHARS = 4000;

const SUGGESTED_PROMPTS = [
  'Summarize the tasks in a table',
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
  jobId?: string;
  status?: 'awaiting-placement' | 'executed' | 'undone';
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
      color?: string;
      assigneeText?: string;
      assigneeUserId?: string;
      startDate?: string;
      dueDate?: string;
      locationText?: string;
      tags?: string[];
      manpowerCount?: number;
      costMinor?: number;
      currencyCode?: string;
      plannedQuantity?: number;
      completedQuantity?: number;
      quantityUnit?: string;
      quantityItemId?: string;
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
  expanded,
  onToggleExpanded,
  onNewThread,
  onClose,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  activeView: string;
  threadId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
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
  const undoAgentJob = useMutation(api.agentOperations.undoJob);
  const cancelPlacement = useMutation(api.agentOperations.cancelPlacement);
  const fileName = useProject((state) => state.fileName);
  const currentPage = useProject((state) => state.currentPage);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [undoneJobs, setUndoneJobs] = useState<Set<string>>(() => new Set());
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

  const undo = async (jobId: string) => {
    setSubmitError(null);
    setActionPending(jobId);
    try {
      await undoAgentJob({ projectId, jobId });
      setUndoneJobs((current) => new Set(current).add(jobId));
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
        className="fp-chat-chrome fp-chat-section h-10 w-full shrink-0 rounded-none font-semibold"
        onClick={onClose}
      >
        <X data-icon="inline-start" />
        Close chat
      </Button>

      <div className="fp-chat-chrome fp-chat-section fp-chat-topbar flex shrink-0 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-t1">FieldPilot AI</div>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          className="hidden sm:inline-flex"
          title={expanded ? 'Restore chat width' : 'Expand chat panel'}
          aria-label={expanded ? 'Restore chat width' : 'Expand chat panel'}
          onClick={onToggleExpanded}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </Button>
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
        className="fp-chat-section fp-chat-stream flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-8"
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
                It can inspect and, with your approval, update tasks, plans, quantities, notes, and
                project details.
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
              undoneJobs={undoneJobs}
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
              {threadState?.runStatus === 'running' ? 'Thinking…' : 'Starting…'}
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
        className="fp-chat-bottombar fp-chat-chrome fp-chat-section shrink-0 px-3 pt-3 pb-12"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <div className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 shadow-e1 transition-[border-color,box-shadow] duration-(--fp-dur-fast) ease-(--fp-ease) focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
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
  undoneJobs,
  onApproval,
  onUndo,
  onPlaceTask,
  onCancelPlacement,
}: {
  role: 'system' | 'user' | 'assistant';
  parts: MessagePart[];
  actionPending: string | null;
  undoneJobs: Set<string>;
  onApproval: (approvalId: string, approved: boolean) => Promise<void>;
  onUndo: (jobId: string) => Promise<void>;
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
            'min-w-0 rounded-lg px-3 py-2 text-sm break-words',
            isUser
              ? 'max-w-[85%] rounded-br-xs bg-accent text-on-accent whitespace-pre-wrap'
              : 'w-full rounded-bl-xs border border-line bg-surface px-3.5 py-3 text-t1',
          )}
        >
          {isUser ? text : <MarkdownMessage content={text} />}
        </div>
      )}
      {toolParts.map((part, index) => (
        <ToolActivity
          key={`${part.type}-${index}`}
          part={part}
          actionPending={actionPending}
          undoneJobs={undoneJobs}
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
  undoneJobs,
  onApproval,
  onUndo,
  onPlaceTask,
  onCancelPlacement,
}: {
  part: MessagePart;
  actionPending: string | null;
  undoneJobs: Set<string>;
  onApproval: (approvalId: string, approved: boolean) => Promise<void>;
  onUndo: (jobId: string) => Promise<void>;
  onPlaceTask: (output: OperationOutput) => void;
  onCancelPlacement: (operationId: string) => Promise<void>;
}) {
  const rawName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
  const name = rawName ? rawName.replaceAll('_', ' ') : 'project data';
  const approvalId = part.state === 'approval-requested' ? part.approval?.id : undefined;
  const operation = asOperationOutput(part.output);
  const liveOperation = useQuery(
    api.agentOperations.getReceipt,
    operation ? { operationId: operation.operationId as Id<'agentOperations'> } : 'skip',
  );
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
    const currentOperation = { ...operation, ...(liveOperation ?? {}) };
    const jobId = currentOperation.jobId ?? currentOperation.operationId;
    const undone = currentOperation.status === 'undone' || undoneJobs.has(jobId);
    const awaitingPlacement = currentOperation.status === 'awaiting-placement';
    return (
      <div className="max-w-[95%] rounded-lg border border-line bg-surface p-3 text-xs text-t1">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
          <span>
            {undone &&
            !currentOperation.summary.startsWith('Undid:') &&
            !currentOperation.summary.startsWith('Canceled:')
              ? `Undid: ${currentOperation.summary}`
              : currentOperation.summary}
          </span>
        </div>
        {!undone &&
          awaitingPlacement &&
          currentOperation.clientDirective?.kind === 'place_task_pin' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={actionPending !== null}
                onClick={() => onPlaceTask(currentOperation)}
              >
                <MapPin data-icon="inline-start" />
                Place pin on {currentOperation.clientDirective.sheetNumber}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionPending !== null}
                onClick={() => void onCancelPlacement(currentOperation.operationId)}
              >
                Cancel
              </Button>
            </div>
          )}
        {!undone && currentOperation.status === 'executed' && currentOperation.undoAvailable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={actionPending !== null}
            onClick={() => void onUndo(jobId)}
          >
            Undo AI job
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
  if (toolName === 'prepare_new_task') {
    const title = typeof input.title === 'string' ? `“${input.title}”` : 'a new task';
    const sheet = typeof input.sheetNumber === 'string' ? ` on ${input.sheetNumber}` : '';
    return `Prepare ${title}${sheet}, then ask you to place its pin.`;
  }
  if (toolName === 'change_project_data') {
    const changes = Array.isArray(input.changes) ? input.changes : [];
    const labels = changes.slice(0, 4).map(describeProjectChange);
    const remainder =
      changes.length > labels.length ? `, +${changes.length - labels.length} more` : '';
    return `Apply ${changes.length || 'the requested'} project ${changes.length === 1 ? 'change' : 'changes'}${labels.length ? `: ${labels.join('; ')}${remainder}` : ''}. This request will be one Undo step.`;
  }
  if (toolName === 'change_image_data') {
    const changes = Array.isArray(input.changes) ? input.changes : [];
    const labels = changes.slice(0, 4).map((value) => {
      if (!value || typeof value !== 'object') return 'photo change';
      const change = value as Record<string, unknown>;
      const fields = Object.keys(change).filter(
        (key) => !['photoId', 'photoUpdatedAt'].includes(key),
      );
      return `${typeof change.photoId === 'string' ? change.photoId : 'photo'}: ${fields.join(', ') || 'metadata'}`;
    });
    const remainder =
      changes.length > labels.length ? `, +${changes.length - labels.length} more` : '';
    return `Apply ${changes.length || 'the requested'} photo ${changes.length === 1 ? 'change' : 'changes'}${labels.length ? `: ${labels.join('; ')}${remainder}` : ''}. Original GPS and timestamps will not be changed. This request will be one Undo step.`;
  }
  if (toolName === 'delete_images_permanently') {
    const photos = Array.isArray(input.photos) ? input.photos : [];
    const names = photos
      .slice(0, 4)
      .flatMap((value) =>
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).confirmFileName === 'string'
          ? [(value as Record<string, unknown>).confirmFileName as string]
          : [],
      );
    return `Permanently delete ${photos.length || 'the selected'} trashed ${photos.length === 1 ? 'photo' : 'photos'}${names.length ? `: ${names.join(', ')}` : ''}. Stored image bytes and metadata will be removed, and this cannot be undone.`;
  }
  return `Run ${toolName?.replaceAll('_', ' ') ?? 'this action'}.`;
}

function describeProjectChange(value: unknown) {
  if (!value || typeof value !== 'object') return 'change';
  const change = value as Record<string, unknown>;
  const kind = typeof change.kind === 'string' ? change.kind : 'change';
  const task = typeof change.taskNumber === 'number' ? `Task #${change.taskNumber}` : 'task';
  if (kind === 'update_task') {
    const fields = Object.keys(change).filter((key) => !['kind', 'taskNumber'].includes(key));
    return `${task}: ${fields.join(', ') || 'fields'}`;
  }
  if (kind === 'set_task_quantity') return `${task}: quantity`;
  if (kind === 'add_task_note') return `${task}: add note`;
  if (kind === 'update_project') return 'project metadata';
  if (kind === 'update_sheet') {
    return `sheet ${typeof change.sheetNumber === 'string' ? change.sheetNumber : ''}`.trim();
  }
  if (kind === 'create_quantity_item') {
    return `create quantity item ${typeof change.name === 'string' ? change.name : ''}`.trim();
  }
  if (kind === 'update_quantity_item') {
    return `quantity item ${typeof change.itemName === 'string' ? change.itemName : ''}`.trim();
  }
  return kind.replaceAll('_', ' ');
}
