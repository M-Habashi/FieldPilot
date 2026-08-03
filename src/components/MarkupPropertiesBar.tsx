import { SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Markup, MarkupBoxShape, MarkupLineEnding, MarkupLineStyle } from '../types';
import type { MeasurementDisplayUnit, FractionDenominator } from '../lib/measurement';
import { LINE_ENDING_OPTIONS, LINE_STYLE_OPTIONS } from '../lib/markup-style';
import { useProject } from '../store/project';
import { Button } from './ui/button';

const TYPE_LABELS: Record<Markup['type'], string> = {
  text: 'Text box',
  pen: 'Pen',
  highlight: 'Highlight',
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  cloud: 'Revision cloud',
  callout: 'Callout',
  'cloud-plus': 'Cloud+',
  dimension: 'Dimension',
  area: 'Area',
  radius: 'Radius measurement',
  diameter: 'Diameter measurement',
  arc: 'Arc measurement',
};

const BOX_SHAPES: Array<{ value: MarkupBoxShape; label: string }> = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'none', label: 'No box' },
];

const FONT_FAMILIES = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New'] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap text-[11px] font-medium text-t3">{children}</span>;
}

function SelectField({
  label,
  value,
  ariaLabel,
  options,
  onChange,
  width = 'w-28',
}: {
  label: string;
  value: string;
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        aria-label={ariaLabel}
        className={`h-7 ${width} rounded-xs border border-line bg-surface2 px-1.5 text-xs text-t1`}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function PercentField({
  label,
  value,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-label={ariaLabel}
        className="h-7 w-16 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
        onChange={(event) => onChange(Math.max(0, Math.min(1, Number(event.target.value) / 100)))}
      />
      <span className="text-t3">%</span>
    </label>
  );
}

export function MarkupPropertiesBar() {
  const selectedMarkupId = useProject((s) => s.selectedMarkupId);
  const markup = useProject((s) => selectedMarkupId ? s.markups[selectedMarkupId] : undefined);
  const updateMarkup = useProject((s) => s.updateMarkup);
  const deleteMarkup = useProject((s) => s.deleteMarkup);
  const selectMarkup = useProject((s) => s.selectMarkup);

  return (
    <div
      className="fp-markup-properties z-35 flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-surface px-3 text-xs shadow-e1"
      aria-label="Selected markup properties"
    >
      {markup && <MarkupControls markup={markup} updateMarkup={updateMarkup} deleteMarkup={deleteMarkup} selectMarkup={selectMarkup} />}
    </div>
  );
}

function MarkupControls({
  markup,
  updateMarkup,
  deleteMarkup,
  selectMarkup,
}: {
  markup: Markup;
  updateMarkup: ReturnType<typeof useProject.getState>['updateMarkup'];
  deleteMarkup: ReturnType<typeof useProject.getState>['deleteMarkup'];
  selectMarkup: ReturnType<typeof useProject.getState>['selectMarkup'];
}) {
  const measurement = markup.type === 'dimension' || markup.type === 'area' || markup.type === 'radius' || markup.type === 'diameter' || markup.type === 'arc';
  const hasFont = markup.type === 'text' || markup.type === 'callout' || markup.type === 'cloud-plus' || measurement;
  const supportsFill = markup.type === 'text' || markup.type === 'rectangle' || markup.type === 'ellipse' || markup.type === 'cloud' || markup.type === 'callout' || markup.type === 'cloud-plus' || markup.type === 'area';
  const supportsLineStyle = markup.type !== 'highlight';
  const hasEndings = markup.type === 'line' || markup.type === 'arrow' || markup.type === 'dimension' || markup.type === 'radius' || markup.type === 'diameter' || markup.type === 'arc';
  const hasLeader = markup.type === 'callout' || markup.type === 'cloud-plus';
  const supportsBoxShape = markup.type === 'text' || markup.type === 'callout';
  const supportsCloudSize = markup.type === 'cloud' || markup.type === 'cloud-plus' || (markup.type === 'callout' && markup.lineStyle === 'cloud');
  const filled = markup.fill !== 'transparent' && markup.fill !== 'none';
  const fillColor = filled && /^#[0-9a-f]{6}/i.test(markup.fill) ? markup.fill.slice(0, 7) : '#ffffff';
  const defaultBold = markup.type === 'cloud-plus' || measurement;
  const lineStyles = markup.type === 'callout'
    ? [...LINE_STYLE_OPTIONS, { value: 'cloud' as const, label: 'Cloud' }]
    : LINE_STYLE_OPTIONS;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 border-r border-line pr-3 font-medium text-t1">
        <SlidersHorizontal className="size-3.5 text-accent" />
        {TYPE_LABELS[markup.type]}
      </div>

      <label className="flex shrink-0 items-center gap-1.5">
        <FieldLabel>Line</FieldLabel>
        <input
          type="color"
          value={markup.stroke}
          aria-label="Line color"
          className="h-6 w-7 cursor-pointer rounded-xs border border-line-strong bg-transparent p-0.5"
          onInput={(event) => updateMarkup(markup.id, { stroke: event.currentTarget.value })}
        />
      </label>

      <label className="flex shrink-0 items-center gap-1.5">
        <FieldLabel>Width</FieldLabel>
        <input
          type="number"
          min={0}
          max={30}
          step={0.5}
          value={markup.strokeWidth}
          aria-label="Line width"
          className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
          title="Set to 0 to remove the boundary"
          onChange={(event) => updateMarkup(markup.id, { strokeWidth: Math.max(0, Number(event.target.value) || 0) })}
        />
      </label>

      <PercentField
        label="Opacity"
        value={markup.opacity}
        ariaLabel="Line opacity percent"
        onChange={(opacity) => updateMarkup(markup.id, { opacity })}
      />

      {supportsLineStyle && (
        <SelectField
          label="Style"
          value={markup.lineStyle ?? 'solid'}
          ariaLabel="Boundary line style"
          options={lineStyles}
          onChange={(lineStyle) => updateMarkup(markup.id, { lineStyle: lineStyle as MarkupLineStyle })}
        />
      )}

      {hasEndings && (
        <>
          <SelectField
            label="Start"
            value={markup.startEnding ?? (markup.type === 'dimension' || markup.type === 'diameter' ? 'filled-arrow' : 'none')}
            ariaLabel="Start line ending"
            options={LINE_ENDING_OPTIONS}
            onChange={(startEnding) => updateMarkup(markup.id, { startEnding: startEnding as MarkupLineEnding })}
          />
          <SelectField
            label="End"
            value={markup.endEnding ?? (markup.type === 'arrow' || markup.type === 'dimension' || markup.type === 'diameter' ? 'filled-arrow' : 'none')}
            ariaLabel="End line ending"
            options={LINE_ENDING_OPTIONS}
            onChange={(endEnding) => updateMarkup(markup.id, { endEnding: endEnding as MarkupLineEnding })}
          />
        </>
      )}

      {supportsCloudSize && (
        <label className="flex shrink-0 items-center gap-1.5">
          <FieldLabel>Cloud size</FieldLabel>
          <input
            type="number"
            min={4}
            max={40}
            step={1}
            value={markup.cloudRadius ?? 10}
            aria-label="Cloud scallop size"
            className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
            onChange={(event) => updateMarkup(markup.id, { cloudRadius: Math.max(4, Math.min(40, Number(event.target.value) || 10)) })}
          />
        </label>
      )}

      {measurement && (
        <>
          <SelectField
            label="Units"
            value={markup.measurementUnit ?? 'calibrated'}
            ariaLabel="Measurement units"
            options={[
              { value: 'calibrated', label: 'Calibrated' },
              { value: 'in', label: 'Inches' },
              { value: 'ft', label: 'Feet' },
              { value: 'mm', label: 'Millimeters' },
              { value: 'cm', label: 'Centimeters' },
              { value: 'm', label: 'Meters' },
            ]}
            onChange={(measurementUnit) => updateMarkup(markup.id, { measurementUnit: measurementUnit as MeasurementDisplayUnit })}
          />
          {markup.type !== 'area' && (
            <SelectField
              label="Fraction"
              value={String(markup.fractionDenominator ?? 16)}
              ariaLabel="Measurement fraction precision"
              options={[1, 2, 4, 8, 16].map((value) => ({ value: String(value), label: value === 1 ? 'Whole' : `1/${value}` }))}
              onChange={(fractionDenominator) => updateMarkup(markup.id, { fractionDenominator: Number(fractionDenominator) as FractionDenominator })}
              width="w-20"
            />
          )}
        </>
      )}

      {markup.type === 'dimension' && (
        <>
          <label className="flex shrink-0 items-center gap-1.5">
            <input
              type="checkbox"
              checked={markup.witnessLines ?? true}
              aria-label="Show witness lines"
              className="accent-(--fp-accent)"
              onChange={(event) => updateMarkup(markup.id, { witnessLines: event.target.checked })}
            />
            <FieldLabel>Witness lines</FieldLabel>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Offset</FieldLabel>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={markup.extensionOffset ?? 18}
              aria-label="Dimension extension line offset"
              className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
              onChange={(event) => updateMarkup(markup.id, { extensionOffset: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })}
            />
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Extension</FieldLabel>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={markup.extensionLength ?? 18}
              aria-label="Dimension extension line length"
              className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
              onChange={(event) => updateMarkup(markup.id, { extensionLength: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })}
            />
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Arrow size</FieldLabel>
            <input
              type="number"
              min={2}
              max={60}
              step={1}
              value={markup.arrowSize ?? 8}
              aria-label="Dimension arrowhead size"
              className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
              onChange={(event) => updateMarkup(markup.id, { arrowSize: Math.max(2, Math.min(60, Number(event.target.value) || 2)) })}
            />
          </label>
        </>
      )}

      {supportsBoxShape && (
        <SelectField
          label="Shape"
          value={markup.boxShape ?? 'rectangle'}
          ariaLabel="Text box shape"
          options={BOX_SHAPES}
          onChange={(boxShape) => updateMarkup(markup.id, { boxShape: boxShape as MarkupBoxShape })}
        />
      )}

      {supportsFill && (
        <>
          <div className="flex shrink-0 items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={filled}
                aria-label="Enable fill"
                className="accent-(--fp-accent)"
                onChange={(event) => updateMarkup(markup.id, { fill: event.target.checked ? '#ffffff' : 'transparent' })}
              />
              <FieldLabel>Fill</FieldLabel>
            </label>
            <input
              type="color"
              value={fillColor}
              disabled={!filled}
              aria-label="Fill color"
              className="h-6 w-7 cursor-pointer rounded-xs border border-line-strong bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-35"
              onInput={(event) => updateMarkup(markup.id, { fill: event.currentTarget.value })}
            />
          </div>
          <PercentField
            label="Fill opacity"
            value={markup.fillOpacity ?? 1}
            ariaLabel="Fill opacity percent"
            onChange={(fillOpacity) => updateMarkup(markup.id, { fillOpacity })}
          />
        </>
      )}

      {hasLeader && (
        <>
          <div className="h-5 w-px shrink-0 bg-line" />
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Leader</FieldLabel>
            <input
              type="color"
              value={markup.leaderStroke ?? markup.stroke}
              aria-label="Leader line color"
              className="h-6 w-7 cursor-pointer rounded-xs border border-line-strong bg-transparent p-0.5"
              onInput={(event) => updateMarkup(markup.id, { leaderStroke: event.currentTarget.value })}
            />
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Leader width</FieldLabel>
            <input
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={markup.leaderStrokeWidth ?? markup.strokeWidth}
              aria-label="Leader line width"
              className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
              onChange={(event) => updateMarkup(markup.id, { leaderStrokeWidth: Math.max(0.5, Number(event.target.value) || 0.5) })}
            />
          </label>
          <PercentField
            label="Leader opacity"
            value={markup.leaderOpacity ?? 1}
            ariaLabel="Leader opacity percent"
            onChange={(leaderOpacity) => updateMarkup(markup.id, { leaderOpacity })}
          />
          <SelectField
            label="Leader style"
            value={markup.leaderLineStyle ?? 'solid'}
            ariaLabel="Leader line style"
            options={LINE_STYLE_OPTIONS}
            onChange={(leaderLineStyle) => updateMarkup(markup.id, { leaderLineStyle: leaderLineStyle as MarkupLineStyle })}
          />
          <SelectField
            label="Tip"
            value={markup.leaderEnding ?? 'filled-arrow'}
            ariaLabel="Leader tip style"
            options={LINE_ENDING_OPTIONS}
            onChange={(leaderEnding) => updateMarkup(markup.id, { leaderEnding: leaderEnding as MarkupLineEnding })}
          />
        </>
      )}

      {hasFont && (
        <>
          <div className="h-5 w-px shrink-0 bg-line" />
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Text</FieldLabel>
            <input
              type="color"
              value={markup.textColor ?? markup.stroke}
              aria-label="Text color"
              className="h-6 w-7 cursor-pointer rounded-xs border border-line-strong bg-transparent p-0.5"
              onInput={(event) => updateMarkup(markup.id, { textColor: event.currentTarget.value })}
            />
          </label>
          <SelectField
            label="Font"
            value={markup.fontFamily ?? 'Helvetica'}
            ariaLabel="Font family"
            options={FONT_FAMILIES.map((font) => ({ value: font, label: font }))}
            width="w-32"
            onChange={(fontFamily) => updateMarkup(markup.id, { fontFamily })}
          />
          <label className="flex shrink-0 items-center gap-1.5">
            <FieldLabel>Size</FieldLabel>
            <input
              type="number"
              min={8}
              max={96}
              value={markup.fontSize}
              aria-label="Font size"
              className="h-7 w-14 rounded-xs border border-line bg-surface2 px-2 font-mono text-xs text-t1"
              onChange={(event) => updateMarkup(markup.id, { fontSize: Math.max(8, Number(event.target.value) || 8) })}
            />
          </label>
          <button
            type="button"
            aria-label="Bold text"
            aria-pressed={markup.fontBold ?? defaultBold}
            className="h-7 min-w-7 rounded-xs border border-line bg-surface2 px-2 font-bold text-t1 aria-pressed:border-accent aria-pressed:bg-accent-subtle"
            onClick={() => updateMarkup(markup.id, { fontBold: !(markup.fontBold ?? defaultBold) })}
          >B</button>
          <button
            type="button"
            aria-label="Italic text"
            aria-pressed={markup.fontItalic ?? false}
            className="h-7 min-w-7 rounded-xs border border-line bg-surface2 px-2 italic text-t1 aria-pressed:border-accent aria-pressed:bg-accent-subtle"
            onClick={() => updateMarkup(markup.id, { fontItalic: !(markup.fontItalic ?? false) })}
          >I</button>
          <SelectField
            label="Align"
            value={markup.textAlign ?? 'center'}
            ariaLabel="Text alignment"
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            width="w-20"
            onChange={(textAlign) => updateMarkup(markup.id, { textAlign: textAlign as Markup['textAlign'] })}
          />
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center border-l border-line pl-2">
        <Button variant="text" size="iconXs" className="text-danger hover:text-danger" aria-label="Delete selected markup" title="Delete markup" onClick={() => deleteMarkup(markup.id)}>
          <Trash2 />
        </Button>
        <Button variant="text" size="iconXs" aria-label="Close markup properties" title="Close" onClick={() => selectMarkup(null)}>
          <X />
        </Button>
      </div>
    </>
  );
}
