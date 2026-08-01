import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import {
  CalendarDays,
  ChevronRight,
  Ellipsis,
  Files,
  FileText,
  FileUp,
  Pencil,
  Trash2,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { userFacingError } from '../../lib/errors';
import { openPdf } from '../../lib/pdf';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Dropdown, DropdownItem } from '../ui/dropdown-menu';
import { Notice } from '../ui/notice';
import { useNotify } from '../ui/use-notify';
import { EditPlanDialog } from './ProjectDialogs';

interface ProjectPlansPageProps {
  project: Doc<'projects'>;
  role: Doc<'projectMembers'>['role'];
  onBackToProjects: () => void;
  onOpenPlan: (sheetId: Id<'sheets'>) => void;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

function CreationDate({ timestamp }: { timestamp: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <CalendarDays className="size-4 text-t3" aria-hidden />
      <span>{formatDate(timestamp)}</span>
    </div>
  );
}

export function ProjectPlansPage({
  project,
  role,
  onBackToProjects,
  onOpenPlan,
}: ProjectPlansPageProps) {
  const { notify } = useNotify();
  const plans = useQuery(api.sheets.listByProjectWithMetadata, { projectId: project._id });
  const generateUploadUrl = useMutation(api.sheets.generateUploadUrl);
  const completePdfUpload = useMutation(api.sheets.completePdfUpload);
  const updatePdf = useMutation(api.sheets.updatePdf);
  const removePdf = useMutation(api.sheets.removePdf);
  const planInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Doc<'sheets'> | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Doc<'sheets'> | null>(null);
  const canManage = role === 'owner' || role === 'admin';
  const pdfGroups = useMemo(() => {
    if (plans === undefined) return undefined;

    const groups = new Map<
      string,
      { primary: Doc<'sheets'>; pages: Doc<'sheets'>[]; createdByName: string }
    >();
    for (const { plan, createdByName } of plans) {
      const existing = groups.get(plan.sourceFileRef);
      if (existing) {
        existing.pages.push(plan);
        if (plan.pageIndex < existing.primary.pageIndex) existing.primary = plan;
      } else {
        groups.set(plan.sourceFileRef, { primary: plan, pages: [plan], createdByName });
      }
    }
    return [...groups.values()].map((group) => ({
      ...group,
      pages: group.pages.sort((a, b) => a.pageIndex - b.pageIndex),
    }));
  }, [plans]);

  async function uploadPlans(files: FileList | null) {
    if (!files?.length || uploading) return;
    const fileCount = files.length;
    setUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          throw new Error('Choose a PDF plan to upload.');
        }

        const opened = await openPdf(await file.arrayBuffer());
        const pageLabels = await opened.doc.getPageLabels();
        const baseName = file.name.replace(/\.pdf$/iu, '').trim() || 'Uploaded plan';
        const pages = [];

        for (let pageIndex = 0; pageIndex < opened.pageCount; pageIndex += 1) {
          const pdfPage = await opened.doc.getPage(pageIndex + 1);
          const viewport = pdfPage.getViewport({ scale: 1 });
          pages.push({
            name: baseName,
            number: pageLabels?.[pageIndex]?.trim() || String(pageIndex + 1),
            pageIndex,
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          });
          pdfPage.cleanup();
        }

        const { uploadUrl, uploadClaimId } = await generateUploadUrl({ projectId: project._id });
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        });
        if (!response.ok) throw new Error('The plan could not be uploaded. Please try again.');
        const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
        await completePdfUpload({
          projectId: project._id,
          uploadClaimId,
          storageId,
          fileName: file.name,
          pages,
        });
      }
      notify({
        tone: 'success',
        message: `${fileCount} PDF ${fileCount === 1 ? 'was' : 'were'} uploaded.`,
      });
    } catch (error) {
      setUploadError(userFacingError(error));
    } finally {
      setUploading(false);
      setDragOver(false);
      if (planInputRef.current) planInputRef.current.value = '';
    }
  }

  function dropPlans(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    void uploadPlans(event.dataTransfer.files);
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-9 sm:px-8 lg:px-10">
      <nav
        className="flex min-w-0 items-center gap-2 border-b border-line pb-5"
        aria-label="Project breadcrumb"
      >
        <button
          type="button"
          className="cursor-pointer font-display text-2xl font-semibold tracking-tight text-t2 transition-colors duration-(--fp-dur-fast) hover:text-accent"
          onClick={onBackToProjects}
        >
          Projects
        </button>
        <ChevronRight className="size-5 shrink-0 text-t3" aria-hidden="true" />
        <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight text-t1">
          {project.name}
        </h1>
      </nav>

      {uploadError && (
        <Notice tone="error" className="mt-5">
          Upload failed: {uploadError}
        </Notice>
      )}

      {pdfGroups === undefined ? (
        <div className="grid gap-4 pt-7 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-lg border border-line bg-surface"
            />
          ))}
        </div>
      ) : pdfGroups.length === 0 ? (
        canManage ? (
          <button
            type="button"
            className={cn(
              'mt-8 flex min-h-72 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-6 text-center transition-[border-color,background-color] duration-(--fp-dur-fast)',
              dragOver
                ? 'border-accent bg-accent-soft'
                : 'border-line-strong hover:border-accent hover:bg-surface2',
            )}
            aria-label="Upload PDF plans"
            disabled={uploading}
            onClick={() => planInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={dropPlans}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              {uploading ? (
                <FileUp className="size-6 animate-pulse" />
              ) : (
                <FileText className="size-6" />
              )}
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-t1">
              {uploading ? 'Uploading plans…' : 'No plans in this project yet'}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-t2">
              {uploading
                ? 'Your PDF is being added to this project.'
                : 'Drag PDF plans here or click to upload.'}
            </p>
          </button>
        ) : (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <FileText className="size-6" />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-t1">
              No plans in this project yet
            </h2>
          </div>
        )
      ) : (
        <div className="grid gap-4 pt-7 sm:grid-cols-2 lg:grid-cols-3">
          {pdfGroups.map(({ primary, pages }) => (
            <article
              key={primary.sourceFileRef}
              className="group relative flex min-h-40 flex-col rounded-lg border border-line bg-surface p-5 shadow-e1 transition-[border-color,box-shadow,transform] duration-(--fp-dur-fast) hover:-translate-y-0.5 hover:border-line-strong hover:shadow-e2"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-pointer rounded-lg"
                aria-label={`Open ${primary.name}`}
                onClick={() => onOpenPlan(primary._id)}
              />
              <div className="pointer-events-none relative z-20 flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <FileText className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-base font-semibold text-t1">
                    {primary.name}
                  </h2>
                </div>
                {canManage && (
                  <div className="pointer-events-auto relative z-30">
                    <Dropdown
                      className="min-w-40"
                      trigger={
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Plan actions for ${primary.name}`}
                        >
                          <Ellipsis />
                        </Button>
                      }
                    >
                      {(close) => (
                        <>
                          <DropdownItem
                            className="rounded-md"
                            onClick={() => {
                              close();
                              setEditTarget(primary);
                            }}
                          >
                            <Pencil />
                            Edit plan
                          </DropdownItem>
                          <div className="my-1 border-t border-line" />
                          <DropdownItem
                            className="rounded-md text-danger hover:bg-danger-soft hover:text-danger"
                            onClick={() => {
                              close();
                              setRemoveTarget(primary);
                            }}
                          >
                            <Trash2 />
                            Remove plan
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  </div>
                )}
              </div>

              <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-3 pt-7 text-xs text-t2">
                <div className="min-w-0">
                  <p className="truncate">{primary.discipline || 'PDF plan'}</p>
                  <p className="mt-1 text-t3">Version {primary.version}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <CreationDate timestamp={primary.createdAt} />
                  <div
                    className="flex items-center gap-1.5"
                    aria-label={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
                  >
                    <Files className="size-4 text-t3" />
                    <span>{pages.length}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {canManage && (
            <button
              type="button"
              className={cn(
                'flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface px-5 py-5 text-sm font-medium text-t2 transition-[border-color,background-color,color] duration-(--fp-dur-fast)',
                dragOver
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line-strong hover:border-accent hover:bg-surface2 hover:text-t1',
              )}
              disabled={uploading}
              onClick={() => planInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={dropPlans}
            >
              <FileUp className={cn('size-4', uploading && 'animate-pulse')} />
              {uploading ? 'Uploading plans…' : 'Drag more PDF plans here'}
              {!uploading && (
                <span className="text-xs font-normal text-t3">or click to upload</span>
              )}
            </button>
          )}
        </div>
      )}

      <EditPlanDialog
        plan={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={async (
          sheetId: Id<'sheets'>,
          values: { name: string; discipline: string | null; version: number },
        ) => {
          await updatePdf({ sheetId, ...values });
          notify({
            tone: 'success',
            message: 'Plan details saved.',
          });
        }}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? 'plan'}?`}
        description="This removes the entire PDF, all of its pages, and related tasks from the project."
        confirmLabel="Remove plan"
        danger
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          const planName = removeTarget.name;
          void removePdf({ sheetId: removeTarget._id })
            .then(() => {
              setRemoveTarget(null);
              notify({
                tone: 'success',
                message: `${planName} was removed from the project.`,
              });
            })
            .catch((error: unknown) => {
              notify({
                tone: 'error',
                message: `Couldn’t remove ${planName}: ${userFacingError(error)}`,
              });
            });
        }}
      />
      <input
        ref={planInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(event) => void uploadPlans(event.target.files)}
      />
    </main>
  );
}
