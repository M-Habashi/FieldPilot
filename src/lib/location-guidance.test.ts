import { describe, expect, it } from 'vitest';
import type { DeviceLocationResult } from './device-location';
import { locationFailureMessage, locationRecoveryGuidance } from './location-guidance';

const siteDenied: DeviceLocationResult = { status: 'failed', code: 1, reason: 'site-denied' };
const systemDenied: DeviceLocationResult = { status: 'failed', code: 1, reason: 'system-denied' };
const timedOut: DeviceLocationResult = { status: 'failed', code: 3, reason: 'timeout' };
const hung: DeviceLocationResult = { status: 'failed', code: 3, reason: 'never-responded' };
const unavailable: DeviceLocationResult = { status: 'failed', code: 2, reason: 'unavailable' };

describe('locationFailureMessage', () => {
  it('reports every denial flavour as blocked', () => {
    expect(locationFailureMessage(siteDenied)).toBe('Location access is blocked.');
    expect(locationFailureMessage(systemDenied)).toBe('Location access is blocked.');
    expect(locationFailureMessage({ status: 'failed', code: 1, reason: 'denied' })).toBe(
      'Location access is blocked.',
    );
  });

  it('reports the silent iOS Chrome hang as a timeout the user can retry', () => {
    expect(locationFailureMessage(hung)).toBe('Location timed out. Try again.');
    expect(locationFailureMessage(timedOut)).toBe('Location timed out. Try again.');
  });

  it('reports an insecure context explicitly', () => {
    expect(
      locationFailureMessage({ status: 'failed', code: 1, reason: 'insecure-context' }),
    ).toContain('HTTPS');
  });

  it('reports unavailable positions and unsupported devices', () => {
    expect(locationFailureMessage(unavailable)).toBe('Current location is unavailable.');
    expect(locationFailureMessage({ status: 'unsupported' })).toBe(
      'Location is not supported on this device.',
    );
  });
});

describe('locationRecoveryGuidance', () => {
  it('gives iPhone Chrome users both the per-site switch and the iOS Settings path', () => {
    const guidance = locationRecoveryGuidance('chrome-ios', siteDenied);
    expect(guidance).not.toBeNull();
    expect(guidance!.title).toContain('Chrome');
    const text = guidance!.steps.join(' ');
    expect(text).toContain('address bar');
    expect(text).toContain('Settings app');
    expect(text).toContain('Precise Location');
    expect(text).toContain('Reload');
  });

  it('gives iPhone Safari users the Website Settings path', () => {
    const guidance = locationRecoveryGuidance('safari-ios', systemDenied);
    expect(guidance).not.toBeNull();
    expect(guidance!.title).toContain('Safari');
    expect(guidance!.steps.join(' ')).toContain('Website Settings');
  });

  it('falls back to generic browser wording elsewhere', () => {
    const guidance = locationRecoveryGuidance('other', siteDenied);
    expect(guidance).not.toBeNull();
    expect(guidance!.steps.join(' ')).toContain('site settings');
  });

  it('offers no permission steps for failures that are not permission denials', () => {
    expect(locationRecoveryGuidance('chrome-ios', timedOut)).toBeNull();
    expect(locationRecoveryGuidance('chrome-ios', hung)).toBeNull();
    expect(locationRecoveryGuidance('chrome-ios', unavailable)).toBeNull();
    expect(locationRecoveryGuidance('chrome-ios', { status: 'unsupported' })).toBeNull();
    expect(
      locationRecoveryGuidance('chrome-ios', {
        status: 'ok',
        location: { latitude: 39.7, longitude: -86.1, accuracy: 10 },
      }),
    ).toBeNull();
  });
});
