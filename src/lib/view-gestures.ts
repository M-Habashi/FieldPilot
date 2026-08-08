import { clamp } from './utils';

export interface ViewTransform {
  scale: number;
  offset: { x: number; y: number };
}

export interface GesturePoint {
  x: number;
  y: number;
}

export interface PinchGeometry {
  distance: number;
  midpoint: GesturePoint;
}

export function pinchGeometry(points: Iterable<GesturePoint>): PinchGeometry | null {
  const [first, second] = Array.from(points);
  if (!first || !second) return null;
  return {
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
  };
}

export function zoomAt<T extends ViewTransform>(
  view: T,
  centerX: number,
  centerY: number,
  factor: number,
): T {
  const scale = clamp(view.scale * factor, 0.1, 8);
  const scaleChange = scale / view.scale;
  return {
    ...view,
    scale,
    offset: {
      x: centerX - (centerX - view.offset.x) * scaleChange,
      y: centerY - (centerY - view.offset.y) * scaleChange,
    },
  };
}

export function pinchView<T extends ViewTransform>(
  startingView: T,
  startingGeometry: PinchGeometry,
  currentGeometry: PinchGeometry,
): T {
  const zoomed = zoomAt(
    startingView,
    startingGeometry.midpoint.x,
    startingGeometry.midpoint.y,
    currentGeometry.distance / startingGeometry.distance,
  );
  return {
    ...zoomed,
    offset: {
      x: zoomed.offset.x + currentGeometry.midpoint.x - startingGeometry.midpoint.x,
      y: zoomed.offset.y + currentGeometry.midpoint.y - startingGeometry.midpoint.y,
    },
  };
}
