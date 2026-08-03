import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { assertAuthDeploymentConfig, assertConvexDeploymentUrls } from './src/lib/auth-config';

type VercelConfig = {
  rewrites?: Array<{ source?: string; destination?: string }>;
};

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

  if (!env.VITE_CONVEX_URL || !env.VITE_CONVEX_SITE_URL) {
    throw new Error(
      'VITE_CONVEX_URL and VITE_CONVEX_SITE_URL are required. Use the committed development defaults or copy .env.example to .env.local for a personal deployment.',
    );
  }

  assertConvexDeploymentUrls({
    convexCloudUrl: env.VITE_CONVEX_URL,
    convexSiteUrl: env.VITE_CONVEX_SITE_URL,
  });

  if (process.env.VERCEL === '1') {
    const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
    const authProxyDestination = vercelConfig.rewrites?.find(
      (rewrite) => rewrite.source === '/api/auth/:path*',
    )?.destination;

    if (!env.VITE_CONVEX_URL || !env.VITE_CONVEX_SITE_URL || !authProxyDestination) {
      throw new Error(
        'Production auth requires VITE_CONVEX_URL, VITE_CONVEX_SITE_URL, and the Vercel /api/auth rewrite.',
      );
    }

    assertAuthDeploymentConfig({
      convexCloudUrl: env.VITE_CONVEX_URL,
      convexSiteUrl: env.VITE_CONVEX_SITE_URL,
      authProxyDestination,
    });
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
