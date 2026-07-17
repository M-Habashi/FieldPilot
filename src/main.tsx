import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/source-serif-4';
import './index.css';
import App from './App';

const viewerCursorSources = [
  '/cursors/macos-pan-24.png',
  '/cursors/macos-grabbing-24.png',
];

async function renderApp() {
  await Promise.allSettled(
    viewerCursorSources.map(async (src) => {
      const image = new Image();
      image.decoding = 'sync';
      image.src = src;
      await image.decode();
    }),
  );

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void renderApp();
