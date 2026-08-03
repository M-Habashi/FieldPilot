import { PDFDocument } from 'pdf-lib';
import type { Markup, MarkupLineEnding, MarkupPoint, PageCalibration } from '../types';
import { defaultEndEnding, defaultStartEnding, lineDashArray } from './markup-style';
import { arcGeometry } from './markup-geometry';
import { formatAreaValue, formatLengthBetween, formatLengthValue } from './measurement';

interface PageSize {
  w: number;
  h: number;
}

interface ExportOptions {
  fileName: string | null;
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
}

function pointToPage(point: MarkupPoint, page: PageSize) {
  return { x: point.x * page.w, y: point.y * page.h };
}

function applyLineStyle(ctx: CanvasRenderingContext2D, markup: Markup) {
  ctx.strokeStyle = markup.stroke;
  ctx.lineWidth = markup.strokeWidth;
  ctx.setLineDash(lineDashArray(markup.lineStyle, markup.strokeWidth));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function fillEnabled(fill: string) {
  return fill !== 'transparent' && fill !== 'none' && !fill.endsWith('00');
}

function strokePath(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

function drawLineEnding(
  ctx: CanvasRenderingContext2D,
  style: MarkupLineEnding,
  from: { x: number; y: number },
  tip: { x: number; y: number },
  color: string,
  lineWidth: number,
  size?: number,
) {
  if (style === 'none') return;
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const length = Math.max(2, size ?? lineWidth * 4);
  const halfWidth = length * 0.45;
  const unit = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -unit.y, y: unit.x };
  const back = { x: tip.x - unit.x * length, y: tip.y - unit.y * length };
  const wingA = { x: back.x + normal.x * halfWidth, y: back.y + normal.y * halfWidth };
  const wingB = { x: back.x - normal.x * halfWidth, y: back.y - normal.y * halfWidth };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style === 'open-arrow' || style === 'closed-arrow' || style === 'filled-arrow') {
    ctx.beginPath();
    ctx.moveTo(wingA.x, wingA.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(wingB.x, wingB.y);
    if (style !== 'open-arrow') ctx.closePath();
    if (style === 'filled-arrow') ctx.fill();
    else ctx.stroke();
  } else if (style === 'dot') {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, Math.max(3, lineWidth * 1.5), 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'square') {
    const size = Math.max(6, lineWidth * 3);
    ctx.translate(tip.x, tip.y);
    ctx.rotate(angle);
    ctx.fillRect(-size / 2, -size / 2, size, size);
  } else {
    const capHalf = Math.max(5, lineWidth * 2.5);
    const direction =
      style === 'slash' ? { x: normal.x + unit.x * 0.7, y: normal.y + unit.y * 0.7 } : normal;
    ctx.beginPath();
    ctx.moveTo(tip.x - direction.x * capHalf, tip.y - direction.y * capHalf);
    ctx.lineTo(tip.x + direction.x * capHalf, tip.y + direction.y * capHalf);
    ctx.stroke();
  }
  ctx.restore();
}

function cloudPath(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius?: number,
) {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const bump = Math.max(
    4,
    Math.min(40, radius ?? Math.max(6, Math.min(18, Math.min(width, height) / 5))),
  );
  const edge = (
    length: number,
    horizontal: boolean,
    forward: boolean,
    startX: number,
    startY: number,
  ) => {
    const count = Math.max(2, Math.ceil(length / (bump * 1.5)));
    const step = length / count;
    for (let i = 0; i < count; i += 1) {
      const sign = forward ? 1 : -1;
      if (horizontal) {
        const x = startX + sign * step * (i + 1);
        const cx = startX + sign * step * (i + 0.5);
        const cy = startY + (forward ? -bump * 0.55 : bump * 0.55);
        ctx.quadraticCurveTo(cx, cy, x, startY);
      } else {
        const y = startY + sign * step * (i + 1);
        const cy = startY + sign * step * (i + 0.5);
        const cx = startX + (forward ? bump * 0.55 : -bump * 0.55);
        ctx.quadraticCurveTo(cx, cy, startX, y);
      }
    }
  };
  ctx.beginPath();
  ctx.moveTo(left, top);
  edge(width, true, true, left, top);
  edge(height, false, true, right, top);
  edge(width, true, false, right, bottom);
  edge(height, false, false, left, bottom);
  ctx.closePath();
}

function fillCurrentPath(ctx: CanvasRenderingContext2D, markup: Markup) {
  if (!fillEnabled(markup.fill)) return;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (markup.fillOpacity ?? 1);
  ctx.fillStyle = markup.fill;
  ctx.fill();
  ctx.globalAlpha = alpha;
}

function fillRectWithOpacity(
  ctx: CanvasRenderingContext2D,
  markup: Markup,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!fillEnabled(markup.fill)) return;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (markup.fillOpacity ?? 1);
  ctx.fillStyle = markup.fill;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = alpha;
}

