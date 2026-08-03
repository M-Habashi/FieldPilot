import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { MarkupPoint } from '../types';

type Matrix = [number, number, number, number, number, number];
type PagePoint = { x: number; y: number };
type Segment = { a: PagePoint; b: PagePoint };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MAX_SEGMENTS = 14_000;
const MAX_INTERSECTIONS = 8_000;
// pdf.js encodes compact path commands with these stable DrawOPS values but
// does not export the DrawOPS enum from its public browser entry point.
const DrawOPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(point: PagePoint, matrix: Matrix): PagePoint {
  return {
    x: point.x * matrix[0] + point.y * matrix[2] + matrix[4],
    y: point.x * matrix[1] + point.y * matrix[3] + matrix[5],
  };
}

function lineIntersection(first: Segment, second: Segment): PagePoint | null {
  const r = { x: first.b.x - first.a.x, y: first.b.y - first.a.y };
  const s = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-7) return null;
  const offset = { x: second.a.x - first.a.x, y: second.a.y - first.a.y };
  const t = (offset.x * s.y - offset.y * s.x) / denominator;
  const u = (offset.x * r.y - offset.y * r.x) / denominator;
  if (t < -1e-5 || t > 1.00001 || u < -1e-5 || u > 1.00001) return null;
  return { x: first.a.x + t * r.x, y: first.a.y + t * r.y };
}

function segmentIntersections(segments: Segment[], width: number, height: number): PagePoint[] {
  const cellSize = Math.max(24, Math.min(width, height) / 18);
  const grid = new Map<string, number[]>();
  const intersections: PagePoint[] = [];
  const tested = new Set<string>();

  for (let index = 0; index < segments.length && intersections.length < MAX_INTERSECTIONS; index += 1) {
    const segment = segments[index];
    const minX = Math.max(0, Math.floor(Math.min(segment.a.x, segment.b.x) / cellSize));
    const maxX = Math.min(80, Math.floor(Math.max(segment.a.x, segment.b.x) / cellSize));
    const minY = Math.max(0, Math.floor(Math.min(segment.a.y, segment.b.y) / cellSize));
    const maxY = Math.min(80, Math.floor(Math.max(segment.a.y, segment.b.y) / cellSize));
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const occupants = grid.get(key) ?? [];
        for (const otherIndex of occupants) {
          const pairKey = `${otherIndex}:${index}`;
          if (tested.has(pairKey)) continue;
          tested.add(pairKey);
          const point = lineIntersection(segments[otherIndex], segment);
          if (point && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) {
            intersections.push(point);
            if (intersections.length >= MAX_INTERSECTIONS) break;
          }
        }
        occupants.push(index);
        grid.set(key, occupants);
      }
    }
  }
  return intersections;
}

function deduplicate(points: PagePoint[], width: number, height: number): MarkupPoint[] {
  const seen = new Set<string>();
  const result: MarkupPoint[] = [];
  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
    const key = `${Math.round(point.x * 2)}:${Math.round(point.y * 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x: point.x / width, y: point.y / height });
  }
  return result;
}

/** Extracts vector endpoints, midpoints, and line intersections from a PDF page. */
export async function extractPdfSnapPoints(page: PDFPageProxy): Promise<MarkupPoint[]> {
  const viewport = page.getViewport({ scale: 1 });
  const viewportMatrix = viewport.transform as Matrix;
  const operatorList = await page.getOperatorList();
  const stack: Matrix[] = [];
  let currentMatrix: Matrix = [...IDENTITY];
  const points: PagePoint[] = [];
  const segments: Segment[] = [];

  const addSegment = (a: PagePoint, b: PagePoint) => {
    if (segments.length >= MAX_SEGMENTS || Math.hypot(b.x - a.x, b.y - a.y) < 0.25) return;
    segments.push({ a, b });
    points.push(a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  };

  for (let opIndex = 0; opIndex < operatorList.fnArray.length; opIndex += 1) {
    const fn = operatorList.fnArray[opIndex];
    const args = operatorList.argsArray[opIndex] as unknown[];
    if (fn === OPS.save) {
      stack.push([...currentMatrix]);
      continue;
    }
    if (fn === OPS.restore) {
      currentMatrix = stack.pop() ?? [...IDENTITY];
      continue;
    }
    if (fn === OPS.transform) {
      currentMatrix = multiply(currentMatrix, args as Matrix);
      continue;
    }
    if (fn !== OPS.constructPath || segments.length >= MAX_SEGMENTS) continue;

    const dataWrapper = args[1] as Array<Float32Array | null> | undefined;
    const data = dataWrapper?.[0];
    if (!data) continue;
    const matrix = multiply(viewportMatrix, currentMatrix);
    let cursor = 0;
    let current: PagePoint | null = null;
    let subpathStart: PagePoint | null = null;
    while (cursor < data.length && segments.length < MAX_SEGMENTS) {
      const drawOp = data[cursor++];
      if (drawOp === DrawOPS.moveTo) {
        current = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        subpathStart = current;
        points.push(current);
      } else if (drawOp === DrawOPS.lineTo) {
        const next = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        if (current) addSegment(current, next);
        current = next;
      } else if (drawOp === DrawOPS.curveTo) {
        const controlA = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        const controlB = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        const end = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        if (current) {
          let previous = current;
          for (let step = 1; step <= 6; step += 1) {
            const t = step / 6;
            const mt = 1 - t;
            const next = {
              x: mt ** 3 * current.x + 3 * mt ** 2 * t * controlA.x + 3 * mt * t ** 2 * controlB.x + t ** 3 * end.x,
              y: mt ** 3 * current.y + 3 * mt ** 2 * t * controlA.y + 3 * mt * t ** 2 * controlB.y + t ** 3 * end.y,
            };
            addSegment(previous, next);
            previous = next;
          }
        }
        current = end;
      } else if (drawOp === DrawOPS.quadraticCurveTo) {
        const control = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        const end = transformPoint({ x: data[cursor++], y: data[cursor++] }, matrix);
        if (current) {
          let previous = current;
          for (let step = 1; step <= 5; step += 1) {
            const t = step / 5;
            const mt = 1 - t;
            const next = {
              x: mt ** 2 * current.x + 2 * mt * t * control.x + t ** 2 * end.x,
              y: mt ** 2 * current.y + 2 * mt * t * control.y + t ** 2 * end.y,
            };
            addSegment(previous, next);
            previous = next;
          }
        }
        current = end;
      } else if (drawOp === DrawOPS.closePath) {
        if (current && subpathStart) addSegment(current, subpathStart);
        current = subpathStart;
      } else {
        break;
      }
    }
  }

  points.push(...segmentIntersections(segments, viewport.width, viewport.height));
  return deduplicate(points, viewport.width, viewport.height);
}
