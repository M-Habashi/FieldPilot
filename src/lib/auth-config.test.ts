import { describe, expect, it } from 'vitest';
import { assertAuthDeploymentConfig, assertConvexDeploymentUrls } from './auth-config';

describe('assertAuthDeploymentConfig', () => {
  const valid = {
    convexCloudUrl: 'https://fearless-gopher-60.convex.cloud',
    convexSiteUrl: 'https://fearless-gopher-60.convex.site',
    authProxyDestination: 'https://fearless-gopher-60.convex.site/api/auth/:path*',
  };

  it('accepts a single Convex deployment across client, HTTP, and proxy URLs', () => {
    expect(() => assertAuthDeploymentConfig(valid)).not.toThrow();
  });

  it('rejects mixed Convex client and HTTP deployments', () => {
    expect(() =>
      assertConvexDeploymentUrls({
        convexCloudUrl: 'https://grand-kookabura-810.convex.cloud',
        convexSiteUrl: valid.convexSiteUrl,
      }),
    ).toThrow('Convex client and HTTP URLs target different deployments');
  });

  it('rejects a stale Vercel auth proxy destination', () => {
    expect(() =>
      assertAuthDeploymentConfig({
        ...valid,
        authProxyDestination: 'https://grand-kookabura-810.convex.site/api/auth/:path*',
      }),
    ).toThrow('Vercel auth proxy targets');
  });
});
