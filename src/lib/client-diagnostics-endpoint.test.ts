import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/client-diagnostics';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
    },
    end() {
      this.ended = true;
    },
    setHeader() {},
  };
}

afterEach(() => vi.restoreAllMocks());

describe('client diagnostics endpoint', () => {
  it('writes a sanitized same-origin event to the live log', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = createResponse();
    handler(
      {
        method: 'POST',
        headers: { origin: 'https://fieldpilot-app.vercel.app' },
        body: {
          event: 'location_result',
          sessionId: 'attempt-1',
          projectId: 'project-1',
          locationStatus: 'failed',
          locationErrorCode: 1,
          failureReason: 'site-denied',
          documentVisible: true,
          accuracyM: 12,
          latitude: 39.7,
          longitude: -86.1,
        },
      },
      response,
    );

    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(log).toHaveBeenCalledOnce();
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('PHOTO_UPLOAD_DIAGNOSTIC');
    expect(logged).toContain('"failureReason":"site-denied"');
    expect(logged).toContain('"documentVisible":true');
    expect(logged).not.toContain('latitude');
    expect(logged).not.toContain('longitude');
  });

  it('rejects cross-origin events', () => {
    const response = createResponse();
    handler(
      {
        method: 'POST',
        headers: { origin: 'https://untrusted.example' },
        body: { event: 'upload_started', sessionId: 'attempt-2', projectId: 'project-1' },
      },
      response,
    );
    expect(response.statusCode).toBe(403);
  });
});
