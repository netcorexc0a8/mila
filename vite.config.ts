import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Можно малышу — проверка детской смеси',
        short_name: 'Можно малышу',
        description: 'Проверка банок детской смеси Nestlé по списку отозванных партий. Работает без интернета.',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f8fd',
        theme_color: '#f5f8fd',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell and recall list are precached, so checking works offline from the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,webmanifest}'],
        globIgnores: ['tesseract/**'],
        navigateFallback: 'index.html',
        // The OCR engine (~7 MB) is cached on first camera use, not on install.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-engine', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
