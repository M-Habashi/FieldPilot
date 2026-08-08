import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_LOCATION_MAX_ACCURACY_M,
  PHOTO_FRESHNESS_WINDOW_MS,
  isPhotoFreshEnough,
  isUsableDeviceLocation,
  readDeviceLocation,
} from './device-location';

const now = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isPhotoFreshEnough', () => {
  it('accepts a photo taken moments ago', () => {
    expect(isPhotoFreshEnough(now - 60_000, now)).toBe(true);
  });

  it('rejects a photo taken before the window', () => {
    expect(isPhotoFreshEnough(now - PHOTO_FRESHNESS_WINDOW_MS - 1, now)).toBe(false);
  });

  it('accepts a photo taken exactly at the window edge', () => {
    expect(isPhotoFreshEnough(now - PHOTO_FRESHNESS_WINDOW_MS, now)).toBe(true);
  });

  it('rejects a photo with no capture time, since staleness cannot be ruled out', () => {
    expect(isPhotoFreshEnough(null, now)).toBe(false);
  });

  it('tolerates mild camera clock skew into the future', () => {
    expect(isPhotoFreshEnough(now + 60_000, now)).toBe(true);
  });

  it('rejects a wildly post-dated capture time', () => {
    expect(isPhotoFreshEnough(now + PHOTO_FRESHNESS_WINDOW_MS + 1, now)).toBe(false);
  });
});

describe('isUsableDeviceLocation', () => {
  it('accepts a tight GPS fix', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: 12 })).toBe(true);
  });

  it('rejects a wifi-derived fix that is too vague to pin', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: 2_500 })).toBe(
      false,
    );
  });

  it('accepts a fix exactly at the accuracy ceiling', () => {
    expect(
      isUsableDeviceLocation({
        latitude: 51.5,
        longitude: -0.12,
        accuracy: DEVICE_LOCATION_MAX_ACCURACY_M,
      }),
    ).toBe(true);
  });

  it('rejects a non-finite accuracy', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: Number.NaN })).toBe(
      false,
    );
  });
});

describe('readDeviceLocation', () => {
  it('uses a quick cached fix so iPhone uploads do not wait for a GPS lock', async () => {
    let requestedOptions: PositionOptions | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition(
          success: PositionCallback,
          _error: PositionErrorCallback,
          options?: PositionOptions,
        ) {
          requestedOptions = options;
          success({
            coords: { latitude: 39.7, longitude: -86.1, accuracy: 18 },
          } as GeolocationPosition);
        },
      },
    });

    await expect(readDeviceLocation()).resolves.toMatchObject({ status: 'ok' });
    expect(requestedOptions).toEqual({
      enableHighAccuracy: false,
      timeout: 5_000,
      maximumAge: 5 * 60_000,
    });
  });

  it('stops waiting when iPhone Chrome ignores the browser geolocation timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition() {
          // Reproduces the observed iOS Chrome failure: neither callback runs.
        },
      },
    });

    const result = readDeviceLocation();
    await vi.advanceTimersByTimeAsync(5_500);

    await expect(result).resolves.toEqual({ status: 'failed', code: 3 });
  });
});
