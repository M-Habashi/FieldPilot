// The .js specifier matters: the Vercel function build compiles this module to
// ESM without rewriting import paths, and Node's ESM loader requires the
// extension. Vite and tsc both resolve it back to the .ts source.
import {
  deviceLocationFailureReasons,
  type DeviceLocationFailureReason,
} from './device-location.js';

const diagnosticEvents = [
  'attempt_started',
  'location_started',
  'location_result',
  'upload_started',
  'upload_finished',
  'photo_saved',
  'upload_failed',
] as const;

export type PhotoDiagnosticEvent = (typeof diagnosticEvents)[number];
export type PhotoDiagnosticClient = 'chrome-ios' | 'safari-ios' | 'android' | 'other';
export type GeolocationPermissionState =
  'granted' | 'prompt' | 'denied' | 'unsupported' | 'unavailable';

export interface PhotoDiagnostic {
  event: PhotoDiagnosticEvent;
  sessionId: string;
  projectId: string;
  client?: PhotoDiagnosticClient;
  fromCamera?: boolean;
  secureContext?: boolean;
  geolocationSupported?: boolean;
  permissionState?: GeolocationPermissionState;
  locationStatus?: 'ok' | 'failed' | 'unsupported';
  locationErrorCode?: number;
  /** Why the location attempt failed, at recovery-UX granularity. */
  failureReason?: DeviceLocationFailureReason;
  /** Whether the document was visible when the event fired — WebKit suspends geolocation for hidden pages. */
  documentVisible?: boolean;
  accuracyM?: number;
  elapsedMs?: number;
  fileType?: string;
  fileSize?: number;
  stage?: string;
}

const eventSet = new Set<string>(diagnosticEvents);
const clientSet = new Set<string>(['chrome-ios', 'safari-ios', 'android', 'other']);
const permissionSet = new Set<string>([
  'granted',
  'prompt',
  'denied',
  'unsupported',
  'unavailable',
]);
const locationStatusSet = new Set<string>(['ok', 'failed', 'unsupported']);
const failureReasonSet = new Set<string>(deviceLocationFailureReasons);

function shortString(value: unknown, maximumLength = 80): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maximumLength) : undefined;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

/** Keeps production diagnostics small and explicitly excludes coordinates and user-agent strings. */
export function sanitizePhotoDiagnostic(value: unknown): PhotoDiagnostic | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const event = shortString(input.event);
  const sessionId = shortString(input.sessionId, 64);
  const projectId = shortString(input.projectId, 64);
  if (!event || !eventSet.has(event) || !sessionId || !projectId) return null;

  const client = shortString(input.client);
  const permissionState = shortString(input.permissionState);
  const locationStatus = shortString(input.locationStatus);
  const failureReason = shortString(input.failureReason);
  return {
    event: event as PhotoDiagnosticEvent,
    sessionId,
    projectId,
    ...(client && clientSet.has(client) ? { client: client as PhotoDiagnosticClient } : {}),
    ...(typeof input.fromCamera === 'boolean' ? { fromCamera: input.fromCamera } : {}),
    ...(typeof input.secureContext === 'boolean' ? { secureContext: input.secureContext } : {}),
    ...(typeof input.geolocationSupported === 'boolean'
      ? { geolocationSupported: input.geolocationSupported }
      : {}),
    ...(permissionState && permissionSet.has(permissionState)
      ? { permissionState: permissionState as GeolocationPermissionState }
      : {}),
    ...(locationStatus && locationStatusSet.has(locationStatus)
      ? { locationStatus: locationStatus as PhotoDiagnostic['locationStatus'] }
      : {}),
    ...(finiteNumber(input.locationErrorCode, 0, 10) !== undefined
      ? { locationErrorCode: finiteNumber(input.locationErrorCode, 0, 10) }
      : {}),
    ...(failureReason && failureReasonSet.has(failureReason)
      ? { failureReason: failureReason as DeviceLocationFailureReason }
      : {}),
    ...(typeof input.documentVisible === 'boolean'
      ? { documentVisible: input.documentVisible }
      : {}),
    ...(finiteNumber(input.accuracyM, 0, 100_000) !== undefined
      ? { accuracyM: Math.round(finiteNumber(input.accuracyM, 0, 100_000)!) }
      : {}),
    ...(finiteNumber(input.elapsedMs, 0, 300_000) !== undefined
      ? { elapsedMs: Math.round(finiteNumber(input.elapsedMs, 0, 300_000)!) }
      : {}),
    ...(shortString(input.fileType, 64) ? { fileType: shortString(input.fileType, 64) } : {}),
    ...(finiteNumber(input.fileSize, 0, 1_000_000_000) !== undefined
      ? { fileSize: Math.round(finiteNumber(input.fileSize, 0, 1_000_000_000)!) }
      : {}),
    ...(shortString(input.stage, 64) ? { stage: shortString(input.stage, 64) } : {}),
  };
}

export function createPhotoDiagnosticSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function detectPhotoDiagnosticClient(): PhotoDiagnosticClient {
  if (typeof navigator === 'undefined') return 'other';
  const userAgent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  if (ios && /CriOS/.test(userAgent)) return 'chrome-ios';
  if (ios) return 'safari-ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

export async function readGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) return 'unavailable';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unavailable';
  }
}

export function sendPhotoDiagnostic(diagnostic: PhotoDiagnostic): void {
  if (typeof fetch === 'undefined') return;
  void fetch('/api/client-diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnostic),
    keepalive: true,
  }).catch(() => undefined);
}
