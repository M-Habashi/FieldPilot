import { useRef } from 'react';
import { Download, FileUp, FolderOpen, ListTodo, MapPin, Pin } from 'lucide-react';
import { useProject } from '../store/project';
import { exportProject } from '../lib/transfer';
import { Button } from './ui/button';
import { DesignSwitcher } from './DesignSwitcher';

interface ToolbarProps {
  hasDoc: boolean;
  onOpenPdf: (file: File) => void;
  onImportJson: (file: File) => void;
}

export function Toolbar({ hasDoc, onOpenPdf, onImportJson }: ToolbarProps) {
  const fileName = useProject((s) => s.fileName);
  const addPinMode = useProject((s) => s.addPinMode);
  const setAddPinMode = useProject((s) => s.setAddPinMode);
  const taskListOpen = useProject((s) => s.taskListOpen);
  const toggleTaskList = useProject((s) => s.toggleTaskList);
  const taskCount = useProject((s) => Object.keys(s.tasks).length);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Header bar: brand (left) + open file name (truly centered). Nothing else. */}
      <header className="fp-toolbar relative z-40 flex shrink-0 items-center gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent text-on-accent">
            <MapPin className="size-4" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-t1">FieldPilot</span>
        </div>

        {fileName && (
          <span
            className="absolute left-1/2 hidden max-w-[50%] -translate-x-1/2 truncate text-xs text-t2 md:block"
            title={fileName}
          >
            {fileName}
          </span>
        )}
      </header>

      {/* Action bar: visible file/tool actions + design switcher. */}
      <div className="fp-actionbar z-40 flex shrink-0 items-center gap-1.5 px-3">
        <Button variant="secondary" size="sm" onClick={() => pdfInputRef.current?.click()}>
          <FolderOpen />
          <span className="hidden sm:inline">Open PDF</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasDoc}
          onClick={() => jsonInputRef.current?.click()}
          title="Import tasks (JSON)"
        >
          <FileUp />
          <span className="hidden sm:inline">Import</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasDoc}
          title="Export tasks (JSON)"
          onClick={() => {
            const s = useProject.getState();
            void exportProject({
              fileName: s.fileName,
              fingerprint: s.fingerprint,
              nextSeq: s.nextSeq,
              tasks: s.tasks,
            });
          }}
        >
          <Download />
          <span className="hidden sm:inline">Export</span>
        </Button>

        <div className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />

        <Button
          variant="toggle"
          size="sm"
          data-on={addPinMode}
          aria-pressed={addPinMode}
          disabled={!hasDoc}
          onClick={() => setAddPinMode(!addPinMode)}
          title="Add pin (P)"
        >
          <Pin />
          <span className="hidden sm:inline">Add pin</span>
        </Button>
        <Button
          variant="toggle"
          size="sm"
          data-on={taskListOpen}
          aria-pressed={taskListOpen}
          disabled={!hasDoc}
          onClick={toggleTaskList}
          title="Task list"
        >
          <ListTodo />
          <span className="hidden sm:inline">Tasks</span>
          {taskCount > 0 && (
            <span className="rounded-full bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-t2 data-[on=true]:bg-white/20">
              {taskCount}
            </span>
          )}
        </Button>

        <div className="ml-auto">
          <DesignSwitcher />
        </div>
      </div>

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onOpenPdf(f);
          e.target.value = '';
        }}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportJson(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
