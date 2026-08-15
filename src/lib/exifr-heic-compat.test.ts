import { describe, expect, it, vi } from 'vitest';
import { enableExtendedHeicRecognition } from './exifr-heic-compat';

function ftypView(options: { length?: number; brands?: string[] } = {}) {
  const length = options.length ?? 52;
  const bytes = new Uint8Array(Math.max(length, 16));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, length, false);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  const brands = options.brands ?? [
    'heic',
    'mif1',
    'MiHB',
    'MiHA',
    'heix',
    'MiHE',
    'MiPr',
    'miaf',
    'tmap',
  ];
  brands.forEach((brand, index) => {
    const offset = index === 0 ? 8 : 12 + index * 4;
    if (offset + 4 <= bytes.length) bytes.set(new TextEncoder().encode(brand), offset);
  });
  return {
    byteLength: bytes.length,
    getString: (offset: number, size: number) =>
      new TextDecoder('latin1').decode(bytes.subarray(offset, offset + size)),
    getUint32: (offset: number) => view.getUint32(offset, false),
  };
}

describe('extended HEIC recognition', () => {
  it('accepts a valid 52-byte iPhone ftyp box after the stock detector declines it', () => {
    const canHandle = vi.fn((file: ReturnType<typeof ftypView>, firstTwoBytes: number) => {
      void file;
      void firstTwoBytes;
      return false;
    });
    const parser = { canHandle };

    expect(enableExtendedHeicRecognition({ fileParsers: new Map([['heic', parser]]) })).toBe(true);
    expect(parser.canHandle(ftypView(), 0)).toBe(true);
    expect(canHandle).toHaveBeenCalledOnce();
  });

  it('retains stock recognition and patches each parser only once', () => {
    const canHandle = vi.fn((file: ReturnType<typeof ftypView>, firstTwoBytes: number) => {
      void file;
      void firstTwoBytes;
      return true;
    });
    const parser = { canHandle };
    const runtime = { fileParsers: new Map([['heic', parser]]) };

    expect(enableExtendedHeicRecognition(runtime)).toBe(true);
    const patched = parser.canHandle;
    expect(enableExtendedHeicRecognition(runtime)).toBe(true);
    expect(parser.canHandle).toBe(patched);
    expect(parser.canHandle(ftypView({ length: 16, brands: ['xxxx'] }), 1)).toBe(true);
  });

  it('rejects malformed or non-HEIC ftyp boxes', () => {
    const parser = {
      canHandle: (file: ReturnType<typeof ftypView>, firstTwoBytes: number) => {
        void file;
        void firstTwoBytes;
        return false;
      },
    };
    enableExtendedHeicRecognition({ fileParsers: new Map([['heic', parser]]) });

    expect(parser.canHandle(ftypView({ length: 18 }), 0)).toBe(false);
    expect(parser.canHandle(ftypView({ length: 16, brands: ['avif'] }), 0)).toBe(false);
    expect(parser.canHandle(ftypView({ length: 5_000, brands: ['heic'] }), 0)).toBe(false);
  });
});
