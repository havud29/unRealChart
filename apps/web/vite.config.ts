import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app has no backend and no sample assets — the whole thing is the
      // shell — so precaching it makes unRealChart genuinely usable with the
      // network off, which is the state a musician on a stand is usually in.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'unRealChart',
        short_name: 'unRealChart',
        description: 'Chord charts you can read, edit and play.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b2730',
        theme_color: '#1b2730',
        categories: ['music', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Charts live in IndexedDB and are never fetched, so there is no runtime
        // caching to configure: if it is not in the shell, we do not need the
        // network for it.
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        // Off in dev: a service worker caching a dev server is a debugging trap.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      // Workspace packages ship TypeScript source, not a build. Aliasing
      // straight to source keeps HMR working across package boundaries.
      '@unrealchart/ireal-format': src('../../packages/ireal-format/src/index.ts'),
      '@unrealchart/song-model': src('../../packages/song-model/src/index.ts'),
      '@unrealchart/groove-engine': src('../../packages/groove-engine/src/index.ts'),
      '@unrealchart/audio-host': src('../../packages/audio-host/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
