import { useCallback, useEffect, useState } from 'react';
import { openPdf, type PDFDocumentProxy } from './lib/pdf';
import { importProject } from './lib/transfer';
import { useProject } from './store/project';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Viewer } from './components/Viewer';
import { TaskPanel } from './components/TaskPanel';
import { TaskList } from './components/TaskList';
import { EmptyState } from './components/EmptyState';
import { Lightbox } from './components/Lightbox';

export default function App() {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const design = useProject((s) => s.design);

  useEffect(() => {
    document.documentElement.dataset.design = design;
  }, [design]);

  const openBuffer = useCallback(async (buf: ArrayBuffer, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const opened = await openPdf(buf);
      await useProject
        .getState()
        .loadDocument({ fileName: name, fingerprint: opened.fingerprint, pageCount: opened.pageCount });
      setDoc(opened.doc);
    } catch {
      setError('That file could not be opened as a PDF plan. Try another file.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openPdfFile = useCallback(
    async (file: File) => {
      await openBuffer(await file.arrayBuffer(), file.name);
    },
    [openBuffer],
  );

  const loadDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/demo/demo-plan.pdf');
      if (!res.ok) throw new Error('missing');
      await openBuffer(await res.arrayBuffer(), 'Cedar Ridge Community Center — demo plan.pdf');
    } catch {
      setError('The demo plan is missing from public/demo/. Open your own PDF instead.');
      setLoading(false);
    }
  }, [openBuffer]);

  const onImportJson = useCallback(async (file: File) => {
    try {
      const { tasks, nextSeq } = await importProject(file);
      useProject.getState().replaceProject(tasks, nextSeq);
    } catch {
      setError('That file is not a valid FieldPilot export.');
    }
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      const s = useProject.getState();
      if (e.key === 'Escape') {
        // The lightbox handles its own Escape (capture phase, stops propagation),
        // so if it were open this handler would not run.
        // Priority 1: exiting the add-pin tool wins — even mid-typing.
        if (s.addPinMode) {
          s.setAddPinMode(false);
          return;
        }
        // Priority 2: otherwise close the properties panel / deselect.
        if (s.selectedTaskId) s.selectTask(null);
        return;
      }
      if (typing || !doc) return;
      if (e.key === 'p' || e.key === 'P') {
        s.setAddPinMode(!s.addPinMode);
      } else if (e.key === 'ArrowLeft') {
        s.setPage(s.currentPage - 1);
      } else if (e.key === 'ArrowRight') {
        s.setPage(s.currentPage + 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doc]);

  return (
    <div className="flex h-full flex-col bg-app font-sans text-t1">
      <Toolbar hasDoc={doc !== null} onOpenPdf={(f) => void openPdfFile(f)} onImportJson={(f) => void onImportJson(f)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {doc ? (
            <Viewer doc={doc} />
          ) : (
            <EmptyState loading={loading} error={error} onOpen={(f) => void openPdfFile(f)} onLoadDemo={() => void loadDemo()} />
          )}
          {doc && error && (
            <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-md bg-danger px-3 py-2 text-xs font-medium text-white shadow-e2">
              {error}
              <button type="button" className="ml-3 underline cursor-pointer" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}
        </main>
        {doc && <TaskList />}
        {/* Properties panel overlays the tasks pane (higher z-index), anchored to
            the right of the whole middle row so it covers the pane, not just the canvas. */}
        {doc && <TaskPanel />}
      </div>
      <StatusBar hasDoc={doc !== null} />
      <Lightbox />
    </div>
  );
}
