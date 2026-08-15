import { describe, expect, it, vi } from 'vitest';
import {
  heicContentType,
  inspectWithPillowFallback,
  isHeicPhoto,
  preferPillowInspection,
} from './photoExifFallback';

describe('Pillow EXIF fallback', () => {
  it('recognizes HEIC and HEIF by MIME type or filename', () => {
    expect(isHeicPhoto('photo', 'image/heic')).toBe(true);
    expect(isHeicPhoto('IMG_1.HEIF', 'application/octet-stream')).toBe(true);
    expect(isHeicPhoto('photo.jpg', 'image/jpeg')).toBe(false);
    expect(heicContentType('IMG_1.HEIC', 'application/octet-stream')).toBe('image/heic');
    expect(heicContentType('IMG_1.HEIF', '')).toBe('image/heif');
  });

  it('sends only an authenticated storage reference and accepts valid coordinates', async () => {
    const fetcher = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(Response.json({ status: 'found', latitude: 39.7, longitude: -86.1 }));
    await expect(
      inspectWithPillowFallback({
        contentType: 'image/heic',
        endpoint: 'https://fieldpilot.example/api/photo-exif-fallback',
        fetcher,
        secret: 'shared-secret',
        size: 1_874_781,
        sourceUrl: 'https://example.convex.cloud/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1',
      }),
    ).resolves.toEqual({
      status: 'found',
      location: { latitude: 39.7, longitude: -86.1 },
    });

    const [, request] = fetcher.mock.calls[0];
    expect(request.headers).toEqual({
      Authorization: 'Bearer shared-secret',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(request.body as string)).toEqual({
      sourceUrl: 'https://example.convex.cloud/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1',
      expectedSize: 1_874_781,
      expectedContentType: 'image/heic',
    });
  });

  it('does not replace stronger primary results with a weaker fallback', () => {
    const found = { status: 'found' as const, location: { latitude: 1, longitude: 2 } };
    expect(preferPillowInspection(found, { status: 'missing' })).toBe(found);
    expect(preferPillowInspection({ status: 'unreadable' }, { status: 'missing' })).toEqual({
      status: 'missing',
    });
    expect(preferPillowInspection({ status: 'missing' }, null)).toEqual({ status: 'missing' });
  });

  it('fails closed on transport errors or invalid coordinates', async () => {
    const base = {
      contentType: 'image/heic',
      endpoint: 'https://fieldpilot.example/api/photo-exif-fallback',
      secret: 'shared-secret',
      size: 10,
      sourceUrl: 'https://example.convex.cloud/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1',
    };
    await expect(
      inspectWithPillowFallback({
        ...base,
        fetcher: async () => Response.json({ status: 'found', latitude: 91, longitude: 0 }),
      }),
    ).resolves.toBeNull();
    await expect(
      inspectWithPillowFallback({
        ...base,
        fetcher: async () => {
          throw new Error('offline');
        },
      }),
    ).resolves.toBeNull();
  });
});
