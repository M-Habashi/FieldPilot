import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleX, Maximize, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy, PDFPageProxy } from '../lib/pdf';
import { cappedRasterScale } from '../lib/canvas';
import type { Markup, MarkupPoint, MarkupTool } from '../types';
import { clamp, cn } from '../lib/utils';
import { useProject } from '../store/project';
import { PinLayer } from './PinLayer';
import { MarkupLayer } from './MarkupLayer';
import { CalibrationDialog } from './CalibrationDialog';
import { Button } from './ui/button';
import { extractPdfSnapPoints } from '../lib/pdf-snapping';

interface View {
  scale: number;
  offset: { x: number; y: number };
}

interface PageBase {
  w: number;
  h: number;
}

interface TouchPinDrag {
  taskId: string;
  originX: number;
  originY: number;
  overCancelZone: boolean;
}

function markupDraft(type: Markup['type'], page: number, points: MarkupPoint[]): Markup {
  const highlight = type === 'highlight';
  const dimension = type === 'dimension';
  const measurement = dimension || type === 'radius' || type === 'diameter' || type === 'arc';
  const area = type === 'area';
  const callout = type === 'callout';
  return {
    id: 'draft',
    page,
    type,
    points,
    text: type === 'text' ? '' : callout ? 'Callout' : type === 'cloud-plus' ? 'Cloud+' : '',
    stroke: highlight ? '#facc15' : '#dc2626',
    fill: callout ? '#ffffff' : area ? '#bbf7d0' : 'transparent',
    strokeWidth: highlight ? 14 : dimension ? 1 : measurement ? 2 : 3,
    opacity: highlight ? 0.35 : area ? 0.8 : 1,
    lineStyle: 'solid',
    startEnding: dimension || type === 'diameter' ? 'filled-arrow' : 'none',
    endEnding: type === 'arrow' || dimension || type === 'diameter' ? 'filled-arrow' : 'none',
    fillOpacity: 1,
    leaderStroke: '#dc2626',
    leaderStrokeWidth: 2,
    leaderOpacity: 1,
    leaderLineStyle: 'solid',
    leaderEnding: 'filled-arrow',
    boxShape: callout || type === 'text' ? 'rectangle' : undefined,
    cloudRadius: 10,
    fontSize: 14,
    fontFamily: 'Helvetica',
    fontBold: type === 'cloud-plus' || measurement,
    measurementUnit: 'calibrated',
    fractionDenominator: 16,
    witnessLines: dimension,
    extensionOffset: dimension ? 18 : undefined,
    extensionLength: dimension ? 18 : undefined,
    arrowSize: measurement ? 8 : undefined,
    fontItalic: false,
    textAlign: 'center',
    createdAt: 0,
    updatedAt: 0,
  };
}

function orthogonalPoint(start: MarkupPoint, point: MarkupPoint, page: PageBase): MarkupPoint {
  const dx = (point.x - start.x) * page.w;
  const dy = (point.y - start.y) * page.h;
  return Math.abs(dx) >= Math.abs(dy) ? { x: point.x, y: start.y } : { x: start.x, y: point.y };
}

function squarePoint(start: MarkupPoint, point: MarkupPoint, page: PageBase): MarkupPoint {
  const dx = (point.x - start.x) * page.w;
  const dy = (point.y - start.y) * page.h;
  const xDirection = dx < 0 ? -1 : 1;
  const yDirection = dy < 0 ? -1 : 1;
  const maxX = (xDirection > 0 ? 1 - start.x : start.x) * page.w;
  const maxY = (yDirection > 0 ? 1 - start.y : start.y) * page.h;
  const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxX, maxY);
  return {
    x: start.x + (xDirection * size) / page.w,
    y: start.y + (yDirection * size) / page.h,
  };
}

