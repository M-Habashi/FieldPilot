import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

let current: PDFDocumentProxy | null = null;

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  fingerprint: string;
  pageCount: number;
}

export async function openPdf(data: ArrayBuffer): Promise<OpenedPdf> {
  if (current) {
    void current.destroy();
    current = null;
  }
  const doc = await pdfjs.getDocument({ data }).promise;
  current = doc;
  return {
    doc,
    fingerprint: doc.fingerprints[0] ?? `size-${data.byteLength}`,
    pageCount: doc.numPages,
  };
}

export type { PDFDocumentProxy };