function drawBoxBoundary(
  ctx: CanvasRenderingContext2D,
  markup: Markup,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  const shape = markup.boxShape ?? 'rectangle';
  if (shape === 'none') return;
  applyLineStyle(ctx, markup);
  if (markup.lineStyle === 'cloud') {
    cloudPath(ctx, a, b, markup.cloudRadius);
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
    return;
  }
  if (shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
    return;
  }
  const radius = shape === 'rounded' ? Math.min(12, height / 3) : 0;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, radius);
  fillCurrentPath(ctx, markup);
  if (markup.strokeWidth > 0) ctx.stroke();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of (text || 'Double-click to type').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function formatMeasurement(
  markup: Markup,
  page: PageSize,
  calibration: PageCalibration | undefined,
) {
  return formatLengthBetween(
    markup.points,
    page,
    calibration,
    markup.measurementUnit,
    markup.fractionDenominator,
  );
}

function formatArea(markup: Markup, page: PageSize, calibration: PageCalibration | undefined) {
  if (markup.points.length < 2 || !calibration) return 'Not calibrated';
  const a = markup.points[0];
  const b = markup.points[markup.points.length - 1];
  const points =
    markup.points.length === 2
      ? [
          { x: a.x, y: a.y },
          { x: b.x, y: a.y },
          { x: b.x, y: b.y },
          { x: a.x, y: b.y },
        ]
      : markup.points;
  const areaInPoints =
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * page.w * (next.y * page.h) - next.x * page.w * (point.y * page.h);
      }, 0),
    ) / 2;
  const value = areaInPoints * calibration.unitsPerPoint ** 2;
  return formatAreaValue(value, calibration, markup.measurementUnit);
}

