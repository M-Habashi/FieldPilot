import { StrictMode } from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated } from 'convex/react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App';
import { AuthLoadingScreen } from './components/AuthScreen';
import { MarketingApp } from './components/marketing/MarketingApp';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error('VITE_CONVEX_URL is not configured');
const convex = new ConvexReactClient(convexUrl);

const viewerCursorSources = ['/cursors/macos-pan-24.png', '/cursors/macos-grabbing-24.png'];

function preloadViewerCursors() {
  for (const src of viewerCursorSources) {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    void image.decode().catch(() => undefined);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <AuthLoading>
        <AuthLoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <MarketingApp />
      </Unauthenticated>
      <Authenticated>
        <App />
      </Authenticated>
    </ConvexAuthProvider>
  </StrictMode>,
);

preloadViewerCursors();
