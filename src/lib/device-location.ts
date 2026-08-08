import type { PhotoLocation } from './photo-location';

export interface DeviceLocation extends PhotoLocation {
  /** Radius of the 68% confidence circle, in metres, as reported by the browser. */
  accuracy: number;
}

/**
 * A photo older than this gets no suggestion. The device only knows where the
 * *uploader* is now, so it stands in for where the camera was only while the
 * two are still the same place — shoot a floor in the morning and upload at
 * lunch and the suggestion would be the site trailer.
 */
export const PHOTO_FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Indoors and inside steel frames a phone falls back to wifi/cell positioning
 * and reports hundreds of metres to kilometres. A pin that vague reads as
 * authoritative while being useless, so it is worse than an honest "unmapped".
 * Desktop uploads are typically wifi-derived and fail this too, which is why
 * the upload path needs no separate desktop case.
 */
export const DEVICE_LOCATION_MAX_ACCURACY_M = 100;

const GEOLOCATION_TIMEOUT_MS = 5_000;
const HARD_GEOLOCATION_TIMEOUT_MS = GEOLOCATION_TIMEOUT_MS + 500;

export interface DeviceLocationOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

/**
 * A photo with no capture time is treated as stale — we cannot prove it is not.
 * Callers skip this check entirely for a photo the browser's camera just
 * produced: that one is fresh by construction, which matters on Android where
 * camera output does not reliably carry DateTimeOriginal.
 */
export function isPhotoFreshEnough(takenAt: number | null, now: number): boolean {
  if (takenAt === null) return false;
  const age = now - takenAt;
  // Clock skew between camera and browser can put a fresh photo slightly in the
  // future; allow that but not an arbitrarily post-dated timestamp.
  return age <= PHOTO_FRESHNESS_WINDOW_MS && age >= -PHOTO_FRESHNESS_WINDOW_MS;
}

export function isUsableDeviceLocation(location: DeviceLocation): boolean {
  return Number.isFinite(location.accuracy) && location.accuracy <= DEVICE_LOCATION_MAX_ACCURACY_M;
}

/**
 * Why a geolocation attempt failed, at the granularity the recovery UI and
 * production diagnostics need. `code` alone cannot tell a per-site block from
 * an OS-level one, and iOS Chrome reports a remembered per-site block by never
 * invoking either callback rather than by erroring with PERMISSION_DENIED.
 */
export const deviceLocationFailureReasons = [
  /** The browser remembers a "block" decision for this site (Permissions API: denied). */
  'site-denied',
  /** The browser considers the site granted but the OS refused the fix (error 1 while granted). */
  'system-denied',
  /** PERMISSION_DENIED with no way to tell which layer denied. */
  'denied',
  /** Geolocation is unavailable because the page is not a secure context. */
  'insecure-context',
  /** The request never resolved and the document was hidden — WebKit suspends geolocation for hidden pages. */
  'hidden-document',
  /** POSITION_UNAVAILABLE: the device could not produce a fix. */
  'unavailable',
  /** The browser reported its own TIMEOUT. */
  'timeout',
  /** Neither callback ever ran and the page was visible — the observed iOS Chrome hang. */
  'never-responded',
] as const;

export type DeviceLocationFailureReason = (typeof deviceLocationFailureReasons)[number];

export type DeviceLocationResult =
  | { status: 'ok'; location: DeviceLocation }
  | { status: 'unsupported' }
  | { status: 'failed'; code: number; reason: DeviceLocationFailureReason };

export function isLocationPermissionFailure(result: DeviceLocationResult): boolean {
  return (
    result.status === 'failed' &&
    (result.reason === 'site-denied' ||
      result.reason === 'system-denied' ||
      result.reason === 'denied')
  );
}

type PermissionSnapshot = 'granted' | 'prompt' | 'denied' | 'unknown';

const PERMISSION_QUERY_TIMEOUT_MS = 750;

/**
 * Reads the browser's remembered decision without ever showing a prompt.
 * Bounded and non-throwing: an engine without the Permissions API, or one that
 * stalls the query, degrades to 'unknown' and the position request proceeds.
 */
async function snapshotGeolocationPermission(): Promise<PermissionSnapshot> {
  if (typeof navigator === 'undefined' || typeof navigator.permissions?.query !== 'function') {
    return 'unknown';
  }
  try {
    return await Promise.race([
      navigator.permissions.query({ name: 'geolocation' }).then((status) => status.state),
      new Promise<PermissionSnapshot>((resolve) =>
        globalThis.setTimeout(() => resolve('unknown'), PERMISSION_QUERY_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return 'unknown';
  }
}

export function classifyGeolocationError(
  code: number,
  permission: PermissionSnapshot,
): DeviceLocationFailureReason {
  if (code === 1) {
    // The site-level decision said granted, yet the request was still denied:
    // the refusal came from a layer above the browser's site permission — on
    // iPhone that is Location Services or the browser app's own permission.
    if (permission === 'granted') return 'system-denied';
    return 'denied';
  }
  if (code === 3) return 'timeout';
  return 'unavailable';
}

function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Never rejects: every failure path — no support, denied permission, timeout,
 * position unavailable — comes back as a result the caller treats exactly like
 * a missing EXIF location, so a denied prompt costs the user nothing.
 *
 * A remembered per-site block short-circuits before getCurrentPosition is
 * called: asking again cannot succeed, would re-trigger the iOS Chrome hang,
 * and on engines that re-prompt would nag the user — so a blocked state costs
 * milliseconds, not a timeout, and never shows another prompt.
 */
export async function readDeviceLocation(
  options: DeviceLocationOptions = {},
): Promise<DeviceLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { status: 'unsupported' };
  }
  if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
    // The spec requires user agents to deny geolocation outside secure
    // contexts, so report it as the blocked state it is instead of asking.
    return { status: 'failed', code: 1, reason: 'insecure-context' };
  }
  const permission = await snapshotGeolocationPermission();
  if (permission === 'denied') {
    return { status: 'failed', code: 1, reason: 'site-denied' };
  }
  const timeoutMs = options.timeoutMs ?? GEOLOCATION_TIMEOUT_MS;
  return await new Promise<DeviceLocationResult>((resolve) => {
    let settled = false;
    const finish = (result: DeviceLocationResult) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(hardTimeout);
      resolve(result);
    };
    // iOS Chrome can leave getCurrentPosition pending forever after returning
    // from its native camera picker, ignoring the Geolocation API timeout.
    // Keep photo saving independent from that WebKit callback.
    const hardTimeout = globalThis.setTimeout(
      () =>
        finish({
          status: 'failed',
          code: 3,
          reason: documentHidden() ? 'hidden-document' : 'never-responded',
        }),
      options.timeoutMs === undefined ? HARD_GEOLOCATION_TIMEOUT_MS : timeoutMs + 500,
    );
    try {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          finish({
            status: 'ok',
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          }),
        (error) =>
          finish({
            status: 'failed',
            code: error.code,
            reason: classifyGeolocationError(error.code, permission),
          }),
        {
          // Start with the quickest available iOS fix. Requiring the GPS radio
          // here can time out in Chrome even when location access is granted.
          enableHighAccuracy: options.enableHighAccuracy ?? false,
          timeout: timeoutMs,
          // A recent cached fix is appropriate for a photo captured by this tap
          // and avoids making the upload wait for a fresh GPS lock.
          maximumAge: options.maximumAgeMs ?? 5 * 60_000,
        },
      );
    } catch {
      finish({ status: 'failed', code: 2, reason: 'unavailable' });
    }
  });
}
