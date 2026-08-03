import type { Markup, PageCalibration, Task } from '../types';
import { getPhotoBlob, savePhotoBlob } from './photos';

interface ExportedPhoto {
  id: string;
  name: string;
  dataUrl: string;
}

interface ExportFile {
  app: 'fieldpilot';
  version: 1 | 2;
  exportedAt: string;
  fileName: string | null;
  fingerprint: string | null;
  nextSeq: number;
  tasks: Record<string, Task>;
  markups?: Record<string, Markup>;
  calibrations?: Record<number, PageCalibration>;
  photos: ExportedPhoto[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportProject(opts: {
  fileName: string | null;
  fingerprint: string | null;
  nextSeq: number;
  tasks: Record<string, Task>;
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
}): Promise<void> {
  const photos: ExportedPhoto[] = [];
  for (const task of Object.values(opts.tasks)) {
    for (const photo of task.photos) {
      const blob = await getPhotoBlob(photo.id);
      if (!blob) continue;
      photos.push({ id: photo.id, name: photo.name, dataUrl: await blobToDataUrl(blob) });
    }
  }
  const payload: ExportFile = {
    app: 'fieldpilot',
    version: 2,
    exportedAt: new Date().toISOString(),
    fileName: opts.fileName,
    fingerprint: opts.fingerprint,
    nextSeq: opts.nextSeq,
    tasks: opts.tasks,
    markups: opts.markups,
    calibrations: opts.calibrations,
    photos,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = (opts.fileName ?? 'project').replace(/\.pdf$/i, '');
  a.download = `${base}-fieldpilot-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProject(
  file: File,
): Promise<{
  tasks: Record<string, Task>;
  nextSeq: number;
  markups: Record<string, Markup>;
  calibrations: Record<number, PageCalibration>;
}> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportFile;
  if (data.app !== 'fieldpilot' || !data.tasks) {
    throw new Error('Not a FieldPilot export file.');
  }
  for (const photo of data.photos ?? []) {
    await savePhotoBlob(photo.id, await dataUrlToBlob(photo.dataUrl));
  }
  return {
    tasks: data.tasks,
    nextSeq: data.nextSeq ?? Object.keys(data.tasks).length + 1,
    markups: data.markups ?? {},
    calibrations: data.calibrations ?? {},
  };
}
