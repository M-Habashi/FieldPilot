import type { ExifPhotoInspection } from './photoExif';

const fallbackTimeoutMs = 25_000;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

interface PillowFallbackOptions {
  contentType: string;
  endpoint?: string;
  fetcher?: Fetcher;
  secret?: string;
  size: number;
  sourceUrl: string;
}

function validLocation(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function heicContentType(
  fileName: string,
  contentType: string,
): 'image/heic' | 'image/heif' | null {
  const normalizedType = contentType.trim().toLowerCase();
  const normalizedName = fileName.trim().toLowerCase();
  if (normalizedType === 'image/heic' || normalizedType === 'image/heif') {
    return normalizedType;
  }
  if (normalizedName.endsWith('.heic')) return 'image/heic';
  if (normalizedName.endsWith('.heif')) return 'image/heif';
  return null;
}

export function isHeicPhoto(fileName: string, contentType: string): boolean {
  return heicContentType(fileName, contentType) !== null;
}

export function preferPillowInspection(
  primary: ExifPhotoInspection,
  fallback: ExifPhotoInspection | null,
): ExifPhotoInspection {
  if (fallback?.status === 'found') return fallback;
  if (primary.status === 'unreadable' && fallback?.status === 'missing') return fallback;
  return primary;
}

export async function inspectWithPillowFallback({
  contentType,
  endpoint = process.env.PHOTO_EXIF_FALLBACK_URL?.trim(),
  fetcher = fetch,
  secret = process.env.PHOTO_EXIF_FALLBACK_SECRET?.trim(),
  size,
  sourceUrl,
}: PillowFallbackOptions): Promise<ExifPhotoInspection | null> {
  if (!endpoint || !secret || size <= 0) return null;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), fallbackTimeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceUrl,
        expectedSize: size,
        expectedContentType: contentType.trim().toLowerCase(),
      }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = (await response.json()) as {
      status?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    if (result.status === 'found' && validLocation(result.latitude, result.longitude)) {
      return {
        status: 'found',
        location: { latitude: result.latitude, longitude: result.longitude as number },
      };
    }
    if (result.status === 'missing' || result.status === 'unreadable') {
      return { status: result.status };
    }
    return null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