function drawMarkup(
  ctx: CanvasRenderingContext2D,
  markup: Markup,
  page: PageSize,
  calibration: PageCalibration | undefined,
) {
  const points = markup.points.map((point) => pointToPage(point, page));
  if (points.length === 0) return;
  const a = points[0];
  const b = points[points.length - 1] ?? a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  const textColor = markup.textColor ?? markup.stroke;
  const defaultBold =
    markup.type === 'cloud-plus' ||
    markup.type === 'dimension' ||
    markup.type === 'area' ||
    markup.type === 'radius' ||
    markup.type === 'diameter' ||
    markup.type === 'arc';
  const fontWeight = (markup.fontBold ?? defaultBold) ? 700 : 400;
  const fontStyle = markup.fontItalic ? 'italic' : 'normal';
  const familyName = markup.fontFamily ?? 'Helvetica';
  const fontFamily = familyName.includes(' ') ? `"${familyName}"` : familyName;
  const font = `${fontStyle} ${fontWeight} ${markup.fontSize}px ${fontFamily}, Arial, sans-serif`;

  ctx.save();
  ctx.globalAlpha = markup.opacity;
  applyLineStyle(ctx, markup);
  ctx.font = font;

  if (markup.type === 'text') {
    if (points.length >= 2 && (width > 2 || height > 2)) {
      drawBoxBoundary(ctx, markup, a, b);
      const padding = Math.max(4, markup.fontSize * 0.35);
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = markup.textAlign ?? 'left';
      const textX =
        ctx.textAlign === 'center'
          ? left + width / 2
          : ctx.textAlign === 'right'
            ? left + width - padding
            : left + padding;
      const lines = wrapText(ctx, markup.text, Math.max(1, width - padding * 2));
      const maxLines = Math.max(1, Math.floor((height - padding * 2) / (markup.fontSize * 1.25)));
      lines.slice(0, maxLines).forEach((line, index) => {
        ctx.fillText(line, textX, top + padding + markup.fontSize + index * markup.fontSize * 1.25);
      });
    } else {
      ctx.fillStyle = textColor;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = Math.max(1, markup.fontSize / 14);
      ctx.strokeText(markup.text || 'Text', a.x, a.y);
      ctx.fillText(markup.text || 'Text', a.x, a.y);
    }
  } else if (markup.type === 'pen' || markup.type === 'highlight') {
    ctx.lineWidth =
      markup.type === 'highlight' ? Math.max(10, markup.strokeWidth) : markup.strokeWidth;
    if (markup.type === 'highlight') ctx.globalAlpha = Math.min(markup.opacity, 0.45);
    strokePath(ctx, points);
  } else if (markup.type === 'line' || markup.type === 'arrow') {
    strokePath(ctx, [a, b]);
    drawLineEnding(ctx, defaultStartEnding(markup), b, a, markup.stroke, markup.strokeWidth);
    drawLineEnding(ctx, defaultEndEnding(markup), a, b, markup.stroke, markup.strokeWidth);
  } else if (markup.type === 'rectangle') {
    fillRectWithOpacity(ctx, markup, left, top, width, height);
    if (markup.strokeWidth > 0) ctx.strokeRect(left, top, width, height);
  } else if (markup.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
  } else if (markup.type === 'cloud') {
    cloudPath(ctx, a, b, markup.cloudRadius);
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
  } else if (markup.type === 'area' && points.length >= 2) {
    const polygon = points.length === 2 ? [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] : points;
    const label = markup.text || formatArea(markup, page, calibration);
    const center = polygon.reduce(
      (sum, point) => ({
        x: sum.x + point.x / polygon.length,
        y: sum.y + point.y / polygon.length,
      }),
      { x: 0, y: 0 },
    );
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (const point of polygon.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, center.y);
  } else if (markup.type === 'callout' && points.length >= 3) {
    const tip = points[0];
    const boxA = points[1];
    const boxB = points[2];
    const boxLeft = Math.min(boxA.x, boxB.x);
    const boxTop = Math.min(boxA.y, boxB.y);
    const boxWidth = Math.max(24, Math.abs(boxB.x - boxA.x));
    const boxHeight = Math.max(20, Math.abs(boxB.y - boxA.y));
    const center = { x: boxLeft + boxWidth / 2, y: boxTop + boxHeight / 2 };
    const elbow = points[3] ?? { x: tip.x, y: center.y };
    const dx = elbow.x - center.x;
    const dy = elbow.y - center.y;
    const edgeScale = Math.min(
      1,
      1 /
        Math.max(
          Math.abs(dx) / Math.max(1, boxWidth / 2),
          Math.abs(dy) / Math.max(1, boxHeight / 2),
        ),
    );
    const attach = { x: center.x + dx * edgeScale, y: center.y + dy * edgeScale };
    const leaderStroke = markup.leaderStroke ?? markup.stroke;
    const leaderWidth = markup.leaderStrokeWidth ?? markup.strokeWidth;
    ctx.save();
    ctx.globalAlpha = markup.opacity * (markup.leaderOpacity ?? 1);
    ctx.strokeStyle = leaderStroke;
    ctx.lineWidth = leaderWidth;
    ctx.setLineDash(lineDashArray(markup.leaderLineStyle, leaderWidth));
    strokePath(ctx, [attach, elbow, tip]);
    drawLineEnding(
      ctx,
      markup.leaderEnding ?? 'filled-arrow',
      elbow,
      tip,
      leaderStroke,
      leaderWidth,
    );
    ctx.restore();
    drawBoxBoundary(ctx, markup, boxA, boxB);
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = markup.textAlign ?? 'center';
    ctx.textBaseline = 'middle';
    const padding = Math.max(4, markup.fontSize * 0.35);
    const textX =
      ctx.textAlign === 'left'
        ? boxLeft + padding
        : ctx.textAlign === 'right'
          ? boxLeft + boxWidth - padding
          : center.x;
    ctx.fillText(markup.text || 'Callout', textX, center.y);
  } else if (markup.type === 'cloud-plus' && points.length >= 3) {
    const cloudA = points[0];
    const cloudB = points[1];
    const label = points[2];
    const center = { x: (cloudA.x + cloudB.x) / 2, y: (cloudA.y + cloudB.y) / 2 };
    const target = {
      x: label.x < center.x ? Math.min(cloudA.x, cloudB.x) : Math.max(cloudA.x, cloudB.x),
      y: label.y < center.y ? Math.min(cloudA.y, cloudB.y) : Math.max(cloudA.y, cloudB.y),
    };
    const elbow = points[3] ?? { x: target.x, y: label.y };
    const arrowTip = points[4] ?? target;
    cloudPath(ctx, cloudA, cloudB, markup.cloudRadius);
    fillCurrentPath(ctx, markup);
    if (markup.strokeWidth > 0) ctx.stroke();
    const leaderStroke = markup.leaderStroke ?? markup.stroke;
    const leaderWidth = markup.leaderStrokeWidth ?? markup.strokeWidth;
    ctx.save();
    ctx.globalAlpha = markup.opacity * (markup.leaderOpacity ?? 1);
    ctx.strokeStyle = leaderStroke;
    ctx.lineWidth = leaderWidth;
    ctx.setLineDash(lineDashArray(markup.leaderLineStyle, leaderWidth));
    strokePath(ctx, [label, elbow, arrowTip]);
    drawLineEnding(
      ctx,
      markup.leaderEnding ?? 'filled-arrow',
      elbow,
      arrowTip,
      leaderStroke,
      leaderWidth,
    );
    ctx.restore();
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = label.x < center.x ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(markup.text || 'Cloud+', label.x, label.y - 5);
  } else if (markup.type === 'dimension' && points.length >= 2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / length, y: dx / length };
    const labelNormal = normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;
    const offset = Math.max(0, markup.extensionOffset ?? 18);
    const extension = Math.max(0, markup.extensionLength ?? 18);
    const dimensionA = { x: a.x + labelNormal.x * offset, y: a.y + labelNormal.y * offset };
    const dimensionB = { x: b.x + labelNormal.x * offset, y: b.y + labelNormal.y * offset };
    const midpoint = { x: (dimensionA.x + dimensionB.x) / 2, y: (dimensionA.y + dimensionB.y) / 2 };
    const label = markup.text || formatMeasurement(markup, page, calibration);
    ctx.lineWidth = Math.max(1, markup.strokeWidth);
    if (markup.witnessLines ?? true) {
      strokePath(ctx, [
        { x: a.x - labelNormal.x * 4, y: a.y - labelNormal.y * 4 },
        {
          x: dimensionA.x + labelNormal.x * extension,
          y: dimensionA.y + labelNormal.y * extension,
        },
      ]);
      strokePath(ctx, [
        { x: b.x - labelNormal.x * 4, y: b.y - labelNormal.y * 4 },
        {
          x: dimensionB.x + labelNormal.x * extension,
          y: dimensionB.y + labelNormal.y * extension,
        },
      ]);
    }
    strokePath(ctx, [dimensionA, dimensionB]);
    drawLineEnding(
      ctx,
      defaultStartEnding(markup),
      dimensionB,
      dimensionA,
      markup.stroke,
      ctx.lineWidth,
      markup.arrowSize,
    );
    drawLineEnding(
      ctx,
      defaultEndEnding(markup),
      dimensionA,
      dimensionB,
      markup.stroke,
      ctx.lineWidth,
      markup.arrowSize,
    );
    ctx.font = font;
    const labelWidth = Math.max(38, ctx.measureText(label).width + 8);
    ctx.fillStyle = 'white';
    ctx.fillRect(
      midpoint.x - labelWidth / 2,
      midpoint.y - markup.fontSize * 0.7,
      labelWidth,
      markup.fontSize * 1.4,
    );
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midpoint.x, midpoint.y);
  } else if ((markup.type === 'radius' || markup.type === 'diameter') && points.length >= 2) {
    const center = markup.type === 'radius' ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const radius =
      markup.type === 'radius'
        ? Math.hypot(b.x - a.x, b.y - a.y)
        : Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const edge = markup.type === 'radius' ? b : a;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    strokePath(ctx, [center, edge]);
    if (markup.type === 'diameter') {
      drawLineEnding(
        ctx,
        defaultStartEnding(markup),
        b,
        a,
        markup.stroke,
        markup.strokeWidth,
        markup.arrowSize,
      );
      drawLineEnding(
        ctx,
        defaultEndEnding(markup),
        a,
        b,
        markup.stroke,
        markup.strokeWidth,
        markup.arrowSize,
      );
    }
    const label =
      markup.text ||
      (calibration
        ? `${markup.type === 'radius' ? 'R' : 'Ø'} ${formatLengthValue(radius * calibration.unitsPerPoint, calibration, markup.measurementUnit, markup.fractionDenominator)}`
        : 'Not calibrated');
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, edge.x + 8, edge.y - 7);
  } else if (markup.type === 'arc' && points.length >= 3) {
    const geometry = arcGeometry(points);
    if (geometry) {
      ctx.beginPath();
      ctx.arc(
        geometry.center.x,
        geometry.center.y,
        geometry.radius,
        geometry.startAngle,
        geometry.endAngle,
        geometry.sweepFlag === 0,
      );
      ctx.stroke();
      const label =
        markup.text ||
        (calibration
          ? `Arc ${formatLengthValue(geometry.radius * geometry.sweep * calibration.unitsPerPoint, calibration, markup.measurementUnit, markup.fractionDenominator)}`
          : 'Not calibrated');
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, geometry.midpoint.x, geometry.midpoint.y);
    }
  }
  ctx.restore();
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render PDF markups.'))),
      'image/png',
    );
  });
}