function constrainedDrawPoint(
  tool: MarkupTool,
  start: MarkupPoint,
  point: MarkupPoint,
  page: PageBase,
): MarkupPoint {
  if (
    tool === 'line' ||
    tool === 'arrow' ||
    tool === 'dimension' ||
    tool === 'radius' ||
    tool === 'diameter' ||
    tool === 'calibrate'
  ) {
    return orthogonalPoint(start, point, page);
  }
  if (
    tool === 'text' ||
    tool === 'rectangle' ||
    tool === 'ellipse' ||
    tool === 'cloud' ||
    tool === 'cloud-plus' ||
    tool === 'area'
  ) {
    return squarePoint(start, point, page);
  }
  return point;
}

function compositePoints(
  type: 'callout' | 'cloud-plus',
  start: MarkupPoint,
  end: MarkupPoint,
  page: PageBase,
  shiftLeader = false,
): MarkupPoint[] {
  if (type === 'callout') {
    const width = Math.min(0.28, 180 / page.w);
    const height = Math.min(0.12, 54 / page.h);
    const cx = clamp(end.x, width / 2, 1 - width / 2);
    const cy = clamp(end.y, height / 2, 1 - height / 2);
    const elbow = shiftLeader
      ? Math.abs((start.x - cx) * page.w) >= Math.abs((start.y - cy) * page.h)
        ? { x: (start.x + cx) / 2, y: cy }
        : { x: cx, y: (start.y + cy) / 2 }
      : { x: start.x, y: cy };
    return [
      start,
      { x: cx - width / 2, y: cy - height / 2 },
      { x: cx + width / 2, y: cy + height / 2 },
      elbow,
    ];
  }
  const direction = end.x >= start.x ? 1 : -1;
  const label = {
    x: clamp(end.x + direction * Math.min(0.1, 80 / page.w), 0.02, 0.98),
    y: clamp(Math.min(start.y, end.y) - Math.min(0.08, 48 / page.h), 0.03, 0.97),
  };
  const arrowTip = {
    x: end.x,
    y: end.y,
  };
  const elbow = shiftLeader
    ? Math.abs((arrowTip.x - label.x) * page.w) >= Math.abs((arrowTip.y - label.y) * page.h)
      ? { x: (arrowTip.x + label.x) / 2, y: label.y }
      : { x: label.x, y: (arrowTip.y + label.y) / 2 }
    : { x: arrowTip.x, y: label.y };
  return [start, end, label, elbow, arrowTip];
}

const TOOL_HINTS: Partial<Record<MarkupTool, string>> = {
  text: 'Drag a text box, then type directly inside it',
  pen: 'Drag to draw a freehand line',
  highlight: 'Drag across the area to highlight',
  line: 'Drag from the start point to the end point · hold Shift for horizontal / vertical',
  arrow: 'Drag from the tail to the arrow head · hold Shift for horizontal / vertical',
  rectangle: 'Drag to draw a rectangle',
  ellipse: 'Drag to draw an ellipse',
  cloud: 'Drag around the revision area',
  callout: 'Drag from the arrow tip to place a callout box; adjust the elbow after placing',
  'cloud-plus': 'Drag around the revision area; the leader and label are added automatically',
  calibrate: 'Drag across a known distance on the sheet',
  dimension: 'Drag between the two points to measure',
  area: 'Drag a rectangle, or click polygon vertices; click the first point/double-click to finish',
  radius: 'Drag from the circle center to its edge',
  diameter: 'Drag across the circle from one edge to the other',
  arc: 'Click three points: start, through-point, and end',
};

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

