import { useRef } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  Cloud,
  Download,
  FileDown,
  FileUp,
  FolderOpen,
  Highlighter,
  ListTodo,
  LogOut,
  Magnet,
  MessageSquareText,
  Minus,
  MousePointer2,
  Pencil,
  Pin,
  Ruler,
  Scale,
  Shapes,
  Square,
  Type,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useProject } from '../store/project';
import { exportProject } from '../lib/transfer';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Dropdown, DropdownItem, DropdownLabel } from './ui/dropdown-menu';
import { Brand } from './Brand';

interface ToolbarProps {
  hasDoc: boolean;
  savingPdf: boolean;
  onOpenPdf: (file: File) => void;
  onImportJson: (file: File) => void;
  onSavePdf: () => void;
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
        <span
          className="absolute left-1/2 hidden max-w-[50%] -translate-x-1/2 truncate text-xs text-t2 md:block"
          title={fileName}
        >
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

export function Toolbar({
  hasDoc,
  savingPdf,
  onOpenPdf,
  onImportJson,
  onSavePdf,
  allowLocalFiles = true,
}: ToolbarProps) {
  const addPinMode = useProject((s) => s.addPinMode);
  const setAddPinMode = useProject((s) => s.setAddPinMode);
  const taskListOpen = useProject((s) => s.taskListOpen);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const showTaskList = useProject((s) => s.showTaskList);
  const closeTaskList = useProject((s) => s.closeTaskList);
  const taskCount = useProject((s) => Object.keys(s.tasks).length);
  const sidebarCollapsed = useProject((s) => s.sidebarCollapsed);
  const markupTool = useProject((s) => s.markupTool);
  const setMarkupTool = useProject((s) => s.setMarkupTool);
  const currentPage = useProject((s) => s.currentPage);
  const calibrated = useProject((s) => Boolean(s.calibrations[s.currentPage]));
  const snappingEnabled = useProject((s) => s.snappingEnabled);
  const setSnappingEnabled = useProject((s) => s.setSnappingEnabled);
  const canUndo = useProject((s) => s.historyPast.length > 0);
  const canRedo = useProject((s) => s.historyFuture.length > 0);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
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
            'flex min-w-0 flex-1 items-center gap-0.5 pr-2 transition-[padding-left] duration-(--fp-motion-duration) ease-(--fp-motion-ease) sm:gap-1 sm:pr-2.5',
            sidebarCollapsed ? 'pl-7' : 'pl-[180px]',
          )}
        >
          <Dropdown
            align="left"
            trigger={
              <Button variant="text" size="sm" aria-label="File">
                <FolderOpen className="sm:hidden" />
                <span className="hidden sm:inline">File</span>
                <ChevronDown className="hidden sm:block" />
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
                  Import project
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
                      markups: s.markups,
                      calibrations: s.calibrations,
                    });
                    close();
                  }}
                >
                  <Download />
                  Export project
                </DropdownItem>
                <DropdownItem
                  className="text-t2 hover:text-t1"
                  disabled={!hasDoc || savingPdf}
                  onClick={() => {
                    onSavePdf();
                    close();
                  }}
                >
                  <FileDown />
                  {savingPdf ? 'Saving PDF…' : 'Save marked-up PDF'}
                </DropdownItem>
              </>
            )}
          </Dropdown>

          <Button
            variant="text"
            size="sm"
            aria-label="Undo"
            disabled={!hasDoc || !canUndo}
            onClick={undo}
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 />
            <span className="hidden lg:inline">Undo</span>
          </Button>
          <Button
            variant="text"
            size="sm"
            aria-label="Redo"
            disabled={!hasDoc || !canRedo}
            onClick={redo}
            title="Redo (Ctrl/Cmd+Y)"
          >
            <Redo2 />
            <span className="hidden lg:inline">Redo</span>
          </Button>

          <Button
            variant="text"
            size="sm"
            data-active={addPinMode}
            className={addPinMode ? 'text-accent hover:text-accent-hover' : undefined}
            aria-pressed={addPinMode}
            disabled={!hasDoc}
            onClick={() => setAddPinMode(!addPinMode)}
            title="Add pin (P)"
          >
            <Pin />
            <span className="hidden sm:inline">Add pin</span>
          </Button>
          <Dropdown
            align="left"
            trigger={
              <Button
                variant="text"
                size="sm"
                data-active={Boolean(markupTool)}
                className={markupTool ? 'text-accent hover:text-accent-hover' : undefined}
                disabled={!hasDoc}
                aria-label="Markup tools"
              >
                <Shapes />
                <span className="hidden sm:inline">Markup</span>
                <ChevronDown className="hidden sm:block" />
              </Button>
            }
          >
            {(close) => {
              const choose = (tool: Parameters<typeof setMarkupTool>[0]) => {
                setMarkupTool(tool);
                close();
              };
              return (
                <>
                  <DropdownLabel>Edit</DropdownLabel>
                  <DropdownItem onClick={() => choose('select')}>
                    <MousePointer2 />
                    Select / edit
                  </DropdownItem>
                  <DropdownItem
                    className="sm:hidden"
                    disabled={!canUndo}
                    onClick={() => {
                      undo();
                      close();
                    }}
                  >
                    <Undo2 /> Undo
                  </DropdownItem>
                  <DropdownItem
                    className="sm:hidden"
                    disabled={!canRedo}
                    onClick={() => {
                      redo();
                      close();
                    }}
                  >
                    <Redo2 /> Redo
                  </DropdownItem>
                  <DropdownLabel>Text & freehand</DropdownLabel>
                  <DropdownItem onClick={() => choose('text')}>
                    <Type />
                    Text box
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('pen')}>
                    <Pencil />
                    Pen
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('highlight')}>
                    <Highlighter />
                    Highlight
                  </DropdownItem>
                  <DropdownLabel>Lines & shapes</DropdownLabel>
                  <DropdownItem onClick={() => choose('line')}>
                    <Minus />
                    Line
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('arrow')}>
                    <ArrowUpRight />
                    Arrow
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('rectangle')}>
                    <Square />
                    Rectangle
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('ellipse')}>
                    <Circle />
                    Ellipse
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('cloud')}>
                    <Cloud />
                    Revision cloud
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('callout')}>
                    <MessageSquareText />
                    Callout
                  </DropdownItem>
                  <DropdownItem onClick={() => choose('cloud-plus')}>
                    <Cloud />
                    Cloud+
                  </DropdownItem>
                </>
              );
            }}
          </Dropdown>
          <Dropdown
            align="left"
            trigger={
              <Button
                variant="text"
                size="sm"
                data-active={
                  markupTool === 'calibrate' ||
                  markupTool === 'dimension' ||
                  markupTool === 'radius' ||
                  markupTool === 'diameter' ||
                  markupTool === 'arc'
                }
                className={
                  markupTool === 'calibrate' ||
                  markupTool === 'dimension' ||
                  markupTool === 'radius' ||
                  markupTool === 'diameter' ||
                  markupTool === 'arc'
                    ? 'text-accent hover:text-accent-hover'
                    : undefined
                }
                disabled={!hasDoc}
                aria-label="Measurement tools"
                title={
                  calibrated
                    ? `Sheet ${currentPage} is calibrated`
                    : `Sheet ${currentPage} is not calibrated`
                }
              >
                <Ruler />
                <span className="hidden sm:inline">Measure</span>
                <span className={`size-1.5 rounded-full ${calibrated ? 'bg-ok' : 'bg-warn'}`} />
                <ChevronDown className="hidden sm:block" />
              </Button>
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Sheet {currentPage}</DropdownLabel>
                <DropdownItem
                  onClick={() => {
                    setMarkupTool('calibrate');
                    close();
                  }}
                >
                  <Scale />
                  {calibrated ? 'Recalibrate scale' : 'Calibrate scale'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => {
                    setMarkupTool('dimension');
                    close();
                  }}
                >
                  <Ruler />
                  Dimension{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => {
                    setMarkupTool('radius');
                    close();
                  }}
                >
                  <Circle />
                  Radius{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => {
                    setMarkupTool('diameter');
                    close();
                  }}
                >
                  <Circle />
                  Diameter{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => {
                    setMarkupTool('arc');
                    close();
                  }}
                >
                  <Circle />
                  Arc{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => {
                    setMarkupTool('area');
                    close();
                  }}
                >
                  <Square />
                  Area{!calibrated && ' (calibrate first)'}
                </DropdownItem>
              </>
            )}
          </Dropdown>
          <Button
            variant="text"
            size="sm"
            data-active={snappingEnabled}
            className={snappingEnabled ? 'text-accent hover:text-accent-hover' : undefined}
            aria-label={snappingEnabled ? 'Turn snapping off' : 'Turn snapping on'}
            aria-pressed={snappingEnabled}
            disabled={!hasDoc}
            onClick={() => setSnappingEnabled(!snappingEnabled)}
            title={`Snap to plan points: ${snappingEnabled ? 'On' : 'Off'}`}
          >
            <Magnet />
            <span className="hidden sm:inline">Snap</span>
            <span className="hidden font-mono text-[10px] sm:inline">
              {snappingEnabled ? 'On' : 'Off'}
            </span>
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="text"
              size="sm"
              data-active={taskListOpen && selectedTaskId === null}
              className={taskListActive ? 'text-accent hover:text-accent-hover' : undefined}
              aria-pressed={taskListActive}
              aria-label={taskListActive ? 'Close tasks' : 'Show tasks'}
              disabled={!hasDoc}
              onClick={() => (taskListActive ? closeTaskList() : showTaskList())}
              title={taskListActive ? 'Close tasks' : 'Show tasks'}
            >
              <ListTodo />
              <span className="hidden sm:inline">Tasks</span>
              {taskCount > 0 && <span className="hidden font-mono text-[10px] sm:inline">{taskCount}</span>}
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
