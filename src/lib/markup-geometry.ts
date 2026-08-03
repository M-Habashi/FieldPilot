export interface Point2D {
  x: number;
  y: number;
}

export interface ArcGeometry {
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweep: number;
  sweepFlag: 0 | 1;
  largeArcFlag: 0 | 1;
  midpoint: Point2D;
}

const TAU = Math.PI * 2;

function positiveAngle(angle: number) {
  return ((angle % TAU) + TAU) % TAU;
}

function directedAngle(start: number, end: number, ccw: boolean) {
  return ccw ? positiveAngle(end - start) : positiveAngle(start - end);
}

/** Circumcircle and directed arc through three points (start, through, end). */
export function arcGeometry(points: Point2D[]): ArcGeometry | null {
  if (points.length < 3) return null;
  const [a, through, c] = points;
  const denominator =
    2 * (a.x * (through.y - c.y) + through.x * (c.y - a.y) + c.x * (a.y - through.y));
  if (Math.abs(denominator) < 1e-6) return null;
  const aa = a.x * a.x + a.y * a.y;
  const bb = through.x * through.x + through.y * through.y;
  const cc = c.x * c.x + c.y * c.y;
  const center = {
    x: (aa * (through.y - c.y) + bb * (c.y - a.y) + cc * (a.y - through.y)) / denominator,
    y: (aa * (c.x - through.x) + bb * (a.x - c.x) + cc * (through.x - a.x)) / denominator,
  };
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  if (!Number.isFinite(radius) || radius < 1e-6) return null;
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const throughAngle = Math.atan2(through.y - center.y, through.x - center.x);
  const endAngle = Math.atan2(c.y - center.y, c.x - center.x);
  const ccw =
    (a.x - center.x) * (through.y - center.y) - (a.y - center.y) * (through.x - center.x) > 0;
  let sweep = directedAngle(startAngle, endAngle, ccw);
  const throughSweep = directedAngle(startAngle, throughAngle, ccw);
  if (throughSweep > sweep + 1e-6) {
    sweep = TAU - sweep;
  }
  const midpointAngle = ccw ? startAngle + sweep / 2 : startAngle - sweep / 2;
  return {
    center,
    radius,
    startAngle,
    endAngle,
    sweep,
    sweepFlag: ccw ? 1 : 0,
    largeArcFlag: sweep > Math.PI ? 1 : 0,
    midpoint: {
      x: center.x + radius * Math.cos(midpointAngle),
      y: center.y + radius * Math.sin(midpointAngle),
    },
  };
}

export function arcPath(geometry: ArcGeometry, start: Point2D, end: Point2D) {
  return `M ${start.x} ${start.y} A ${geometry.radius} ${geometry.radius} 0 ${geometry.largeArcFlag} ${geometry.sweepFlag} ${end.x} ${end.y}`;
}