function rotateOverlay(
  displayCanvas: HTMLCanvasElement,
  page: PageSize,
  scale: number,
  angle: number,
) {
  if (angle === 0) return displayCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(page.w * scale));
  canvas.height = Math.max(1, Math.round(page.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  if (angle === 90) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  } else if (angle === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (angle === 270) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(displayCanvas, 0, 0);
  return canvas;
}

export async function createAnnotatedPdf(sourcePdf: Uint8Array, options: ExportOptions) {
  const pdf = await PDFDocument.load(sourcePdf);
  const pages = pdf.getPages();
  const allMarkups = Object.values(options.markups);

  for (let index = 0; index < pages.length; index += 1) {
    const pageNumber = index + 1;
    const pageMarkups = allMarkups.filter((markup) => markup.page === pageNumber);
    if (pageMarkups.length === 0) continue;
    const pdfPage = pages[index];
    const size = pdfPage.getSize();
    const angle = ((pdfPage.getRotation().angle % 360) + 360) % 360;
    const displayPage =
      angle === 90 || angle === 270
        ? { w: size.height, h: size.width }
        : { w: size.width, h: size.height };
    const scale = Math.max(1, Math.min(2, 4096 / Math.max(displayPage.w, displayPage.h)));
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = Math.max(1, Math.round(displayPage.w * scale));
    displayCanvas.height = Math.max(1, Math.round(displayPage.h * scale));
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.scale(scale, scale);
    for (const markup of pageMarkups)
      drawMarkup(ctx, markup, displayPage, options.calibrations[pageNumber]);
    const overlayCanvas = rotateOverlay(
      displayCanvas,
      { w: size.width, h: size.height },
      scale,
      angle,
    );
    const pngBytes = new Uint8Array(await (await canvasBlob(overlayCanvas)).arrayBuffer());
    const overlay = await pdf.embedPng(pngBytes);
    pdfPage.drawImage(overlay, { x: 0, y: 0, width: size.width, height: size.height });
  }
  return pdf.save();
}

export async function downloadAnnotatedPdf(sourcePdf: Uint8Array, options: ExportOptions) {
  const bytes = await createAnnotatedPdf(sourcePdf, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  const base = (options.fileName ?? 'plan').replace(/\.pdf$/i, '');
  anchor.href = url;
  anchor.download = `${base}-marked-up.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
