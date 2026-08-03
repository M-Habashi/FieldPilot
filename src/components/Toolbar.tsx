import { useRef } from 'react';
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
  MapPin,
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
import { DesignSwitcher } from './DesignSwitcher';

interface ToolbarProps {
  hasDoc: boolean;
  savingPdf: boolean;
  onOpenPdf: (file: File) => void;
  onImportJson: (file: File) => void;
  onSavePdf: () => void;
}

export function AppHeader() {
  const fileName = useProject((s) => s.fileName);

  return (
    <header className="fp-toolbar relative z-60 flex shrink-0 items-center gap-2 px-2.5">
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
  );
}

export function Toolbar({ hasDoc, savingPdf, onOpenPdf, onImportJson, onSavePdf }: ToolbarProps) {
  const addPinMode = useProject((s) => s.addPinMode);
  const setAddPinMode = useProject((s) => s.setAddPinMode);
  const taskListOpen = useProject((s) => s.taskListOpen);
  const selectedTaskId = useProject((s) => s.selectedTaskId);
  const showTaskList = useProject((s) => s.showTaskList);
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

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* One compact workspace bar. Left padding leaves room for the sidebar
          edge toggle that sits at this intersection. */}
      <header className="fp-actionbar z-40 flex shrink-0 items-center text-xs" aria-label="FieldPilot tools">
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
                  disabled={!hasDoc}
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
              >
                <Shapes />
                <span className="hidden sm:inline">Markup</span>
                <ChevronDown />
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
                  <DropdownItem onClick={() => choose('select')}><MousePointer2 />Select / edit</DropdownItem>
                  <DropdownLabel>Text & freehand</DropdownLabel>
                  <DropdownItem onClick={() => choose('text')}><Type />Text box</DropdownItem>
                  <DropdownItem onClick={() => choose('pen')}><Pencil />Pen</DropdownItem>
                  <DropdownItem onClick={() => choose('highlight')}><Highlighter />Highlight</DropdownItem>
                  <DropdownLabel>Lines & shapes</DropdownLabel>
                  <DropdownItem onClick={() => choose('line')}><Minus />Line</DropdownItem>
                  <DropdownItem onClick={() => choose('arrow')}><ArrowUpRight />Arrow</DropdownItem>
                  <DropdownItem onClick={() => choose('rectangle')}><Square />Rectangle</DropdownItem>
                  <DropdownItem onClick={() => choose('ellipse')}><Circle />Ellipse</DropdownItem>
                  <DropdownItem onClick={() => choose('cloud')}><Cloud />Revision cloud</DropdownItem>
                  <DropdownItem onClick={() => choose('callout')}><MessageSquareText />Callout</DropdownItem>
                  <DropdownItem onClick={() => choose('cloud-plus')}><Cloud />Cloud+</DropdownItem>
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
                data-active={markupTool === 'calibrate' || markupTool === 'dimension' || markupTool === 'radius' || markupTool === 'diameter' || markupTool === 'arc'}
                className={markupTool === 'calibrate' || markupTool === 'dimension' || markupTool === 'radius' || markupTool === 'diameter' || markupTool === 'arc' ? 'text-accent hover:text-accent-hover' : undefined}
                disabled={!hasDoc}
                title={calibrated ? `Sheet ${currentPage} is calibrated` : `Sheet ${currentPage} is not calibrated`}
              >
                <Ruler />
                <span className="hidden sm:inline">Measure</span>
                <span className={`size-1.5 rounded-full ${calibrated ? 'bg-ok' : 'bg-warn'}`} />
                <ChevronDown />
              </Button>
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Sheet {currentPage}</DropdownLabel>
                <DropdownItem onClick={() => { setMarkupTool('calibrate'); close(); }}>
                  <Scale />{calibrated ? 'Recalibrate scale' : 'Calibrate scale'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => { setMarkupTool('dimension'); close(); }}>
                  <Ruler />Dimension{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => { setMarkupTool('radius'); close(); }}>
                  <Circle />Radius{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => { setMarkupTool('diameter'); close(); }}>
                  <Circle />Diameter{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => { setMarkupTool('arc'); close(); }}>
                  <Circle />Arc{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => { setMarkupTool('area'); close(); }}>
                  <Square />Area{!calibrated && ' (calibrate first)'}
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
            <span className="font-mono text-[10px]">{snappingEnabled ? 'On' : 'Off'}</span>
          </Button>
          <div className="ml-auto flex items-center gap-1">
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
              data-active={taskListOpen && selectedTaskId === null}
              className={taskListOpen && selectedTaskId === null ? 'text-accent hover:text-accent-hover' : undefined}
              disabled={!hasDoc}
              onClick={showTaskList}
              title="Show tasks"
            >
              <ListTodo />
              <span className="hidden sm:inline">Tasks</span>
              {taskCount > 0 && <span className="font-mono text-[10px]">{taskCount}</span>}
            </Button>
            <DesignSwitcher />
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
