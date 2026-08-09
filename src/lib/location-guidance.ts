import type { DeviceLocationResult } from './device-location';
import { isLocationPermissionFailure } from './device-location';

export type LocationClient = 'chrome-ios' | 'safari-ios' | 'android' | 'other';

export function detectLocationClient(): LocationClient {
  if (typeof navigator === 'undefined') return 'other';
  const userAgent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  if (ios && /CriOS/.test(userAgent)) return 'chrome-ios';
  if (ios) return 'safari-ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/**
 * Short, device-specific steps shown when a location request is blocked.
 * iPhone permission state lives in two places — the phone's Settings app and
 * the browser's own per-site decision — and both must allow the site, so the
 * guidance always lists both, with the browser's per-site switch first because
 * production traces show that is the one users miss.
 */
export interface LocationRecoveryGuidance {
  title: string;
  steps: string[];
}

/** The single short line for the transient error notice. */
export function locationFailureMessage(result: DeviceLocationResult): string {
  if (result.status === 'ok') return '';
  if (result.status === 'unsupported') return 'Location is not supported on this device.';
  switch (result.reason) {
    case 'site-denied':
    case 'system-denied':
    case 'denied':
      return 'Location access is blocked.';
    case 'insecure-context':
      return 'Location needs a secure (HTTPS) connection.';
    case 'timeout':
    case 'never-responded':
    case 'hidden-document':
      return 'Location timed out. Try again.';
    default:
      return 'Current location is unavailable.';
  }
}

export function locationRecoveryGuidance(
  client: LocationClient,
  result: DeviceLocationResult,
): LocationRecoveryGuidance | null {
  if (!isLocationPermissionFailure(result)) return null;
  if (client === 'chrome-ios') {
    return {
      title: 'Turn location back on for Chrome',
      steps: [
        'In Chrome, tap the icon to the left of the address bar, open Permissions, and set Location to Allow. (No Location row? Open ⋯ → Settings → Content Settings.)',
        'In the iPhone Settings app, tap Chrome → Location and choose “While Using the App”, with Precise Location on.',
        'Reload this page, then tap the location button again.',
      ],
    };
  }
  if (client === 'safari-ios') {
    return {
      title: 'Turn location back on for Safari',
      steps: [
        'In Safari, tap “ᴀA” in the address bar → Website Settings → Location → Allow.',
        'In the iPhone Settings app, tap Safari (under Apps) → Location and choose “While Using the App”.',
        'Reload this page, then tap the location button again.',
      ],
    };
  }
  return {
    title: 'Turn location back on for this site',
    steps: [
      'Open your browser’s site settings for this page and set Location to Allow.',
      'Make sure your device allows this browser to use location.',
      'Reload this page, then try again.',
    ],
  };
}
