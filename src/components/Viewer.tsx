import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy } from '../lib/pdf';
import { clamp, cn } from '../lib/utils';
import { useProject } from '../store/project';
import { PinLayer } from './PinLayer';
import { Button } from './ui/button';

interface View {
  scale: number;
  offset: { x: number; y: number };
}

interface PageBase {
  w: number;
  h: number;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function zoomAt(v: View, cx: number, cy: number, factor: number): View {
  const scale = clamp(v.scale * factor, 0.1, 8);
  const k = scale / v.scale;
  return {
    scale,
    offset: {
      x: cx - (cx - v.offset.x) * k,
      y: cy - (cy - v.offset.y) * k,
    },
  };
}

export function Viewer({ doc }: { doc: PDFDocumentProxy }) {
  const currentPage = useProject((s) => s.currentPage);
  const addPinMode = useProject((s) => s.addPinMode);
  const addTask = useProject((s) => s.addTask);
  const selectTask = useProject((s) => s.selectTask);
  const showPinTooltip = useProject((s) => s.showPinTooltip);
  const focusRequest = useProject((s) => s.focusRequest);

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel(): void } | null>(null);
  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
    button: number;
  } | null>(null);

  const [pageBase, setPageBase] = useState<PageBase | null>(null);
  const [view, setView] = useState<View>({ scale: 1, offset: { x: 0, y: 0 } });
  const [panning, setPanning] = useState(false);
  const [smoothView, setSmoothView] = useState(false);
  const renderScale = useDebounced(view.scale, 120);

  const stopSmoothView = useCallback(() => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    motionTimerRef.current = null;
    setSmoothView(false);
  }, []);

  const animateView = useCallback((update: (current: View) => View) => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    setSmoothView(true);
    setView(update);
    motionTimerRef.current = setTimeout(() => {
      setSmoothView(false);
      motionTimerRef.current = null;
    }, 240);
  }, []);

  useEffect(() => () => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
  }, []);

  const fit = useCallback((pb: PageBase) => {
    const el = containerRef.current;
    if (!el) return;
    const pad = 48;
    const s = clamp(
      Math.min((el.clientWidth - pad) / pb.w, (el.clientHeight - pad) / pb.h),
      0.1,
      8,
    );
    animateView(() => ({
      scale: s,
      offset: { x: (el.clientWidth - pb.w * s) / 2, y: (el.clientHeight - pb.h * s) / 2 },
    }));
  }, [animateView]);

  // Load page dimensions and fit on page change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(currentPage);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      const pb = { w: vp.width, h: vp.height };
      setPageBase(pb);
      fit(pb);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage, fit]);

  // Rasterize the page whenever the (debounced) scale settles.
  useEffect(() => {
    if (!pageBase) return;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(currentPage);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: renderScale * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      renderTaskRef.current?.cancel();
      const task = page.render({ canvas, viewport: vp });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        // render cancelled by a newer one — expected during zoom
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage, renderScale, pageBase]);

  // Wheel / pinch zoom around the cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopSmoothView();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      setView((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stopSmoothView]);

  // Center the viewport on a pin when the task list asks for it.
  useEffect(() => {
    if (!focusRequest || !pageBase) return;
    const task = useProject.getState().tasks[focusRequest.taskId];
    const el = containerRef.current;
    if (!task || !el || task.page !== currentPage) return;
    animateView((v) => ({
      ...v,
      offset: {
        x: el.clientWidth / 2 - task.x * pageBase.w * v.scale,
        y: el.clientHeight / 2 - task.y * pageBase.h * v.scale,
      },
    }));
  }, [focusRequest, pageBase, currentPage, animateView]);

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    animateView((v) => zoomAt(v, el.clientWidth / 2, el.clientHeight / 2, factor));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button (0) = pan / place-pin / select. Middle button (1) = pan in ANY mode.
    if (e.button !== 0 && e.button !== 1) return;
    stopSmoothView();
    e.currentTarget.setPointerCapture(e.pointerId);
    const middle = e.button === 1;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: view.offset.x,
      oy: view.offset.y,
      // Middle-drag is always a pan and never a click, so mark it moved up front.
      moved: middle,
      button: e.button,
    };
    if (middle || !addPinMode) setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true;
      setPanning(true);
    }
    if (d.moved) {
      setView((v) => ({ ...v, offset: { x: d.ox + dx, y: d.oy + dy } }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    // Only a stationary LEFT click ever places a pin / deselects. A middle-button
    // release (d.moved is true, d.button !== 0) can never create a pin.
    if (!d || d.moved || d.button !== 0) return;
    const world = worldRef.current;
    if (!world) return;
    const rect = world.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const inside = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
    if (addPinMode && inside) {
      addTask(currentPage, nx, ny);
    } else {
      showPinTooltip(null);
      selectTask(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'fp-canvas-stage relative h-full w-full overflow-hidden touch-none select-none',
        panning ? 'fp-cursor-panning' : addPinMode ? 'fp-cursor-pin' : 'fp-cursor-pan',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setPanning(false);
      }}
      // Stop the browser's middle-click autoscroll widget from ever appearing.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => e.preventDefault()}
    >
      {pageBase && (
        <div
          ref={worldRef}
          className={cn(
            'absolute top-0 left-0',
            smoothView &&
              'transition-[transform,width,height] duration-(--fp-motion-duration) ease-(--fp-motion-ease)',
          )}
          style={{
            transform: `translate(${view.offset.x}px, ${view.offset.y}px)`,
            width: pageBase.w * view.scale,
            height: pageBase.h * view.scale,
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full bg-white shadow-e2"
          />
          <PinLayer />
        </div>
      )}

      <div
        className={cn(
          'pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent shadow-e2',
          'transition-[opacity,transform] duration-(--fp-dur-med) ease-(--fp-ease)',
          addPinMode ? 'opacity-100 translate-y-0' : '-translate-y-3 opacity-0',
        )}
      >
        Click the sheet to place a pin — Esc to finish
      </div>

      {/* Compact, low-weight zoom control. It stops pointer events from reaching
          the stage: without this the stage's onPointerDown captures the pointer,
          which redirects the pointerup and swallows these buttons' clicks — the
          reason zoom/fit previously did nothing. */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md border border-line/70 bg-surface/85 p-0.5 shadow-e1 backdrop-blur-sm"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="iconXs" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          <Minus />
        </Button>
        <span className="w-10 text-center font-mono text-[11px] text-t2 tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
        <Button variant="ghost" size="iconXs" aria-label="Zoom in" onClick={() => zoomBy(1.3)}>
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="iconXs"
          aria-label="Fit to screen"
          onClick={() => pageBase && fit(pageBase)}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
