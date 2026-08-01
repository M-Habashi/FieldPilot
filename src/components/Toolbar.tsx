import { useRef } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ChevronDown, Download, FileUp, FolderOpen, ListTodo, LogOut, Pin } from 'lucide-react';
import { Brand } from './Brand';
import { useProject } from '../store/project';
import { exportProject } from '../lib/transfer';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Dropdown, DropdownItem } from './ui/dropdown-menu';

interface ToolbarProps {
  hasDoc: boolean;
  onOpenPdf: (file: File) => void;
  onImportJson: (file: File) => void;
  allowLocalFiles?: boolean;
}

export function AppHeader({ onLogoClick }: { onLogoClick?: () => void } = {}) {
  const fileName = useProject((s) => s.fileName);
  const { signOut } = useAuthActions();

  const handleSignOut = () => {
    window.location.hash = '/';
    void signOut();
  };

  return (
    <header className="fp-toolbar relative z-60 flex shrink-0 items-center gap-2 px-2.5">
      {onLogoClick ? (
        <button
          type="button"
          className="cursor-pointer"
          aria-label="Back to project plans"
          onClick={onLogoClick}
        >
          <Brand size="sm" />
        </button>
      ) : (
        <Brand size="sm" />
      )}

      {fileName && (
        <span className="absolute left-1/2 hidden max-w-[50%] -translate-x-1/2 truncate text-xs text-t2 md:block">
          {fileName}
        </span>
      )}

      <Button
        variant="text"
        size="sm"
        className="ml-auto"
        aria-label="Sign out"
        onClick={handleSignOut}
      >
        <LogOut />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </header>
  );
}

export function Toolbar({ hasDoc, onOpenPdf, onImportJson, allowLocalFiles = true }: ToolbarProps) {
  const addPinMode = useProject((s) => s.addPinMode);
  const setAddPinMode = useProject((s) => s.setAddPinMode);
  const taskListOpen = useProject((s) => s.taskListOpen);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const showTaskList = useProject((s) => s.showTaskList);
  const closeTaskList = useProject((s) => s.closeTaskList);
  const taskCount = useProject((s) => Object.keys(s.tasks).length);
  const sidebarCollapsed = useProject((s) => s.sidebarCollapsed);
  const taskListActive = taskListOpen && selectedTaskId === null;

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* One compact workspace bar. Left padding leaves room for the sidebar
          edge toggle that sits at this intersection. */}
      <header
        className="fp-actionbar z-40 flex shrink-0 items-center text-xs"
        aria-label="FieldPilot tools"
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 pr-2.5 transition-[padding-left] duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
            sidebarCollapsed ? 'pl-9' : 'pl-[180px]',
          )}
        >
          <Dropdown
            align="left"
            trigger={
              <Button variant="text" size="sm">
                <span>File</span>
                <ChevronDown />
              </Button>
            }
          >
            {(close) => (
              <>
                <DropdownItem
                  className="text-t2 hover:text-t1"
                  disabled={!allowLocalFiles}
                  onClick={() => {
                    pdfInputRef.current?.click();
                    close();
                  }}
                >
                  <FolderOpen />
                  Open PDF
                </DropdownItem>
                <DropdownItem
                  className="text-t2 hover:text-t1"
                  disabled={!hasDoc || !allowLocalFiles}
                  onClick={() => {
                    jsonInputRef.current?.click();
                    close();
                  }}
                >
                  <FileUp />
                  Import tasks
                </DropdownItem>
                <DropdownItem
                  className="text-t2 hover:text-t1"
                  disabled={!hasDoc}
                  onClick={() => {
                    const s = useProject.getState();
                    void exportProject({
                      fileName: s.fileName,
                      fingerprint: s.fingerprint,
                      nextSeq: s.nextSeq,
                      tasks: s.tasks,
                    });
                    close();
                  }}
                >
                  <Download />
                  Export tasks
                </DropdownItem>
              </>
            )}
          </Dropdown>

          <Button
            variant="text"
            size="sm"
            data-active={addPinMode}
            className={addPinMode ? 'text-accent hover:text-accent-hover' : undefined}
            aria-pressed={addPinMode}
            disabled={!hasDoc}
            onClick={() => setAddPinMode(!addPinMode)}
          >
            <Pin />
            <span className="hidden sm:inline">Add pin</span>
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="text"
              size="sm"
              data-active={taskListActive}
              className={taskListActive ? 'text-accent hover:text-accent-hover' : undefined}
              aria-pressed={taskListActive}
              disabled={!hasDoc}
              onClick={() => (taskListActive ? closeTaskList() : showTaskList())}
            >
              <ListTodo />
              <span className="hidden sm:inline">Tasks</span>
              {taskCount > 0 && <span className="font-mono text-[10px]">{taskCount}</span>}
            </Button>
          </div>
        </div>
      </header>

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
