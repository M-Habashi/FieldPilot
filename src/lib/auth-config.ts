type AuthDeploymentConfig = {
  convexCloudUrl: string;
  convexSiteUrl: string;
  authProxyDestination: string;
};

type ConvexDeploymentUrls = Omit<AuthDeploymentConfig, 'authProxyDestination'>;

function deploymentName(url: string, expectedSuffix: string) {
  const hostname = new URL(url).hostname;
  if (!hostname.endsWith(expectedSuffix)) {
    throw new Error(`Expected ${url} to use ${expectedSuffix}.`);
  }
  return hostname.slice(0, -expectedSuffix.length);
}

/** Keep the browser client and Convex HTTP actions on one deployment. */
export function assertConvexDeploymentUrls(config: ConvexDeploymentUrls) {
  const cloudDeployment = deploymentName(config.convexCloudUrl, '.convex.cloud');
  const siteDeployment = deploymentName(config.convexSiteUrl, '.convex.site');

  if (cloudDeployment !== siteDeployment) {
    throw new Error(
      `Convex client and HTTP URLs target different deployments: ${cloudDeployment} and ${siteDeployment}.`,
    );
  }
}

/** Fail a production build before its auth proxy can target another deployment. */
export function assertAuthDeploymentConfig(config: AuthDeploymentConfig) {
  assertConvexDeploymentUrls(config);
  const proxyOrigin = new URL(config.authProxyDestination).origin;

  if (proxyOrigin !== new URL(config.convexSiteUrl).origin) {
    throw new Error(
      `Vercel auth proxy targets ${proxyOrigin}, but VITE_CONVEX_SITE_URL targets ${config.convexSiteUrl}.`,
    );
  }
}