function nearestSnapPoint(
  point: MarkupPoint,
  candidates: MarkupPoint[],
  page: PageBase,
  viewScale: number,
  thresholdPixels = 12,
): MarkupPoint | null {
  let nearest: MarkupPoint | null = null;
  let nearestDistance = thresholdPixels;
  for (const candidate of candidates) {
    const distance = Math.hypot(
      (candidate.x - point.x) * page.w * viewScale,
      (candidate.y - point.y) * page.h * viewScale,
    );
    if (distance <= nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest ? { ...nearest } : null;
}

export function Viewer({ doc }: { doc: PDFDocumentProxy }) {
  const currentPage = useProject((s) => s.currentPage);
  const currentCalibration = useProject((s) => s.calibrations[s.currentPage]);
  const addPinMode = useProject((s) => s.addPinMode);
  const markupTool = useProject((s) => s.markupTool);
  const addTask = useProject((s) => s.addTask);
  const moveTask = useProject((s) => s.moveTask);
  const addMarkup = useProject((s) => s.addMarkup);
  const setMarkupTool = useProject((s) => s.setMarkupTool);
  const setCalibration = useProject((s) => s.setCalibration);
  const selectTask = useProject((s) => s.selectTask);
  const focusRequest = useProject((s) => s.focusRequest);
  const markups = useProject((s) => s.markups);
  const snappingEnabled = useProject((s) => s.snappingEnabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shiftPressedRef = useRef(false);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
    button: number;
  } | null>(null);
  const drawRef = useRef<{
    tool: Exclude<MarkupTool, 'select'>;
    start: MarkupPoint;
    end: MarkupPoint;
    points: MarkupPoint[];
    committedPoints?: MarkupPoint[];
  } | null>(null);

  const [pageBase, setPageBase] = useState<PageBase | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [view, setView] = useState<View>({ scale: 1, offset: { x: 0, y: 0 } });
  const [panning, setPanning] = useState(false);
  const [smoothView, setSmoothView] = useState(false);
  const [touchPinDrag, setTouchPinDrag] = useState<TouchPinDrag | null>(null);
  const cancelPinRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Markup | null>(null);
  const [planSnapPoints, setPlanSnapPoints] = useState<MarkupPoint[]>([]);
  const [snapIndicator, setSnapIndicator] = useState<MarkupPoint | null>(null);
  const [pendingCalibration, setPendingCalibration] = useState<{
    points: MarkupPoint[];
    referencePoints: number;
  } | null>(null);
  const renderScale = useDebounced(view.scale, 120);
  const markupSnapPoints = useMemo(
    () =>
      Object.values(markups)
        .filter((markup) => markup.page === currentPage)
        .flatMap((markup) => markup.points),
    [markups, currentPage],
  );
  const snapCandidates = useMemo(
    () => [...planSnapPoints, ...markupSnapPoints],
    [planSnapPoints, markupSnapPoints],
  );

  const isOverCancelZone = useCallback((clientX: number, clientY: number) => {
    const rect = cancelPinRef.current?.getBoundingClientRect();
    return (
      !!rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  const onTouchDragStart = useCallback((taskId: string, originX: number, originY: number) => {
    setTouchPinDrag({ taskId, originX, originY, overCancelZone: false });
  }, []);

  const onTouchDragMove = useCallback(
    (taskId: string, clientX: number, clientY: number) => {
      setTouchPinDrag((drag) => {
        if (!drag || drag.taskId !== taskId) return drag;
        const overCancelZone = isOverCancelZone(clientX, clientY);
        return drag.overCancelZone === overCancelZone ? drag : { ...drag, overCancelZone };
      });
    },
    [isOverCancelZone],
  );

  const onTouchDragEnd = useCallback((taskId: string) => {
    setTouchPinDrag((drag) => (drag?.taskId === taskId ? null : drag));
  }, []);

  const cancelTouchDrag = useCallback(() => {
    if (!touchPinDrag) return;
    moveTask(touchPinDrag.taskId, touchPinDrag.originX, touchPinDrag.originY);
    setTouchPinDrag(null);
  }, [moveTask, touchPinDrag]);

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

  useEffect(
    () => () => {
      if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!snappingEnabled) setSnapIndicator(null);
  }, [snappingEnabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftPressedRef.current = true;
      if (event.key === 'Escape' && drawRef.current) {
        drawRef.current = null;
        setDraft(null);
        setSnapIndicator(null);
        setMarkupTool('select');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftPressedRef.current = false;
    };
    const onBlur = () => {
      shiftPressedRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [setMarkupTool]);

  const fit = useCallback(
    (pb: PageBase) => {
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
    },
    [animateView],
  );

  // Load page dimensions and fit on page change.
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setPageBase(null);
    void (async () => {
      const nextPage = await doc.getPage(currentPage);
      if (cancelled) return;
      const vp = nextPage.getViewport({ scale: 1 });
      const pb = { w: vp.width, h: vp.height };
      setPage(nextPage);
      setPageBase(pb);
      fit(pb);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage, fit]);

  // Keep the whole sheet visible when the workspace changes shape (mobile
  // rotation, browser resize, sidebar/drawer transitions). Without this the
  // previous desktop offset can leave the plan entirely outside the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pageBase) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fit(pageBase));
    });
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fit, pageBase]);

  // Extract vector endpoints, midpoints, and intersections once per page.
  // Raster-only sheets fall back to nearby ink pixels during pointer movement.
  useEffect(() => {
    let cancelled = false;
    setPlanSnapPoints([]);
    if (!page) return;
    void (async () => {
      try {
        const points = await extractPdfSnapPoints(page);
        if (!cancelled) setPlanSnapPoints(points);
      } catch {
        if (!cancelled) setPlanSnapPoints([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // Rasterize the page whenever the (debounced) scale settles.
  useEffect(() => {
    if (!pageBase || !page) return;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const baseViewport = page.getViewport({ scale: 1 });
      const rasterScale = cappedRasterScale(
        baseViewport.width,
        baseViewport.height,
        renderScale * dpr,
      );
      const vp = page.getViewport({ scale: rasterScale });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      renderTask = page.render({ canvas, viewport: vp });
      try {
        await renderTask.promise;
      } catch {
        // render cancelled by a newer one — expected during zoom
      }
    })();
    return () => renderTask?.cancel();
  }, [page, renderScale, pageBase]);

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

  const normalizedPoint = (clientX: number, clientY: number): MarkupPoint | null => {
    const world = worldRef.current;
    if (!world) return null;
    const rect = world.getBoundingClientRect();
    const point = { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
    return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null;
  };

  const rasterSnapPoint = (point: MarkupPoint): MarkupPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || !pageBase || canvas.width === 0 || canvas.height === 0) return null;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const radiusX = Math.max(
      2,
      Math.ceil((12 / Math.max(0.1, pageBase.w * view.scale)) * canvas.width),
    );
    const radiusY = Math.max(
      2,
      Math.ceil((12 / Math.max(0.1, pageBase.h * view.scale)) * canvas.height),
    );
    const centerX = Math.round(point.x * canvas.width);
    const centerY = Math.round(point.y * canvas.height);
    const left = Math.max(0, centerX - radiusX);
    const top = Math.max(0, centerY - radiusY);
    const right = Math.min(canvas.width - 1, centerX + radiusX);
    const bottom = Math.min(canvas.height - 1, centerY + radiusY);
    if (right <= left || bottom <= top) return null;
    try {
      const image = context.getImageData(left, top, right - left + 1, bottom - top + 1);
      let best: { x: number; y: number; score: number } | null = null;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const offset = (y * image.width + x) * 4;
          if (image.data[offset + 3] < 100) continue;
          const luminance =
            image.data[offset] * 0.2126 +
            image.data[offset + 1] * 0.7152 +
            image.data[offset + 2] * 0.0722;
          if (luminance > 175) continue;
          const px = left + x;
          const py = top + y;
          const distance = Math.hypot((px - centerX) / radiusX, (py - centerY) / radiusY);
          const score = distance + luminance / 900;
          if (!best || score < best.score) best = { x: px, y: py, score };
        }
      }
      return best ? { x: best.x / canvas.width, y: best.y / canvas.height } : null;
    } catch {
      return null;
    }
  };

  const resolveSnapPoint = (point: MarkupPoint, allowRasterFallback = true): MarkupPoint => {
    if (!snappingEnabled || !pageBase) {
      setSnapIndicator(null);
      return point;
    }
    const vectorPoint = nearestSnapPoint(point, snapCandidates, pageBase, view.scale);
    const snapped =
      vectorPoint ??
      (allowRasterFallback && planSnapPoints.length === 0 ? rasterSnapPoint(point) : null);
    setSnapIndicator(snapped);
    return snapped ?? point;
  };

  const areaDistance = (a: MarkupPoint, b: MarkupPoint, page: PageBase) =>
    Math.hypot((b.x - a.x) * page.w, (b.y - a.y) * page.h);

  const finishArea = () => {
    const drawing = drawRef.current;
    if (!drawing || drawing.tool !== 'area' || drawing.points.length < 3) return;
    const points = drawing.points.map((point) => ({ ...point }));
    drawRef.current = null;
    setDraft(null);
    setSnapIndicator(null);
    addMarkup(markupDraft('area', currentPage, points));
    setMarkupTool('select');
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button (0) = pan / place-pin / select. Middle button (1) = pan in ANY mode.
    if (e.button !== 0 && e.button !== 1) return;
    stopSmoothView();
    e.currentTarget.setPointerCapture(e.pointerId);
    const middle = e.button === 1;
    if (!middle && markupTool && markupTool !== 'select' && !addPinMode) {
      const rawPoint = normalizedPoint(e.clientX, e.clientY);
      if (!rawPoint) return;
      const snapThisTool = markupTool !== 'pen' && markupTool !== 'highlight';
      const point = snapThisTool ? resolveSnapPoint(rawPoint) : rawPoint;
      if (!snapThisTool) setSnapIndicator(null);
      if (markupTool === 'area' && pageBase) {
        const drawing = drawRef.current;
        if (drawing?.tool === 'area') {
          const last = drawing.points[drawing.points.length - 1];
          const shift = e.shiftKey || shiftPressedRef.current;
          const nextPoint = shift ? orthogonalPoint(last, point, pageBase) : point;
          if (
            drawing.points.length >= 3 &&
            areaDistance(nextPoint, drawing.points[0], pageBase) < 12
          ) {
            finishArea();
            return;
          }
          if (areaDistance(nextPoint, last, pageBase) >= 3) {
            drawing.points = [...drawing.points, nextPoint];
            drawing.end = nextPoint;
          }
          setDraft(markupDraft('area', currentPage, drawing.points));
          return;
        }
        drawRef.current = { tool: 'area', start: point, end: point, points: [point] };
        setDraft(markupDraft('area', currentPage, [point]));
        return;
      }
      if (markupTool === 'arc') {
        const drawing = drawRef.current;
        if (drawing?.tool === 'arc') {
          const committed = drawing.committedPoints ?? drawing.points;
          const next = committed.length < 3 ? [...committed, point] : committed;
          drawing.committedPoints = next;
          drawing.points = next;
          drawing.end = point;
          setDraft(markupDraft('arc', currentPage, next));
          return;
        }
        drawRef.current = {
          tool: 'arc',
          start: point,
          end: point,
          points: [point],
          committedPoints: [point],
        };
        setDraft(markupDraft('arc', currentPage, [point]));
        return;
      }
      const points =
        pageBase && (markupTool === 'callout' || markupTool === 'cloud-plus')
          ? compositePoints(markupTool, point, point, pageBase, false)
          : [point, point];
      drawRef.current = { tool: markupTool, start: point, end: point, points };
      setDraft(markupDraft(markupTool === 'calibrate' ? 'line' : markupTool, currentPage, points));
      return;
    }
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
    const drawing = drawRef.current;
    if (drawing) {
      const rawPoint = normalizedPoint(e.clientX, e.clientY);
      if (!rawPoint) return;
      const snapThisPoint =
        drawing.tool !== 'pen' && drawing.tool !== 'highlight' && drawing.tool !== 'callout';
      const snappedPoint = snapThisPoint ? resolveSnapPoint(rawPoint) : rawPoint;
      if (drawing.tool === 'pen' || drawing.tool === 'highlight') setSnapIndicator(null);
      const shift = e.shiftKey || shiftPressedRef.current;
      const origin =
        drawing.tool === 'area'
          ? (drawing.points[drawing.points.length - 1] ?? drawing.start)
          : drawing.start;
      const point =
        shift && pageBase && drawing.tool === 'area'
          ? orthogonalPoint(origin, snappedPoint, pageBase)
          : shift && pageBase && drawing.tool !== 'callout'
            ? constrainedDrawPoint(drawing.tool, drawing.start, snappedPoint, pageBase)
            : snappedPoint;
      drawing.end = point;
      if (drawing.tool === 'area') {
        const preview =
          pageBase && drawing.points.length > 0 && areaDistance(point, origin, pageBase) >= 3
            ? [...drawing.points, point]
            : drawing.points;
        setDraft(markupDraft('area', currentPage, preview));
      } else if (drawing.tool === 'pen' || drawing.tool === 'highlight') {
        const previous = drawing.points[drawing.points.length - 1];
        if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.0015) {
          drawing.points = [...drawing.points, point];
        }
      } else if (pageBase && (drawing.tool === 'callout' || drawing.tool === 'cloud-plus')) {
        drawing.points = compositePoints(drawing.tool, drawing.start, point, pageBase, shift);
      } else if (drawing.tool === 'arc') {
        const committed = drawing.committedPoints ?? [drawing.start];
        drawing.points = committed.length < 3 ? [...committed, point] : committed;
      } else {
        drawing.points = [drawing.start, point];
      }
      const type = drawing.tool === 'calibrate' ? 'line' : drawing.tool;
      setDraft(markupDraft(type, currentPage, drawing.points));
      return;
    }
    const d = dragRef.current;
    if (!d) {
      const previewSnap = Boolean(
        snappingEnabled &&
        markupTool &&
        markupTool !== 'select' &&
        markupTool !== 'pen' &&
        markupTool !== 'highlight',
      );
      if (previewSnap) {
        const hoverPoint = normalizedPoint(e.clientX, e.clientY);
        if (hoverPoint) resolveSnapPoint(hoverPoint);
        else setSnapIndicator(null);
      } else {
        setSnapIndicator(null);
      }
      return;
    }
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
    const drawing = drawRef.current;
    if (drawing) {
      if (drawing.tool === 'area') {
        if (
          pageBase &&
          drawing.points.length === 1 &&
          areaDistance(drawing.start, drawing.end, pageBase) >= 3
        ) {
          const rectangle = [drawing.start, drawing.end];
          drawRef.current = null;
          setDraft(null);
          addMarkup(markupDraft('area', currentPage, rectangle));
          setSnapIndicator(null);
          setMarkupTool('select');
          return;
        }
        setDraft(markupDraft('area', currentPage, drawing.points));
        return;
      }
      if (drawing.tool === 'arc') {
        const committed = drawing.committedPoints ?? drawing.points;
        if (committed.length < 3) {
          setDraft(markupDraft('arc', currentPage, drawing.points));
          return;
        }
        drawRef.current = null;
        setDraft(null);
        setSnapIndicator(null);
        addMarkup(markupDraft('arc', currentPage, committed));
        setMarkupTool('select');
        return;
      }
      drawRef.current = null;
      setDraft(null);
      setSnapIndicator(null);
      const end = drawing.end;
      const longEnough = Math.hypot(end.x - drawing.start.x, end.y - drawing.start.y) > 0.003;
      if (longEnough) {
        if (drawing.tool === 'calibrate' && pageBase) {
          const referencePoints = Math.hypot(
            (end.x - drawing.start.x) * pageBase.w,
            (end.y - drawing.start.y) * pageBase.h,
          );
          setPendingCalibration({ points: drawing.points, referencePoints });
        } else if (drawing.tool !== 'calibrate') {
          addMarkup(markupDraft(drawing.tool, currentPage, drawing.points));
          setMarkupTool('select');
        }
      }
      return;
    }
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
      selectTask(null);
    }
  };

  return (
    <div
      ref={containerRef}
      data-snapping-enabled={snappingEnabled}
      data-snap-point-count={planSnapPoints.length}
      className={cn(
        'fp-canvas-stage relative h-full w-full overflow-hidden touch-none select-none',
        panning
          ? 'fp-cursor-panning'
          : addPinMode
            ? 'fp-cursor-pin'
            : markupTool && markupTool !== 'select'
              ? 'fp-cursor-markup'
              : 'fp-cursor-pan',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (!drawRef.current && !dragRef.current) setSnapIndicator(null);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        drawRef.current = null;
        setDraft(null);
        setSnapIndicator(null);
        setPanning(false);
      }}
      onDoubleClick={(e) => {
        if (e.button !== 0 || drawRef.current?.tool !== 'area') return;
        e.preventDefault();
        e.stopPropagation();
        finishArea();
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
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full bg-white shadow-e2" />
          <MarkupLayer
            pageBase={pageBase}
            viewScale={view.scale}
            draft={draft}
            snapPoints={planSnapPoints}
            snappingEnabled={snappingEnabled}
            onSnapPointChange={setSnapIndicator}
          />
          {snappingEnabled && snapIndicator && (
            <div
              data-snap-indicator
              aria-hidden="true"
              className="pointer-events-none absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface/70 shadow-[0_0_0_2px_rgba(255,255,255,0.8)]"
              style={{ left: `${snapIndicator.x * 100}%`, top: `${snapIndicator.y * 100}%` }}
            >
              <span className="absolute top-1/2 left-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 bg-accent" />
              <span className="absolute top-1/2 left-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-accent" />
            </div>
          )}
          <PinLayer
            isOverCancelZone={isOverCancelZone}
            onTouchDragStart={onTouchDragStart}
            onTouchDragMove={onTouchDragMove}
            onTouchDragEnd={onTouchDragEnd}
          />
        </div>
      )}

      {touchPinDrag && (
        <button
          ref={cancelPinRef}
          type="button"
          aria-label="Cancel pin movement"
          aria-pressed={touchPinDrag.overCancelZone}
          className={cn(
            'pointer-events-auto absolute top-3 left-1/2 z-50 flex size-11 -translate-x-1/2 items-center justify-center rounded-full border shadow-e3 transition-[background-color,border-color,color,transform] duration-(--fp-dur-fast)',
            touchPinDrag.overCancelZone
              ? 'scale-105 border-danger bg-danger text-white'
              : 'border-line-strong bg-surface text-t2',
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={cancelTouchDrag}
        >
          <CircleX className="size-5" />
        </button>
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

      <div
        className={cn(
          'pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-t1 px-3 py-1.5 text-xs font-medium text-surface shadow-e2',
          'transition-[opacity,transform] duration-(--fp-dur-med) ease-(--fp-ease)',
          markupTool && markupTool !== 'select'
            ? 'opacity-100 translate-y-0'
            : '-translate-y-3 opacity-0',
        )}
      >
        {markupTool ? TOOL_HINTS[markupTool] : ''} · Esc to cancel
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

      <CalibrationDialog
        open={pendingCalibration !== null}
        page={currentPage}
        referencePoints={pendingCalibration?.referencePoints ?? 0}
        current={currentCalibration}
        onCancel={() => {
          setPendingCalibration(null);
          setMarkupTool('select');
        }}
        onSave={(calibration) => {
          const reference = pendingCalibration;
          if (!reference) return;
          setCalibration(currentPage, calibration);
          addMarkup(markupDraft('dimension', currentPage, reference.points));
          setPendingCalibration(null);
          setMarkupTool('select');
        }}
      />
    </div>
  );
}
