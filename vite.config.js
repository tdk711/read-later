import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// During `npm run dev` the UI runs on Vite (5173) and the sync API runs on
// `wrangler dev` (8787). The proxy keeps everything same-origin for the
// browser, so no CORS configuration is needed locally.
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
};

export default defineConfig({
  // Relative base keeps the build portable (root domain, GitHub Pages subpath, etc.)
  base: './',
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Read-It-Later',
        short_name: 'Read Later',
        description: 'A simple read-it-later PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Never answer a navigation for the API from the app shell.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Sync requests must always hit the network. The app already has
            // its own offline copy in IndexedDB, so caching API responses here
            // would only risk stale data and leaked tokens in cache storage.
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
            method: 'POST',
          },
          {
            urlPattern:
              /^https:\/\/(www\.google\.com\/s2\/favicons|icons\.duckduckgo\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'favicons',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
