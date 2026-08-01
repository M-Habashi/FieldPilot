import type { PDFDocumentProxy } from 'pdfjs-dist';

let current: PDFDocumentProxy | null = null;
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

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
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data }).promise;
  current = doc;
  return {
    doc,
    fingerprint: doc.fingerprints[0] ?? `size-${data.byteLength}`,
    pageCount: doc.numPages,
  };
}

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
