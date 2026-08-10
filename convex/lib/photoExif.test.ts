import { describe, expect, it } from 'vitest';
import {
  extractExifPhotoLocation,
  inspectExifPhotoLocation,
  photoByteFingerprint,
} from './photoExif';

function jpegWithGpsExif(): Blob {
  const tiff = new Uint8Array(128);
  const view = new DataView(tiff.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const rational = (offset: number, numerator: number, denominator = 1) => {
    u32(offset, numerator);
    u32(offset + 4, denominator);
  };

  tiff.set([0x49, 0x49], 0);
  u16(2, 42);
  u32(4, 8);
  u16(8, 1);
  u16(10, 0x8825);
  u16(12, 4);
  u32(14, 1);
  u32(18, 26);

  u16(26, 4);
  u16(28, 1);
  u16(30, 2);
  u32(32, 2);
  tiff.set([0x4e, 0], 36);
  u16(40, 2);
  u16(42, 5);
  u32(44, 3);
  u32(48, 80);
  u16(52, 3);
  u16(54, 2);
  u32(56, 2);
  tiff.set([0x57, 0], 60);
  u16(64, 4);
  u16(66, 5);
  u32(68, 3);
  u32(72, 104);

  rational(80, 39);
  rational(88, 46);
  rational(96, 625, 100);
  rational(104, 86);
  rational(112, 9);
  rational(120, 2916, 100);

  const exifHeader = new TextEncoder().encode('Exif\0\0');
  const segmentLength = exifHeader.length + tiff.length + 2;
  return new Blob(
    [
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segmentLength >> 8, segmentLength & 0xff]),
      exifHeader,
      tiff,
      new Uint8Array([0xff, 0xd9]),
    ],
    { type: 'image/jpeg' },
  );
}

function motionPhotoWithLocation(location: string): Blob {
  const locationBytes = new TextEncoder().encode(location);
  const atomSize = 8 + 4 + locationBytes.length;
  const atom = new Uint8Array(atomSize);
  const view = new DataView(atom.buffer);
  view.setUint32(0, atomSize, false);
  atom.set([0xa9, 0x78, 0x79, 0x7a], 4);
  atom.set([0, 0, 0, 0], 8);
  atom.set(locationBytes, 12);
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), atom], {
    type: 'image/jpeg',
  });
}

describe('extractExifPhotoLocation', () => {
  it('reads GPS coordinates from an uploaded original photo', async () => {
    await expect(extractExifPhotoLocation(jpegWithGpsExif())).resolves.toEqual({
      latitude: 39.76840277777778,
      longitude: -86.1581,
    });
  });

  it('returns no location when the upload has no EXIF GPS block', async () => {
    await expect(
      extractExifPhotoLocation(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])])),
    ).resolves.toBeNull();
  });

  it('distinguishes a missing GPS block from an unreadable image', async () => {
    await expect(
      inspectExifPhotoLocation(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])])),
    ).resolves.toEqual({ status: 'missing' });
    const unreadable = {
      arrayBuffer: async () => {
        throw new Error('read failed');
      },
    } as unknown as Blob;
    await expect(inspectExifPhotoLocation(unreadable)).resolves.toEqual({ status: 'unreadable' });
  });

  it('reads the QuickTime location retained in a Samsung Motion Photo', async () => {
    await expect(
      inspectExifPhotoLocation(motionPhotoWithLocation('+40.4247-086.9120/')),
    ).resolves.toEqual({
      status: 'found',
      location: { latitude: 40.4247, longitude: -86.912 },
    });
  });

  it('rejects an invalid Motion Photo location', async () => {
    await expect(
      inspectExifPhotoLocation(motionPhotoWithLocation('+91.0000-086.9120/')),
    ).resolves.toEqual({
      status: 'missing',
    });
  });

  it('fingerprints identical bytes consistently without exposing the bytes', async () => {
    const first = await photoByteFingerprint(new Blob(['same bytes']));
    const second = await photoByteFingerprint(new TextEncoder().encode('same bytes').buffer);
    expect(first).toHaveLength(24);
    expect(first).toBe(second);
  });
});
