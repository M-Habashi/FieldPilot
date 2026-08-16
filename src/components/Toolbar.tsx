import { useRef } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ArrowUpRight,
  BriefcaseBusiness,
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
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Pin,
  Redo2,
  Ruler,
  Scale,
  Shapes,
  Square,
  Type,
  Undo2,
} from 'lucide-react';
import { useProject } from '../store/project';
import { exportProject } from '../lib/transfer';
import {
  ActionBar,
  ActionBarBadge,
  ActionBarButton,
  ActionBarDot,
  ActionBarGroup,
} from './ui/action-bar';
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
  const fileName = useProject((state) => state.fileName);
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
  const addPinMode = useProject((state) => state.addPinMode);
  const setAddPinMode = useProject((state) => state.setAddPinMode);
  const taskListOpen = useProject((state) => state.taskListOpen);
  const selectedTaskId = useProject((state) => state.selectedTaskId);
  const showTaskList = useProject((state) => state.showTaskList);
  const closeTaskList = useProject((state) => state.closeTaskList);
  const taskCount = useProject((state) => Object.keys(state.tasks).length);
  const markupTool = useProject((state) => state.markupTool);
  const setMarkupTool = useProject((state) => state.setMarkupTool);
  const currentPage = useProject((state) => state.currentPage);
  const calibrated = useProject((state) => Boolean(state.calibrations[state.currentPage]));
  const snappingEnabled = useProject((state) => state.snappingEnabled);
  const setSnappingEnabled = useProject((state) => state.setSnappingEnabled);
  const canUndo = useProject((state) => state.historyPast.length > 0);
  const canRedo = useProject((state) => state.historyFuture.length > 0);
  const undo = useProject((state) => state.undo);
  const redo = useProject((state) => state.redo);
  const taskListActive = taskListOpen && selectedTaskId === null;
  const measuring =
    markupTool === 'calibrate' ||
    markupTool === 'dimension' ||
    markupTool === 'area' ||
    markupTool === 'radius' ||
    markupTool === 'diameter' ||
    markupTool === 'arc';
  const drawing = Boolean(markupTool) && !measuring;
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const chooseMarkup = (tool: Parameters<typeof setMarkupTool>[0], close: () => void) => {
    setMarkupTool(tool);
    close();
  };

  return (
    <>
      <ActionBar label="Plan tools" onOpenNav={() => useProject.getState().toggleSidebarMobile()}>
        <ActionBarGroup>
          <ActionBarButton
            icon={<Pin />}
            label="Add pin"
            title="Add pin (P)"
            active={addPinMode}
            aria-pressed={addPinMode}
            disabled={!hasDoc}
            onClick={() => setAddPinMode(!addPinMode)}
          />

          <Dropdown
            align="left"
            trigger={
              <ActionBarButton
                icon={<BriefcaseBusiness />}
                label="Work"
                active={taskListActive}
                disabled={!hasDoc}
                menu
              >
                {taskCount > 0 && <ActionBarBadge>{taskCount}</ActionBarBadge>}
              </ActionBarButton>
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Field work</DropdownLabel>
                <DropdownItem
                  onClick={() => {
                    if (taskListActive) closeTaskList();
                    else showTaskList();
                    close();
                  }}
                >
                  <ListTodo />
                  {taskListActive ? 'Close task queue' : 'Open task queue'}
                  {taskCount > 0 && (
                    <span className="ml-auto font-mono text-[10px]">{taskCount}</span>
                  )}
                </DropdownItem>
              </>
            )}
          </Dropdown>

          <Dropdown
            align="left"
            trigger={
              <ActionBarButton
                icon={<Shapes />}
                label="Markup"
                aria-label="Markup tools"
                active={drawing}
                disabled={!hasDoc}
                menu
              />
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Edit</DropdownLabel>
                <DropdownItem onClick={() => chooseMarkup('select', close)}>
                  <MousePointer2 /> Select / edit markup
                </DropdownItem>
                <DropdownLabel>Text and freehand</DropdownLabel>
                <DropdownItem onClick={() => chooseMarkup('text', close)}>
                  <Type /> Text box
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('pen', close)}>
                  <Pencil /> Pen
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('highlight', close)}>
                  <Highlighter /> Highlight
                </DropdownItem>
                <DropdownLabel>Lines and shapes</DropdownLabel>
                <DropdownItem onClick={() => chooseMarkup('line', close)}>
                  <Minus /> Line
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('arrow', close)}>
                  <ArrowUpRight /> Arrow
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('rectangle', close)}>
                  <Square /> Rectangle
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('ellipse', close)}>
                  <Circle /> Ellipse
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('cloud', close)}>
                  <Cloud /> Revision cloud
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('callout', close)}>
                  <MessageSquareText /> Callout
                </DropdownItem>
                <DropdownItem onClick={() => chooseMarkup('cloud-plus', close)}>
                  <Cloud /> Cloud+
                </DropdownItem>
              </>
            )}
          </Dropdown>

          <Dropdown
            align="left"
            trigger={
              <ActionBarButton
                icon={<Ruler />}
                label="Measure"
                aria-label="Measurement tools"
                active={measuring}
                disabled={!hasDoc}
                menu
                title={
                  calibrated
                    ? `Sheet ${currentPage} is calibrated`
                    : `Sheet ${currentPage} is not calibrated`
                }
              >
                <ActionBarDot tone={calibrated ? 'ok' : 'warn'} />
              </ActionBarButton>
            }
          >
            {(close) => (
              <>
                <DropdownLabel>Sheet {currentPage}</DropdownLabel>
                <DropdownItem onClick={() => chooseMarkup('calibrate', close)}>
                  <Scale /> {calibrated ? 'Recalibrate scale' : 'Calibrate scale'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => chooseMarkup('dimension', close)}
                >
                  <Ruler /> Dimension{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => chooseMarkup('area', close)}>
                  <Square /> Area{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => chooseMarkup('radius', close)}>
                  <Circle /> Radius{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem
                  disabled={!calibrated}
                  onClick={() => chooseMarkup('diameter', close)}
                >
                  <Circle /> Diameter{!calibrated && ' (calibrate first)'}
                </DropdownItem>
                <DropdownItem disabled={!calibrated} onClick={() => chooseMarkup('arc', close)}>
                  <Circle /> Arc{!calibrated && ' (calibrate first)'}
                </DropdownItem>
              </>
            )}
          </Dropdown>

          <Dropdown
            align="left"
            trigger={<ActionBarButton icon={<MoreHorizontal />} label="More" menu />}
          >
            {(close) => (
              <>
                <DropdownLabel>History</DropdownLabel>
                <DropdownItem
                  disabled={!hasDoc || !canUndo}
                  onClick={() => {
                    undo();
                    close();
                  }}
                >
                  <Undo2 /> Undo <span className="ml-auto text-[10px] text-t3">Ctrl/Cmd+Z</span>
                </DropdownItem>
                <DropdownItem
                  disabled={!hasDoc || !canRedo}
                  onClick={() => {
                    redo();
                    close();
                  }}
                >
                  <Redo2 /> Redo <span className="ml-auto text-[10px] text-t3">Ctrl/Cmd+Y</span>
                </DropdownItem>
                <DropdownLabel>Plan aids</DropdownLabel>
                <DropdownItem
                  disabled={!hasDoc}
                  onClick={() => {
                    setSnappingEnabled(!snappingEnabled);
                    close();
                  }}
                >
                  <Magnet /> Snapping
                  <span className="ml-auto font-mono text-[10px]">
                    {snappingEnabled ? 'On' : 'Off'}
                  </span>
                </DropdownItem>
                <DropdownLabel>Files</DropdownLabel>
                {allowLocalFiles && (
                  <>
                    <DropdownItem
                      onClick={() => {
                        pdfInputRef.current?.click();
                        close();
                      }}
                    >
                      <FolderOpen /> Open PDF
                    </DropdownItem>
                    <DropdownItem
                      disabled={!hasDoc}
                      onClick={() => {
                        jsonInputRef.current?.click();
                        close();
                      }}
                    >
                      <FileUp /> Import project
                    </DropdownItem>
                  </>
                )}
                <DropdownItem
                  disabled={!hasDoc}
                  onClick={() => {
                    const state = useProject.getState();
                    void exportProject({
                      fileName: state.fileName,
                      fingerprint: state.fingerprint,
                      nextSeq: state.nextSeq,
                      tasks: state.tasks,
                      markups: state.markups,
                      calibrations: state.calibrations,
                    });
                    close();
                  }}
                >
                  <Download /> Export project
                </DropdownItem>
                <DropdownItem
                  disabled={!hasDoc || savingPdf}
                  onClick={() => {
                    onSavePdf();
                    close();
                  }}
                >
                  <FileDown /> {savingPdf ? 'Saving PDF…' : 'Save marked-up PDF'}
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </ActionBarGroup>
      </ActionBar>

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onOpenPdf(file);
          event.target.value = '';
        }}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportJson(file);
          event.target.value = '';
        }}
      />
    </>
  );
}
