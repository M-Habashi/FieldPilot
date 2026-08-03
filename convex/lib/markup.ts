import { v } from 'convex/values';

export const markupPoint = v.object({ x: v.number(), y: v.number() });

const lineStyle = v.union(
  v.literal('solid'),
  v.literal('dashed-1'),
  v.literal('dashed-2'),
  v.literal('dashed-3'),
  v.literal('dashed-4'),
  v.literal('dashed-5'),
  v.literal('dashed-6'),
  v.literal('cloud'),
);

const lineEnding = v.union(
  v.literal('none'),
  v.literal('open-arrow'),
  v.literal('closed-arrow'),
  v.literal('filled-arrow'),
  v.literal('butt'),
  v.literal('slash'),
  v.literal('dot'),
  v.literal('square'),
);

const lengthUnit = v.union(
  v.literal('in'),
  v.literal('ft'),
  v.literal('mm'),
  v.literal('cm'),
  v.literal('m'),
);

export const markupData = v.object({
  type: v.union(
    v.literal('text'),
    v.literal('pen'),
    v.literal('highlight'),
    v.literal('line'),
    v.literal('arrow'),
    v.literal('rectangle'),
    v.literal('ellipse'),
    v.literal('cloud'),
    v.literal('callout'),
    v.literal('cloud-plus'),
    v.literal('dimension'),
    v.literal('area'),
    v.literal('radius'),
    v.literal('diameter'),
    v.literal('arc'),
  ),
  points: v.array(markupPoint),
  text: v.string(),
  textColor: v.optional(v.string()),
  stroke: v.string(),
  fill: v.string(),
  strokeWidth: v.number(),
  opacity: v.number(),
  lineStyle: v.optional(lineStyle),
  startEnding: v.optional(lineEnding),
  endEnding: v.optional(lineEnding),
  fillOpacity: v.optional(v.number()),
  leaderStroke: v.optional(v.string()),
  leaderStrokeWidth: v.optional(v.number()),
  leaderOpacity: v.optional(v.number()),
  leaderLineStyle: v.optional(lineStyle),
  leaderEnding: v.optional(lineEnding),
  boxShape: v.optional(
    v.union(v.literal('rectangle'), v.literal('rounded'), v.literal('ellipse'), v.literal('none')),
  ),
  cloudRadius: v.optional(v.number()),
  fontSize: v.number(),
  fontFamily: v.optional(v.string()),
  fontBold: v.optional(v.boolean()),
  fontItalic: v.optional(v.boolean()),
  textAlign: v.optional(v.union(v.literal('left'), v.literal('center'), v.literal('right'))),
  measurementUnit: v.optional(v.union(v.literal('calibrated'), lengthUnit)),
  fractionDenominator: v.optional(
    v.union(v.literal(1), v.literal(2), v.literal(4), v.literal(8), v.literal(16)),
  ),
  witnessLines: v.optional(v.boolean()),
  extensionOffset: v.optional(v.number()),
  extensionLength: v.optional(v.number()),
  arrowSize: v.optional(v.number()),
});

export const pageCalibration = v.object({
  unitsPerPoint: v.number(),
  unit: lengthUnit,
  referenceLength: v.number(),
  calibratedAt: v.number(),
});
