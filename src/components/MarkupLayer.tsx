import { useEffect, useRef, useState } from 'react';
import type { Markup, MarkupLineEnding, MarkupPoint, PageCalibration } from '../types';
import { clamp } from '../lib/utils';
import { defaultEndEnding, defaultStartEnding, svgDashArray } from '../lib/markup-style';
import { arcGeometry, arcPath } from '../lib/markup-geometry';
import { formatAreaValue, formatLengthBetween, formatLengthValue } from '../lib/measurement';
import { useProject } from '../store/project';

interface PageBase {
  w: number;
  h: number;
}

interface MarkupLayerProps {
  pageBase: PageBase;
  viewScale: number;
  draft: Markup | null;
  snapPoints: MarkupPoint[];
  snappingEnabled: boolean;
  onSnapPointChange(point: MarkupPoint | null): void;
}

function pointToPage(point: MarkupPoint, page: PageBase) {
  return { x: point.x * page.w, y: point.y * page.h };
}

function nearestSnapPoint(
  point: MarkupPoint,
  candidates: MarkupPoint[],
  page: PageBase,
  viewScale: number,
): MarkupPoint | null {
  let result: MarkupPoint | null = null;
  let bestDistance = 12;
  for (const candidate of candidates) {
    const distance = Math.hypot(
      (candidate.x - point.x) * page.w * viewScale,
      (candidate.y - point.y) * page.h * viewScale,
    );
    if (distance <= bestDistance) {
      result = candidate;
      bestDistance = distance;
    }
  }
  return result ? { ...result } : null;
}

function formatMeasurement(
  points: MarkupPoint[],
  page: PageBase,
  calibration: PageCalibration | undefined,
  displayUnit: NonNullable<Markup['measurementUnit']> = 'calibrated',
  fractionDenominator: NonNullable<Markup['fractionDenominator']> = 16,
) {
  return formatLengthBetween(points, page, calibration, displayUnit, fractionDenominator);
}

function formatArea(
  points: MarkupPoint[],
  page: PageBase,
  calibration: PageCalibration | undefined,
) {
  if (points.length < 2 || !calibration) return 'Not calibrated';
  const a = points[0];
  const b = points[points.length - 1];
  const squarePoints =
    points.length === 2
      ? [
          { x: a.x, y: a.y },
          { x: b.x, y: a.y },
          { x: b.x, y: b.y },
          { x: a.x, y: b.y },
        ]
      : points;
  const areaInPoints =
    Math.abs(
      squarePoints.reduce((sum, point, index) => {
        const next = squarePoints[(index + 1) % squarePoints.length];
        return sum + point.x * page.w * (next.y * page.h) - next.x * page.w * (point.y * page.h);
      }, 0),
    ) / 2;
  const value = areaInPoints * calibration.unitsPerPoint ** 2;
  return formatAreaValue(value, calibration);
}

function bounds(points: MarkupPoint[], page: PageBase) {
  const px = points.map((p) => pointToPage(p, page));
  return {
    minX: Math.min(...px.map((p) => p.x)),
    minY: Math.min(...px.map((p) => p.y)),
    maxX: Math.max(...px.map((p) => p.x)),
    maxY: Math.max(...px.map((p) => p.y)),
  };
}

function cloudPath(a: { x: number; y: number }, b: { x: number; y: number }, radius?: number) {
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
  const segments: string[] = [`M ${left} ${top}`];
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
        segments.push(`Q ${cx} ${cy} ${x} ${startY}`);
      } else {
        const y = startY + sign * step * (i + 1);
        const cy = startY + sign * step * (i + 0.5);
        const cx = startX + (forward ? bump * 0.55 : -bump * 0.55);
        segments.push(`Q ${cx} ${cy} ${startX} ${y}`);
      }
    }
  };
  edge(width, true, true, left, top);
  edge(height, false, true, right, top);
  edge(width, true, false, right, bottom);
  edge(height, false, false, left, bottom);
  return `${segments.join(' ')} Z`;
}

