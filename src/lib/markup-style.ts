import type { Markup, MarkupLineEnding, MarkupLineStyle } from '../types';

export const LINE_STYLE_OPTIONS: Array<{ value: Exclude<MarkupLineStyle, 'cloud'>; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed-1', label: 'Dashed 1' },
  { value: 'dashed-2', label: 'Dashed 2' },
  { value: 'dashed-3', label: 'Dashed 3' },
  { value: 'dashed-4', label: 'Dashed 4' },
  { value: 'dashed-5', label: 'Dashed 5' },
  { value: 'dashed-6', label: 'Dashed 6' },
];

export const LINE_ENDING_OPTIONS: Array<{ value: MarkupLineEnding; label: string }> = [
  { value: 'none', label: '— None' },
  { value: 'open-arrow', label: '‹ Open arrow' },
  { value: 'closed-arrow', label: '◁ Closed arrow' },
  { value: 'filled-arrow', label: '◀ Filled arrow' },
  { value: 'butt', label: '| Butt' },
  { value: 'slash', label: '/ Slash' },
  { value: 'dot', label: '● Dot' },
  { value: 'square', label: '■ Square' },
];

export function lineDashArray(style: MarkupLineStyle | undefined, width: number): number[] {
  const unit = Math.max(1, width);
  switch (style) {
    case 'dashed-1': return [unit, unit * 2];
    case 'dashed-2': return [unit * 2, unit * 2];
    case 'dashed-3': return [unit * 4, unit * 2];
    case 'dashed-4': return [unit * 6, unit * 2];
    case 'dashed-5': return [unit * 8, unit * 3, unit * 2, unit * 3];
    case 'dashed-6': return [unit * 10, unit * 3];
    default: return [];
  }
}

export function svgDashArray(style: MarkupLineStyle | undefined, width: number): string | undefined {
  const values = lineDashArray(style, width);
  return values.length ? values.join(' ') : undefined;
}

export function defaultStartEnding(markup: Pick<Markup, 'type' | 'startEnding'>): MarkupLineEnding {
  if (markup.startEnding) return markup.startEnding;
  return markup.type === 'dimension' ? 'filled-arrow' : 'none';
}

export function defaultEndEnding(markup: Pick<Markup, 'type' | 'endEnding'>): MarkupLineEnding {
  if (markup.endEnding) return markup.endEnding;
  if (markup.type === 'arrow' || markup.type === 'dimension') return 'filled-arrow';
  return 'none';
}
