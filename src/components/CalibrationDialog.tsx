import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PageCalibration } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface CalibrationDialogProps {
  open: boolean;
  page: number;
  referencePoints: number;
  current?: PageCalibration;
  onCancel: () => void;
  onSave: (calibration: PageCalibration) => void;
}

export function CalibrationDialog({
  open,
  page,
  referencePoints,
  current,
  onCancel,
  onSave,
}: CalibrationDialogProps) {
  const [length, setLength] = useState('');
  const [unit, setUnit] = useState<PageCalibration['unit']>('ft');

  useEffect(() => {
    if (!open) return;
    setLength(current ? String(current.referenceLength) : '10');
    setUnit(current?.unit ?? 'ft');
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const numericLength = Number(length);
  const valid = Number.isFinite(numericLength) && numericLength > 0 && referencePoints > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-e3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({
            unitsPerPoint: numericLength / referencePoints,
            unit,
            referenceLength: numericLength,
            calibratedAt: Date.now(),
          });
        }}
      >
        <h2 className="font-display text-base font-semibold text-t1">Calibrate sheet {page}</h2>
        <p className="mt-1.5 text-sm text-t2">Enter the real-world length of the line you just drew.</p>
        <div className="mt-5 grid grid-cols-[1fr_100px] gap-3">
          <div>
            <Label htmlFor="fp-cal-length">Known length</Label>
            <Input
              id="fp-cal-length"
              type="number"
              min="0.0001"
              step="any"
              autoFocus
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fp-cal-unit">Unit</Label>
            <select
              id="fp-cal-unit"
              className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-t1"
              value={unit}
              onChange={(e) => setUnit(e.target.value as PageCalibration['unit'])}
            >
              <option value="in">inches</option>
              <option value="ft">feet</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">meters</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="default" disabled={!valid}>Save calibration</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
