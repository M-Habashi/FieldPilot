import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Mail, Trash2 } from 'lucide-react';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { useModalFocus } from '../../hooks/useModalFocus';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Notice } from '../ui/notice';

interface DialogFrameProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}

function DialogFrame({ open, title, description, onClose, children }: DialogFrameProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, dialogRef, onClose);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/45 p-4"
      style={{ animation: 'fp-fade-in var(--fp-dur-fast) var(--fp-ease) both' }}
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-e3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-lg font-semibold text-t1">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm leading-6 text-t2">{description}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateProjectDialog({ open, onClose, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name);
      onClose();
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t create the project. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      open={open}
      title="Add project"
      description="Create a shared place for this project's plans and members."
      onClose={onClose}
    >
      <form className="mt-5" onSubmit={(event) => void submit(event)}>
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
        />
        {error && (
          <Notice tone="error" compact className="mt-3">
            {error}
          </Notice>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Adding…' : 'Add project'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

interface InviteDialogProps {
  project: Doc<'projects'> | null;
  onClose: () => void;
  onInvite: (projectId: Id<'projects'>, email: string) => Promise<void>;
}

export function InviteDialog({ project, onClose, onInvite }: InviteDialogProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (project) {
      setEmail('');
      setError(null);
    }
  }, [project]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onInvite(project._id, email);
      onClose();
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t send the invitation. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      open={project !== null}
      title="Invite to project"
      description={`Invite someone to ${project?.name ?? 'this project'} by email. They can accept from their FieldPilot notifications.`}
      onClose={onClose}
    >
      <form className="mt-5" onSubmit={(event) => void submit(event)}>
        <Label htmlFor="invite-email">Email address</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-t3" />
          <Input
            id="invite-email"
            type="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            className="pl-9"
          />
        </div>
        {error && (
          <Notice tone="error" compact className="mt-3">
            {error}
          </Notice>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

interface DeleteProjectDialogProps {
  project: Doc<'projects'> | null;
  onClose: () => void;
  onDelete: (projectId: Id<'projects'>, confirmationName: string) => Promise<void>;
}

export function DeleteProjectDialog({ project, onClose, onDelete }: DeleteProjectDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (project) {
      setConfirmation('');
      setError(null);
    }
  }, [project]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || confirmation !== project.name) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(project._id, confirmation);
      onClose();
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t delete the project. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const matches = project !== null && confirmation === project.name;
  return (
    <DialogFrame open={project !== null} title="Delete project" onClose={onClose}>
      <div className="mt-4 flex gap-3 rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm leading-5">
          This permanently deletes the project, its plans, and all project data. This action cannot
          be undone.
        </p>
      </div>
      <form className="mt-5" onSubmit={(event) => void submit(event)}>
        <Label htmlFor="delete-project-name" className="normal-case tracking-normal text-t2">
          Type <span className="font-bold text-t1">{project?.name}</span> exactly as shown to
          confirm. The name is case-sensitive.
        </Label>
        <Input
          id="delete-project-name"
          autoFocus
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {error && (
          <Notice tone="error" compact className="mt-3">
            {error}
          </Notice>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            className="bg-danger text-white hover:bg-danger/90"
            disabled={busy || !matches}
          >
            <Trash2 />
            {busy ? 'Deleting…' : 'Delete project'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

interface EditPlanDialogProps {
  plan: Doc<'sheets'> | null;
  onClose: () => void;
  onSave: (
    sheetId: Id<'sheets'>,
    values: { name: string; discipline: string | null; version: number },
  ) => Promise<void>;
}

export function EditPlanDialog({ plan, onClose, onSave }: EditPlanDialogProps) {
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [version, setVersion] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setName(plan.name);
    setDiscipline(plan.discipline ?? '');
    setVersion(String(plan.version));
    setError(null);
  }, [plan]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(plan._id, {
        name,
        discipline: discipline.trim() || null,
        version: Number(version),
      });
      onClose();
    } catch (caught) {
      setError(userFacingError(caught, 'We couldn’t update the plan. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame open={plan !== null} title="Edit plan metadata" onClose={onClose}>
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <Label htmlFor="plan-name">Plan name</Label>
          <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="plan-version">Version</Label>
          <Input
            id="plan-version"
            type="number"
            min={1}
            step={1}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="plan-discipline">Discipline</Label>
          <Input
            id="plan-discipline"
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value)}
          />
        </div>
        {error && (
          <Notice tone="error" compact>
            {error}
          </Notice>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="default"
            type="submit"
            disabled={busy || !name.trim() || Number(version) < 1}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