function LineEndingVisual({
  style,
  from,
  tip,
  color,
  width,
  opacity,
  size,
}: {
  style: MarkupLineEnding;
  from: MarkupPoint;
  tip: MarkupPoint;
  color: string;
  width: number;
  opacity: number;
  size?: number;
}) {
  if (style === 'none') return null;
  const distance = Math.max(1, Math.hypot(tip.x - from.x, tip.y - from.y));
  const unit = { x: (tip.x - from.x) / distance, y: (tip.y - from.y) / distance };
  const normal = { x: -unit.y, y: unit.x };
  const length = Math.max(2, size ?? width * 4);
  const halfWidth = length * 0.45;
  const back = { x: tip.x - unit.x * length, y: tip.y - unit.y * length };
  const wingA = { x: back.x + normal.x * halfWidth, y: back.y + normal.y * halfWidth };
  const wingB = { x: back.x - normal.x * halfWidth, y: back.y - normal.y * halfWidth };
  if (style === 'open-arrow') {
    return (
      <path
        d={`M ${wingA.x} ${wingA.y} L ${tip.x} ${tip.y} L ${wingB.x} ${wingB.y}`}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  }
  if (style === 'closed-arrow' || style === 'filled-arrow') {
    return (
      <path
        d={`M ${wingA.x} ${wingA.y} L ${tip.x} ${tip.y} L ${wingB.x} ${wingB.y} Z`}
        fill={style === 'filled-arrow' ? color : 'none'}
        stroke={color}
        strokeWidth={width}
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  }
  if (style === 'dot')
    return (
      <circle cx={tip.x} cy={tip.y} r={Math.max(3, width * 1.5)} fill={color} opacity={opacity} />
    );
  if (style === 'square') {
    const size = Math.max(6, width * 3);
    const angle = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
    return (
      <rect
        x={tip.x - size / 2}
        y={tip.y - size / 2}
        width={size}
        height={size}
        fill={color}
        opacity={opacity}
        transform={`rotate(${angle} ${tip.x} ${tip.y})`}
      />
    );
  }
  const capHalf = Math.max(5, width * 2.5);
  const slashDirection =
    style === 'slash' ? { x: normal.x + unit.x * 0.7, y: normal.y + unit.y * 0.7 } : normal;
  return (
    <line
      x1={tip.x - slashDirection.x * capHalf}
      y1={tip.y - slashDirection.y * capHalf}
      x2={tip.x + slashDirection.x * capHalf}
      y2={tip.y + slashDirection.y * capHalf}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / Math.max(1, fontSize * 0.58)));
  const lines: string[] = [];
  for (const paragraph of (text || 'Double-click to type').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function BoxBoundary({ markup, a, b }: { markup: Markup; a: MarkupPoint; b: MarkupPoint }) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  const shape = markup.boxShape ?? 'rectangle';
  if (shape === 'none') return null;
  const props = {
    fill: markup.fill,
    fillOpacity: markup.fillOpacity ?? 1,
    stroke: markup.stroke,
    strokeWidth: markup.strokeWidth,
    strokeDasharray: svgDashArray(markup.lineStyle, markup.strokeWidth),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (markup.lineStyle === 'cloud')
    return <path {...props} d={cloudPath(a, b, markup.cloudRadius)} />;
  if (shape === 'ellipse')
    return (
      <ellipse
        {...props}
        cx={left + width / 2}
        cy={top + height / 2}
        rx={width / 2}
        ry={height / 2}
      />
    );
  return (
    <rect
      {...props}
      x={left}
      y={top}
      width={width}
      height={height}
      rx={shape === 'rounded' ? Math.min(12, height / 3) : 0}
    />
  );
}

function MarkupVisual({
  markup,
  page,
  calibration,
  hideText = false,
}: {
  markup: Markup;
  page: PageBase;
  calibration?: PageCalibration;
  hideText?: boolean;
}) {
  const points = markup.points.map((p) => pointToPage(p, page));
  if (points.length === 0) return null;
  const a = points[0];
  const b = points[points.length - 1] ?? a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  const common = {
    stroke: markup.stroke,
    strokeWidth: markup.strokeWidth,
    opacity: markup.opacity,
    fill: 'none',
    strokeDasharray: svgDashArray(markup.lineStyle, markup.strokeWidth),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const textColor = markup.textColor ?? markup.stroke;
  const fontFamily = markup.fontFamily ?? 'Helvetica, Arial, sans-serif';
  const defaultBold =
    markup.type === 'cloud-plus' ||
    markup.type === 'dimension' ||
    markup.type === 'area' ||
    markup.type === 'radius' ||
    markup.type === 'diameter' ||
    markup.type === 'arc';
  const fontWeight = (markup.fontBold ?? defaultBold) ? 700 : 400;
  const fontStyle = markup.fontItalic ? 'italic' : 'normal';

  if (markup.type === 'text') {
    if (points.length >= 2 && (width > 2 || height > 2)) {
      const padding = Math.max(4, markup.fontSize * 0.35);
      const lines = wrapText(markup.text, Math.max(1, width - padding * 2), markup.fontSize);
      const maxLines = Math.max(1, Math.floor((height - padding * 2) / (markup.fontSize * 1.25)));
      const alignment = markup.textAlign ?? 'left';
      const textX =
        alignment === 'center'
          ? left + width / 2
          : alignment === 'right'
            ? left + width - padding
            : left + padding;
      return (
        <g opacity={markup.opacity}>
          <BoxBoundary markup={markup} a={a} b={b} />
          {!hideText && (
            <text
              x={textX}
              y={top + padding + markup.fontSize}
              textAnchor={
                alignment === 'center' ? 'middle' : alignment === 'right' ? 'end' : 'start'
              }
              fill={textColor}
              fontSize={markup.fontSize}
              fontFamily={fontFamily}
              fontWeight={fontWeight}
              fontStyle={fontStyle}
            >
              {lines.slice(0, maxLines).map((line, index) => (
                <tspan
                  key={`${line}-${index}`}
                  x={textX}
                  dy={index === 0 ? 0 : markup.fontSize * 1.25}
                >
                  {line}
                </tspan>
              ))}
            </text>
          )}
        </g>
      );
    }
    return (
      <text
        x={a.x}
        y={a.y}
        fill={textColor}
        opacity={markup.opacity}
        fontSize={markup.fontSize}
        fontFamily={fontFamily}
        fontWeight={fontWeight}
        fontStyle={fontStyle}
        style={{
          paintOrder: 'stroke',
          stroke: 'white',
          strokeWidth: Math.max(1, markup.fontSize / 14),
        }}
      >
        {markup.text || 'Text'}
      </text>
    );
  }
  if (markup.type === 'pen' || markup.type === 'highlight') {
    return (
      <polyline
        {...common}
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        strokeWidth={
          markup.type === 'highlight' ? Math.max(10, markup.strokeWidth) : markup.strokeWidth
        }
        opacity={markup.type === 'highlight' ? Math.min(markup.opacity, 0.45) : markup.opacity}
      />
    );
  }
  if (markup.type === 'line' || markup.type === 'arrow') {
    return (
      <g>
        <line {...common} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <LineEndingVisual
          style={defaultStartEnding(markup)}
          from={b}
          tip={a}
          color={markup.stroke}
          width={markup.strokeWidth}
          opacity={markup.opacity}
        />
        <LineEndingVisual
          style={defaultEndEnding(markup)}
          from={a}
          tip={b}
          color={markup.stroke}
          width={markup.strokeWidth}
          opacity={markup.opacity}
        />
      </g>
    );
  }
  if (markup.type === 'rectangle') {
    return (
      <rect
        {...common}
        x={left}
        y={top}
        width={width}
        height={height}
        fill={markup.fill}
        fillOpacity={markup.fillOpacity ?? 1}
      />
    );
  }
  if (markup.type === 'ellipse') {
    return (
      <ellipse
        {...common}
        cx={left + width / 2}
        cy={top + height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={markup.fill}
        fillOpacity={markup.fillOpacity ?? 1}
      />
    );
  }
  if (markup.type === 'cloud') {
    return (
      <path
        {...common}
        d={cloudPath(a, b, markup.cloudRadius)}
        fill={markup.fill}
        fillOpacity={markup.fillOpacity ?? 1}
      />
    );
  }
  if (markup.type === 'area' && points.length >= 2) {
    const polygon = points.length === 2 ? [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] : points;
    const label =
      markup.text ||
      (calibration
        ? formatAreaValue(
            (() => {
              const source =
                markup.points.length === 2
                  ? [
                      { x: markup.points[0].x, y: markup.points[0].y },
                      { x: markup.points[1].x, y: markup.points[0].y },
                      { x: markup.points[1].x, y: markup.points[1].y },
                      { x: markup.points[0].x, y: markup.points[1].y },
                    ]
                  : markup.points;
              return (
                (Math.abs(
                  source.reduce((sum, point, index) => {
                    const next = source[(index + 1) % source.length];
                    return (
                      sum +
                      point.x * page.w * (next.y * page.h) -
                      next.x * page.w * (point.y * page.h)
                    );
                  }, 0),
                ) /
                  2) *
                calibration.unitsPerPoint ** 2
              );
            })(),
            calibration,
            markup.measurementUnit,
          )
        : formatArea(markup.points, page, calibration));
    const center = polygon.reduce(
      (sum, point) => ({
        x: sum.x + point.x / polygon.length,
        y: sum.y + point.y / polygon.length,
      }),
      { x: 0, y: 0 },
    );
    return (
      <g opacity={markup.opacity}>
        <polygon
          points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
          fill={markup.fill}
          fillOpacity={markup.fillOpacity ?? 1}
          stroke={markup.stroke}
          strokeWidth={markup.strokeWidth}
          strokeDasharray={svgDashArray(markup.lineStyle, markup.strokeWidth)}
          strokeLinejoin="round"
        />
        <text
          x={center.x}
          y={center.y + markup.fontSize * 0.25}
          textAnchor="middle"
          fill={textColor}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {label}
        </text>
      </g>
    );
  }
  if (markup.type === 'callout' && points.length >= 3) {
    const tip = points[0];
    const boxA = points[1];
    const boxB = points[2];
    const boxLeft = Math.min(boxA.x, boxB.x);
    const boxTop = Math.min(boxA.y, boxB.y);
    const boxWidth = Math.max(24, Math.abs(boxB.x - boxA.x));
    const boxHeight = Math.max(20, Math.abs(boxB.y - boxA.y));
    const cx = boxLeft + boxWidth / 2;
    const cy = boxTop + boxHeight / 2;
    const elbow = points[3] ?? { x: tip.x, y: cy };
    const dx = elbow.x - cx;
    const dy = elbow.y - cy;
    const edgeScale = Math.min(
      1,
      1 /
        Math.max(
          Math.abs(dx) / Math.max(1, boxWidth / 2),
          Math.abs(dy) / Math.max(1, boxHeight / 2),
        ),
    );
    const attach = { x: cx + dx * edgeScale, y: cy + dy * edgeScale };
    const leaderStroke = markup.leaderStroke ?? markup.stroke;
    const leaderWidth = markup.leaderStrokeWidth ?? markup.strokeWidth;
    const leaderOpacity = markup.leaderOpacity ?? 1;
    const alignment = markup.textAlign ?? 'center';
    const padding = Math.max(4, markup.fontSize * 0.35);
    const textX =
      alignment === 'left'
        ? boxLeft + padding
        : alignment === 'right'
          ? boxLeft + boxWidth - padding
          : cx;
    return (
      <g opacity={markup.opacity}>
        <polyline
          fill="none"
          stroke={leaderStroke}
          strokeWidth={leaderWidth}
          strokeDasharray={svgDashArray(markup.leaderLineStyle, leaderWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={leaderOpacity}
          points={`${attach.x},${attach.y} ${elbow.x},${elbow.y} ${tip.x},${tip.y}`}
        />
        <LineEndingVisual
          style={markup.leaderEnding ?? 'filled-arrow'}
          from={elbow}
          tip={tip}
          color={leaderStroke}
          width={leaderWidth}
          opacity={leaderOpacity}
        />
        <BoxBoundary markup={markup} a={boxA} b={boxB} />
        <text
          x={textX}
          y={cy + markup.fontSize * 0.34}
          textAnchor={alignment === 'left' ? 'start' : alignment === 'right' ? 'end' : 'middle'}
          fill={textColor}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {!hideText && (markup.text || 'Callout')}
        </text>
      </g>
    );
  }
  if (markup.type === 'cloud-plus' && points.length >= 3) {
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
    const leaderStroke = markup.leaderStroke ?? markup.stroke;
    const leaderWidth = markup.leaderStrokeWidth ?? markup.strokeWidth;
    const leaderOpacity = markup.leaderOpacity ?? 1;
    return (
      <g opacity={markup.opacity}>
        <path
          {...common}
          d={cloudPath(cloudA, cloudB, markup.cloudRadius)}
          fill={markup.fill}
          fillOpacity={markup.fillOpacity ?? 1}
        />
        <polyline
          fill="none"
          stroke={leaderStroke}
          strokeWidth={leaderWidth}
          strokeDasharray={svgDashArray(markup.leaderLineStyle, leaderWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={leaderOpacity}
          points={`${label.x},${label.y} ${elbow.x},${elbow.y} ${arrowTip.x},${arrowTip.y}`}
        />
        <LineEndingVisual
          style={markup.leaderEnding ?? 'filled-arrow'}
          from={elbow}
          tip={arrowTip}
          color={leaderStroke}
          width={leaderWidth}
          opacity={leaderOpacity}
        />
        <text
          x={label.x}
          y={label.y - 5}
          textAnchor={label.x < center.x ? 'end' : 'start'}
          fill={textColor}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {!hideText && (markup.text || 'Cloud+')}
        </text>
      </g>
    );
  }
  if ((markup.type === 'radius' || markup.type === 'diameter') && points.length >= 2) {
    const center = markup.type === 'radius' ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const radius =
      markup.type === 'radius'
        ? Math.hypot(b.x - a.x, b.y - a.y)
        : Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const edge = markup.type === 'radius' ? b : a;
    const labelValue = radius * (calibration?.unitsPerPoint ?? 0);
    const label =
      markup.text ||
      (calibration
        ? `${markup.type === 'radius' ? 'R' : 'Ø'} ${formatLengthValue(labelValue, calibration, markup.measurementUnit, markup.fractionDenominator)}`
        : 'Not calibrated');
    const labelWidth = Math.max(34, label.length * markup.fontSize * 0.62 + 8);
    return (
      <g>
        <circle {...common} cx={center.x} cy={center.y} r={radius} />
        <line {...common} x1={center.x} y1={center.y} x2={edge.x} y2={edge.y} />
        {markup.type === 'diameter' && (
          <>
            <LineEndingVisual
              style={defaultStartEnding(markup)}
              from={b}
              tip={a}
              color={markup.stroke}
              width={markup.strokeWidth}
              opacity={markup.opacity}
              size={markup.arrowSize}
            />
            <LineEndingVisual
              style={defaultEndEnding(markup)}
              from={a}
              tip={b}
              color={markup.stroke}
              width={markup.strokeWidth}
              opacity={markup.opacity}
              size={markup.arrowSize}
            />
          </>
        )}
        <rect
          x={edge.x + 4}
          y={edge.y - markup.fontSize - 5}
          width={labelWidth}
          height={markup.fontSize * 1.35}
          rx={2}
          fill="white"
          opacity={0.94 * markup.opacity}
        />
        <text
          x={edge.x + 8}
          y={edge.y - 7}
          fill={textColor}
          opacity={markup.opacity}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {label}
        </text>
      </g>
    );
  }
  if (markup.type === 'arc' && points.length >= 3) {
    const geometry = arcGeometry(points);
    if (!geometry) return null;
    const label =
      markup.text ||
      (calibration
        ? `Arc ${formatLengthValue(geometry.radius * geometry.sweep * calibration.unitsPerPoint, calibration, markup.measurementUnit, markup.fractionDenominator)}`
        : 'Not calibrated');
    const labelWidth = Math.max(40, label.length * markup.fontSize * 0.62 + 8);
    return (
      <g>
        <path {...common} d={arcPath(geometry, points[0], points[2])} />
        <circle
          cx={points[0].x}
          cy={points[0].y}
          r={Math.max(2, markup.strokeWidth)}
          fill={markup.stroke}
          opacity={markup.opacity}
        />
        <circle
          cx={points[2].x}
          cy={points[2].y}
          r={Math.max(2, markup.strokeWidth)}
          fill={markup.stroke}
          opacity={markup.opacity}
        />
        <rect
          x={geometry.midpoint.x - labelWidth / 2}
          y={geometry.midpoint.y - markup.fontSize * 0.7}
          width={labelWidth}
          height={markup.fontSize * 1.4}
          rx={2}
          fill="white"
          opacity={0.94 * markup.opacity}
        />
        <text
          x={geometry.midpoint.x}
          y={geometry.midpoint.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          opacity={markup.opacity}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {label}
        </text>
      </g>
    );
  }
  if (markup.type === 'dimension') {
    const unitX = b.x - a.x;
    const unitY = b.y - a.y;
    const lineLength = Math.max(1, Math.hypot(unitX, unitY));
    const normal = { x: -unitY / lineLength, y: unitX / lineLength };
    const labelNormal = normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;
    const offset = Math.max(0, markup.extensionOffset ?? 18);
    const extension = Math.max(0, markup.extensionLength ?? 18);
    const dimensionA = { x: a.x + labelNormal.x * offset, y: a.y + labelNormal.y * offset };
    const dimensionB = { x: b.x + labelNormal.x * offset, y: b.y + labelNormal.y * offset };
    const mx = (dimensionA.x + dimensionB.x) / 2;
    const my = (dimensionA.y + dimensionB.y) / 2;
    const label =
      markup.text ||
      formatMeasurement(
        markup.points,
        page,
        calibration,
        markup.measurementUnit,
        markup.fractionDenominator,
      );
    const labelWidth = Math.max(38, label.length * markup.fontSize * 0.62 + 8);
    const dimensionStroke = Math.max(1, markup.strokeWidth);
    return (
      <g>
        {(markup.witnessLines ?? true) && (
          <>
            <line
              {...common}
              strokeWidth={dimensionStroke}
              x1={a.x - labelNormal.x * 4}
              y1={a.y - labelNormal.y * 4}
              x2={dimensionA.x + labelNormal.x * extension}
              y2={dimensionA.y + labelNormal.y * extension}
            />
            <line
              {...common}
              strokeWidth={dimensionStroke}
              x1={b.x - labelNormal.x * 4}
              y1={b.y - labelNormal.y * 4}
              x2={dimensionB.x + labelNormal.x * extension}
              y2={dimensionB.y + labelNormal.y * extension}
            />
          </>
        )}
        <line
          {...common}
          strokeWidth={dimensionStroke}
          x1={dimensionA.x}
          y1={dimensionA.y}
          x2={dimensionB.x}
          y2={dimensionB.y}
        />
        <LineEndingVisual
          style={defaultStartEnding(markup)}
          from={dimensionB}
          tip={dimensionA}
          color={markup.stroke}
          width={dimensionStroke}
          opacity={markup.opacity}
          size={markup.arrowSize}
        />
        <LineEndingVisual
          style={defaultEndEnding(markup)}
          from={dimensionA}
          tip={dimensionB}
          color={markup.stroke}
          width={dimensionStroke}
          opacity={markup.opacity}
          size={markup.arrowSize}
        />
        <rect
          x={mx - labelWidth / 2}
          y={my - markup.fontSize * 0.7}
          width={labelWidth}
          height={markup.fontSize * 1.4}
          rx={2}
          fill="white"
          opacity={0.96 * markup.opacity}
        />
        <text
          x={mx}
          y={my}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          opacity={markup.opacity}
          fontSize={markup.fontSize}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
        >
          {label}
        </text>
      </g>
    );
  }
  return null;
}

/**
 * A forgiving, invisible pointer target drawn behind each markup. The target is
 * kept at roughly the same screen size at every zoom level, so thin geometry is
 * still easy to acquire without changing its printed appearance.
 */
function MarkupHitTarget({
  markup,
  page,
  viewScale,
  active,
}: {
  markup: Markup;
  page: PageBase;
  viewScale: number;
  active: boolean;
}) {
  const points = markup.points.map((point) => pointToPage(point, page));
  if (points.length === 0) return null;
  const a = points[0];
  const b = points[points.length - 1] ?? a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  const scale = Math.max(0.01, viewScale);
  const hitWidth = Math.max(markup.strokeWidth + 8 / scale, 14 / scale);
  const hitStroke = active ? 'var(--fp-accent)' : 'transparent';
  const hitOpacity = active ? 0.2 : 0;
  const strokeTarget = {
    fill: 'none',
    stroke: hitStroke,
    strokeWidth: hitWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity: hitOpacity,
    pointerEvents: 'stroke' as const,
  };
  const enclosedTarget = {
    ...strokeTarget,
    fill: 'transparent',
    pointerEvents: 'all' as const,
  };
  const textTarget = (
    x: number,
    y: number,
    text: string,
    anchor: 'start' | 'end' | 'middle' = 'start',
  ) => {
    const targetWidth = Math.max(32 / scale, (text || 'Text').length * markup.fontSize * 0.64);
    const targetHeight = Math.max(18 / scale, markup.fontSize * 1.5);
    const targetX =
      anchor === 'end' ? x - targetWidth : anchor === 'middle' ? x - targetWidth / 2 : x;
    return (
      <rect
        {...enclosedTarget}
        x={targetX}
        y={y - targetHeight}
        width={targetWidth}
        height={targetHeight}
        rx={2 / scale}
      />
    );
  };

  if (markup.type === 'pen' || markup.type === 'highlight') {
    return (
      <polyline
        {...strokeTarget}
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
      />
    );
  }
  if (markup.type === 'line' || markup.type === 'arrow') {
    return <line {...strokeTarget} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
  }
  if (markup.type === 'text') {
    if (points.length >= 2 && (width > 2 || height > 2)) {
      return (
        <rect
          {...enclosedTarget}
          x={left}
          y={top}
          width={Math.max(width, 12 / scale)}
          height={Math.max(height, 12 / scale)}
        />
      );
    }
    return textTarget(a.x, a.y, markup.text);
  }
  if (markup.type === 'rectangle') {
    return <rect {...enclosedTarget} x={left} y={top} width={width} height={height} />;
  }
  if (markup.type === 'ellipse') {
    return (
      <ellipse
        {...enclosedTarget}
        cx={left + width / 2}
        cy={top + height / 2}
        rx={width / 2}
        ry={height / 2}
      />
    );
  }
  if (markup.type === 'cloud') {
    return <path {...enclosedTarget} d={cloudPath(a, b, markup.cloudRadius)} />;
  }
  if (markup.type === 'area' && points.length >= 2) {
    const polygon = points.length === 2 ? [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] : points;
    return (
      <polygon
        {...enclosedTarget}
        points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
      />
    );
  }
  if (markup.type === 'callout' && points.length >= 3) {
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
    return (
      <g>
        <polyline
          {...strokeTarget}
          points={`${attach.x},${attach.y} ${elbow.x},${elbow.y} ${tip.x},${tip.y}`}
        />
        <rect {...enclosedTarget} x={boxLeft} y={boxTop} width={boxWidth} height={boxHeight} />
      </g>
    );
  }
  if (markup.type === 'cloud-plus' && points.length >= 3) {
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
    const anchor = label.x < center.x ? 'end' : 'start';
    return (
      <g>
        <path {...enclosedTarget} d={cloudPath(cloudA, cloudB, markup.cloudRadius)} />
        <polyline
          {...strokeTarget}
          points={`${label.x},${label.y} ${elbow.x},${elbow.y} ${arrowTip.x},${arrowTip.y}`}
        />
        {textTarget(label.x, label.y - 5, markup.text || 'Cloud+', anchor)}
      </g>
    );
  }
  if ((markup.type === 'radius' || markup.type === 'diameter') && points.length >= 2) {
    const center = markup.type === 'radius' ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const radius =
      markup.type === 'radius'
        ? Math.hypot(b.x - a.x, b.y - a.y)
        : Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const edge = markup.type === 'radius' ? b : a;
    return (
      <g>
        <circle {...strokeTarget} cx={center.x} cy={center.y} r={radius} />
        <line {...strokeTarget} x1={center.x} y1={center.y} x2={edge.x} y2={edge.y} />
        {textTarget(edge.x + 4, edge.y - 5, markup.text || markup.type)}
      </g>
    );
  }
  if (markup.type === 'arc' && points.length >= 3) {
    const geometry = arcGeometry(points);
    if (!geometry) return null;
    return (
      <g>
        <path {...strokeTarget} d={arcPath(geometry, points[0], points[2])} />
        {textTarget(
          geometry.midpoint.x,
          geometry.midpoint.y + markup.fontSize * 0.55,
          markup.text || 'Arc',
          'middle',
        )}
      </g>
    );
  }
  if (markup.type === 'dimension') {
    const unitX = b.x - a.x;
    const unitY = b.y - a.y;
    const lineLength = Math.max(1, Math.hypot(unitX, unitY));
    const normal = { x: -unitY / lineLength, y: unitX / lineLength };
    const labelNormal = normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;
    const offset = Math.max(0, markup.extensionOffset ?? 18);
    const extension = Math.max(0, markup.extensionLength ?? 18);
    const dimensionA = { x: a.x + labelNormal.x * offset, y: a.y + labelNormal.y * offset };
    const dimensionB = { x: b.x + labelNormal.x * offset, y: b.y + labelNormal.y * offset };
    const midpoint = { x: (dimensionA.x + dimensionB.x) / 2, y: (dimensionA.y + dimensionB.y) / 2 };
    return (
      <g>
        {(markup.witnessLines ?? true) && (
          <>
            <line
              {...strokeTarget}
              x1={a.x}
              y1={a.y}
              x2={dimensionA.x + labelNormal.x * extension}
              y2={dimensionA.y + labelNormal.y * extension}
            />
            <line
              {...strokeTarget}
              x1={b.x}
              y1={b.y}
              x2={dimensionB.x + labelNormal.x * extension}
              y2={dimensionB.y + labelNormal.y * extension}
            />
          </>
        )}
        <line
          {...strokeTarget}
          x1={dimensionA.x}
          y1={dimensionA.y}
          x2={dimensionB.x}
          y2={dimensionB.y}
        />
        {textTarget(
          midpoint.x,
          midpoint.y + markup.fontSize * 0.55,
          markup.text || 'Dimension',
          'middle',
        )}
      </g>
    );
  }
  return null;
}

function EditableMarkup({
  markup,
  page,
  viewScale,
  snapPoints,
  snappingEnabled,
  onSnapPointChange,
}: {
  markup: Markup;
  page: PageBase;
  viewScale: number;
  snapPoints: MarkupPoint[];
  snappingEnabled: boolean;
  onSnapPointChange(point: MarkupPoint | null): void;
}) {
  const selected = useProject((s) => s.selectedMarkupId === markup.id);
  const tool = useProject((s) => s.markupTool);
  const addPinMode = useProject((s) => s.addPinMode);
  const calibration = useProject((s) => s.calibrations[markup.page]);
  const selectMarkup = useProject((s) => s.selectMarkup);
  const updateMarkup = useProject((s) => s.updateMarkup);
  const dragRef = useRef<{ x: number; y: number; points: MarkupPoint[] } | null>(null);
  const handleRef = useRef<{ index: number; points: MarkupPoint[] } | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [hovered, setHovered] = useState(false);
  const box = bounds(markup.points, page);
  const handleRadius = 5 / viewScale;
  // A reopened plan has no active markup tool. Its saved markups should still
  // be directly selectable; only an active drawing or pin tool takes priority.
  const canEdit = tool === 'select' || (tool === null && !addPinMode);

  useEffect(() => {
    if (selected && markup.type === 'text' && markup.text === '') setEditingText(true);
  }, [selected, markup.type, markup.text]);

  useEffect(() => {
    if (!selected || markup.type !== 'callout' || markup.points.length !== 3) return;
    const tip = markup.points[0];
    const boxA = markup.points[1];
    const boxB = markup.points[2];
    updateMarkup(markup.id, {
      points: [...markup.points, { x: tip.x, y: (boxA.y + boxB.y) / 2 }],
    });
  }, [selected, markup.id, markup.type, markup.points, updateMarkup]);

  const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (e.button !== 0 || !canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    selectMarkup(markup.id);
    dragRef.current = { x: e.clientX, y: e.clientY, points: markup.points.map((p) => ({ ...p })) };
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / rect.width;
    const dy = (e.clientY - drag.y) / rect.height;
    const minX = Math.min(...drag.points.map((p) => p.x));
    const maxX = Math.max(...drag.points.map((p) => p.x));
    const minY = Math.min(...drag.points.map((p) => p.y));
    const maxY = Math.max(...drag.points.map((p) => p.y));
    const safeDx = clamp(dx, -minX, 1 - maxX);
    const safeDy = clamp(dy, -minY, 1 - maxY);
    let nextPoints = drag.points.map((p) => ({ x: p.x + safeDx, y: p.y + safeDy }));
    if (snappingEnabled && snapPoints.length > 0) {
      let best: { source: MarkupPoint; target: MarkupPoint; distance: number } | null = null;
      for (const source of nextPoints) {
        const target = nearestSnapPoint(source, snapPoints, page, viewScale);
        if (!target) continue;
        const distance = Math.hypot(
          (target.x - source.x) * page.w * viewScale,
          (target.y - source.y) * page.h * viewScale,
        );
        if (!best || distance < best.distance) best = { source, target, distance };
      }
      if (best) {
        const snapDx = best.target.x - best.source.x;
        const snapDy = best.target.y - best.source.y;
        const shifted = nextPoints.map((point) => ({ x: point.x + snapDx, y: point.y + snapDy }));
        if (
          shifted.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
        ) {
          nextPoints = shifted;
          onSnapPointChange(best.target);
        }
      } else {
        onSnapPointChange(null);
      }
    } else {
      onSnapPointChange(null);
    }
    updateMarkup(markup.id, { points: nextPoints });
  };

  const resizeHandle = (index: number, point: MarkupPoint) => (
    <circle
      key={index}
      data-markup-handle={index}
      data-point-x={point.x}
      data-point-y={point.y}
      cx={point.x * page.w}
      cy={point.y * page.h}
      r={handleRadius}
      fill="white"
      stroke="var(--fp-accent)"
      strokeWidth={2 / viewScale}
      pointerEvents="all"
      className="cursor-move"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        handleRef.current = { index, points: markup.points.map((p) => ({ ...p })) };
      }}
      onPointerMove={(e) => {
        const resize = handleRef.current;
        if (!resize) return;
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const next = resize.points.map((p) => ({ ...p }));
        let candidate = {
          x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
          y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
        };
        if (e.shiftKey) {
          const lockMovementAxis = (origin: MarkupPoint) => {
            const dx = (candidate.x - origin.x) * page.w;
            const dy = (candidate.y - origin.y) * page.h;
            if (Math.abs(dx) >= Math.abs(dy)) candidate.y = origin.y;
            else candidate.x = origin.x;
          };
          const snapOrthogonal = (other: MarkupPoint) => {
            const dx = (candidate.x - other.x) * page.w;
            const dy = (candidate.y - other.y) * page.h;
            if (Math.abs(dx) >= Math.abs(dy)) candidate.y = other.y;
            else candidate.x = other.x;
          };
          const snapSquare = (other: MarkupPoint) => {
            const dx = (candidate.x - other.x) * page.w;
            const dy = (candidate.y - other.y) * page.h;
            const xDirection = dx < 0 ? -1 : 1;
            const yDirection = dy < 0 ? -1 : 1;
            const maxX = (xDirection > 0 ? 1 - other.x : other.x) * page.w;
            const maxY = (yDirection > 0 ? 1 - other.y : other.y) * page.h;
            const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxX, maxY);
            candidate.x = other.x + (xDirection * size) / page.w;
            candidate.y = other.y + (yDirection * size) / page.h;
          };

          if (
            (markup.type === 'line' || markup.type === 'arrow' || markup.type === 'dimension') &&
            next.length >= 2
          ) {
            snapOrthogonal(resize.points[resize.index === 0 ? resize.points.length - 1 : 0]);
          } else if (markup.type === 'callout' && next.length >= 4) {
            if (resize.index === 0) {
              lockMovementAxis(resize.points[resize.index]);
            } else if (resize.index === 3) {
              // Shift constrains the segment that does not contain the arrow.
              // The arrow segment (elbow -> tip) remains free to keep its angle.
              const center = {
                x: (resize.points[1].x + resize.points[2].x) / 2,
                y: (resize.points[1].y + resize.points[2].y) / 2,
              };
              // Project the elbow onto a horizontal or vertical line through
              // the callout box. Preserve the other coordinate so the arrow
              // segment can keep any angle instead of becoming perpendicular.
              const horizontalDistance = Math.abs(candidate.y - center.y) * page.h;
              const verticalDistance = Math.abs(candidate.x - center.x) * page.w;
              if (horizontalDistance <= verticalDistance) candidate.y = center.y;
              else candidate.x = center.x;
            } else if (resize.index === 1 || resize.index === 2) {
              snapSquare(resize.points[resize.index === 1 ? 2 : 1]);
            }
          } else if (markup.type === 'cloud-plus' && next.length >= 5) {
            if (resize.index === 2) {
              snapOrthogonal(resize.points[3]);
            } else if (resize.index === 3) {
              // Keep the label -> elbow segment orthogonal; the elbow -> tip
              // arrow segment remains free to form any angle.
              const label = resize.points[2];
              // Keep the label -> elbow segment horizontal or vertical while
              // preserving the elbow's other coordinate for a free arrow angle.
              const horizontalDistance = Math.abs(candidate.y - label.y) * page.h;
              const verticalDistance = Math.abs(candidate.x - label.x) * page.w;
              if (horizontalDistance <= verticalDistance) candidate.y = label.y;
              else candidate.x = label.x;
            } else if (resize.index === 4) {
              lockMovementAxis(resize.points[resize.index]);
            } else if (resize.index === 0 || resize.index === 1) {
              snapSquare(resize.points[resize.index === 0 ? 1 : 0]);
            }
          } else if (
            (markup.type === 'text' ||
              markup.type === 'rectangle' ||
              markup.type === 'ellipse' ||
              markup.type === 'cloud' ||
              markup.type === 'area') &&
            next.length >= 2
          ) {
            snapSquare(resize.points[resize.index === 0 ? resize.points.length - 1 : 0]);
          }
        }
        if (snappingEnabled && !e.shiftKey) {
          const snapped = nearestSnapPoint(candidate, snapPoints, page, viewScale);
          if (snapped) candidate = snapped;
          onSnapPointChange(snapped);
        } else {
          onSnapPointChange(null);
        }
        next[resize.index] = candidate;
        updateMarkup(markup.id, { points: next });
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        handleRef.current = null;
        onSnapPointChange(null);
      }}
      onPointerCancel={() => {
        handleRef.current = null;
        onSnapPointChange(null);
      }}
    />
  );

  const inlineEditor = () => {
    if (!editingText) return null;
    const pagePoints = markup.points.map((point) => pointToPage(point, page));
    const textBox = markup.type === 'text';
    const callout = markup.type === 'callout';
    const cloudPlus = markup.type === 'cloud-plus';
    if (!textBox && !callout && !cloudPlus) return null;

    if (cloudPlus) {
      const label = pagePoints[2];
      if (!label) return null;
      const centerX = ((pagePoints[0]?.x ?? label.x) + (pagePoints[1]?.x ?? label.x)) / 2;
      const editorWidth = Math.max(
        100,
        Math.min(220, (markup.text.length + 4) * markup.fontSize * 0.62),
      );
      return (
        <foreignObject
          x={label.x < centerX ? label.x - editorWidth : label.x}
          y={label.y - markup.fontSize - 11}
          width={editorWidth}
          height={markup.fontSize + 14}
          pointerEvents="all"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div style={{ width: '100%', height: '100%' }}>
            <input
              autoFocus
              value={markup.text}
              aria-label="Edit Cloud+ text in place"
              style={{
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                border: `1px solid ${markup.stroke}`,
                borderRadius: 3,
                background: 'white',
                color: markup.textColor ?? markup.stroke,
                fontFamily: 'var(--fp-font-sans)',
                fontSize: markup.fontSize,
                fontWeight: 700,
                padding: '1px 4px',
                outline: 'none',
              }}
              onChange={(e) => updateMarkup(markup.id, { text: e.target.value })}
              onBlur={() => setEditingText(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  setEditingText(false);
                }
              }}
            />
          </div>
        </foreignObject>
      );
    }

    const editorA = textBox ? pagePoints[0] : pagePoints[1];
    const editorB = textBox ? pagePoints[pagePoints.length - 1] : pagePoints[2];
    if (!editorA || !editorB) return null;
    const editorLeft = Math.min(editorA.x, editorB.x);
    const editorTop = Math.min(editorA.y, editorB.y);
    const editorWidth = Math.max(24, Math.abs(editorB.x - editorA.x));
    const editorHeight = Math.max(20, Math.abs(editorB.y - editorA.y));
    return (
      <foreignObject
        x={editorLeft}
        y={editorTop}
        width={editorWidth}
        height={editorHeight}
        pointerEvents="all"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: '100%', height: '100%' }}>
          <textarea
            autoFocus
            value={markup.text}
            aria-label={`Edit ${textBox ? 'text box' : 'callout'} text in place`}
            placeholder="Type here…"
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              boxSizing: 'border-box',
              border: 'none',
              background: 'transparent',
              color: markup.textColor ?? markup.stroke,
              fontFamily: 'var(--fp-font-sans)',
              fontSize: markup.fontSize,
              lineHeight: 1.25,
              padding: Math.max(3, markup.fontSize * 0.25),
              outline: 'none',
            }}
            onChange={(e) => updateMarkup(markup.id, { text: e.target.value })}
            onBlur={() => setEditingText(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
                e.preventDefault();
                setEditingText(false);
              }
            }}
          />
        </div>
      </foreignObject>
    );
  };

  return (
    <g
      style={{
        pointerEvents: canEdit ? 'visiblePainted' : 'none',
        cursor: canEdit ? 'move' : 'default',
      }}
      data-markup-id={markup.id}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        e.stopPropagation();
        dragRef.current = null;
        onSnapPointChange(null);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        onSnapPointChange(null);
      }}
      onDoubleClick={(e) => {
        if (markup.type !== 'text' && markup.type !== 'callout' && markup.type !== 'cloud-plus')
          return;
        e.preventDefault();
        e.stopPropagation();
        selectMarkup(markup.id);
        setEditingText(true);
      }}
    >
      <defs>
        <marker
          id={`arrow-${markup.id}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={markup.stroke} />
        </marker>
      </defs>
      <MarkupHitTarget
        markup={markup}
        page={page}
        viewScale={viewScale}
        active={hovered && !selected && canEdit}
      />
      <MarkupVisual markup={markup} page={page} calibration={calibration} hideText={editingText} />
      {inlineEditor()}
      {selected && (
        <>
          <rect
            x={box.minX - 4 / viewScale}
            y={box.minY - 4 / viewScale}
            width={Math.max(8 / viewScale, box.maxX - box.minX + 8 / viewScale)}
            height={Math.max(8 / viewScale, box.maxY - box.minY + 8 / viewScale)}
            fill="transparent"
            stroke="var(--fp-accent)"
            strokeWidth={1 / viewScale}
            strokeDasharray={`${4 / viewScale} ${3 / viewScale}`}
            pointerEvents="none"
          />
          {markup.type !== 'pen' &&
            markup.type !== 'highlight' &&
            markup.points.map((point, index) => resizeHandle(index, point))}
        </>
      )}
    </g>
  );
}

export function MarkupLayer({
  pageBase,
  viewScale,
  draft,
  snapPoints,
  snappingEnabled,
  onSnapPointChange,
}: MarkupLayerProps) {
  const currentPage = useProject((s) => s.currentPage);
  const markups = useProject((s) => s.markups);
  const calibration = useProject((s) => s.calibrations[currentPage]);
  const visible = Object.values(markups).filter((markup) => markup.page === currentPage);

  return (
    <svg
      data-markup-layer
      className="pointer-events-none absolute inset-0 overflow-visible"
      viewBox={`0 0 ${pageBase.w} ${pageBase.h}`}
      preserveAspectRatio="none"
      aria-label="Plan markups"
    >
      <defs>
        <marker
          id="arrow-draft"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={draft?.stroke ?? '#dc2626'} />
        </marker>
      </defs>
      {visible.map((markup) => (
        <EditableMarkup
          key={markup.id}
          markup={markup}
          page={pageBase}
          viewScale={viewScale}
          snapPoints={snapPoints}
          snappingEnabled={snappingEnabled}
          onSnapPointChange={onSnapPointChange}
        />
      ))}
      {draft && (
        <g pointerEvents="none">
          <MarkupVisual markup={draft} page={pageBase} calibration={calibration} />
        </g>
      )}
    </svg>
  );
}
