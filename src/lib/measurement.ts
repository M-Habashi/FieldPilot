import type { MarkupPoint, PageCalibration } from '../types';

export type MeasurementDisplayUnit = 'calibrated' | 'in' | 'ft' | 'mm' | 'cm' | 'm';
export type FractionDenominator = 1 | 2 | 4 | 8 | 16;

const METERS_PER_UNIT: Record<Exclude<MeasurementDisplayUnit, 'calibrated'>, number> = {
  in: 0.0254,
  ft: 0.3048,
  mm: 0.001,
  cm: 0.01,
  m: 1,
};

function reduceFraction(numerator: number, denominator: FractionDenominator) {
  if (numerator === 0) return '';
  const divisor =
    denominator === 16 && numerator % 8 === 0
      ? 8
      : denominator >= 8 && numerator % 4 === 0
        ? 4
        : denominator >= 4 && numerator % 2 === 0
          ? 2
          : 1;
  return ` ${numerator / divisor}/${denominator / divisor}`;
}

function formatImperialInches(totalInches: number, denominator: FractionDenominator) {
  const units = Math.max(0, Math.round(totalInches * denominator));
  const inches = Math.floor(units / denominator);
  return `${inches}${reduceFraction(units % denominator, denominator)}"`;
}

function formatFeet(value: number, denominator: FractionDenominator) {
  const totalInches = Math.max(0, value * 12);
  const units = Math.round(totalInches * denominator);
  const feet = Math.floor(units / (12 * denominator));
  const inchesUnits = units % (12 * denominator);
  const inches = Math.floor(inchesUnits / denominator);
  return `${feet}'-${inches}${reduceFraction(inchesUnits % denominator, denominator)}"`;
}

export function formatLengthValue(
  value: number,
  calibration: PageCalibration,
  displayUnit: MeasurementDisplayUnit = 'calibrated',
  fractionDenominator: FractionDenominator = 16,
) {
  const unit = displayUnit === 'calibrated' ? calibration.unit : displayUnit;
  const meters = value * METERS_PER_UNIT[calibration.unit];
  const converted = meters / METERS_PER_UNIT[unit];
  if (unit === 'ft') return formatFeet(converted, fractionDenominator);
  if (unit === 'in') return formatImperialInches(converted, fractionDenominator);
  const decimals = converted >= 100 ? 1 : converted >= 10 ? 2 : 3;
  return `${converted.toFixed(decimals).replace(/\.?0+$/, '')} ${unit}`;
}

export function formatLengthBetween(
  points: MarkupPoint[],
  page: { w: number; h: number },
  calibration: PageCalibration | undefined,
  displayUnit: MeasurementDisplayUnit = 'calibrated',
  fractionDenominator: FractionDenominator = 16,
) {
  if (points.length < 2 || !calibration) return 'Not calibrated';
  const a = points[0];
  const b = points[points.length - 1];
  const value = Math.hypot((b.x - a.x) * page.w, (b.y - a.y) * page.h) * calibration.unitsPerPoint;
  return formatLengthValue(value, calibration, displayUnit, fractionDenominator);
}

export function formatAreaValue(
  value: number,
  calibration: PageCalibration,
  displayUnit: MeasurementDisplayUnit = 'calibrated',
) {
  const unit = displayUnit === 'calibrated' ? calibration.unit : displayUnit;
  const meters = value * METERS_PER_UNIT[calibration.unit];
  const converted = (meters / METERS_PER_UNIT[unit]) ** 2;
  const decimals = converted >= 100 ? 1 : converted >= 10 ? 2 : 3;
  return `${converted.toFixed(decimals).replace(/\.?0+$/, '')} ${unit}^2`;
}
