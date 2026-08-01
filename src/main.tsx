import { StrictMode } from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated } from 'convex/react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/source-serif-4';
import './index.css';
import App from './App';
import { AuthLoadingScreen, SignInScreen } from './components/AuthScreen';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error('VITE_CONVEX_URL is not configured');
const convex = new ConvexReactClient(convexUrl);

document.documentElement.dataset.design = localStorage.getItem('fp:design') ?? 'blueprint';

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
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <App />
      </Authenticated>
    </ConvexAuthProvider>
  </StrictMode>,
);

preloadViewerCursors();
