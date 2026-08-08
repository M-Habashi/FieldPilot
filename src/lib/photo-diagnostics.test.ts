import { describe, expect, it } from 'vitest';
import { sanitizePhotoDiagnostic } from './photo-diagnostics';

describe('sanitizePhotoDiagnostic', () => {
  it('keeps the bounded fields needed to diagnose an iPhone location result', () => {
    expect(
      sanitizePhotoDiagnostic({
        event: 'location_result',
        sessionId: 'attempt-1',
        projectId: 'project-1',
        client: 'chrome-ios',
        permissionState: 'granted',
        locationStatus: 'ok',
        accuracyM: 12.4,
        elapsedMs: 834.7,
      }),
    ).toEqual({
      event: 'location_result',
      sessionId: 'attempt-1',
      projectId: 'project-1',
      client: 'chrome-ios',
      permissionState: 'granted',
      locationStatus: 'ok',
      accuracyM: 12,
      elapsedMs: 835,
    });
  });

  it('never copies coordinates, filenames, or raw user-agent strings', () => {
    const result = sanitizePhotoDiagnostic({
      event: 'photo_saved',
      sessionId: 'attempt-2',
      projectId: 'project-1',
      latitude: 39.7,
      longitude: -86.1,
      fileName: 'private-photo.jpg',
      userAgent: 'raw browser fingerprint',
    });
    expect(result).toEqual({
      event: 'photo_saved',
      sessionId: 'attempt-2',
      projectId: 'project-1',
    });
  });

  it('rejects unknown events and missing attempt identifiers', () => {
    expect(
      sanitizePhotoDiagnostic({
        event: 'coordinates_collected',
        sessionId: 'attempt-3',
        projectId: 'project-1',
      }),
    ).toBeNull();
    expect(sanitizePhotoDiagnostic({ event: 'upload_started' })).toBeNull();
  });
});
