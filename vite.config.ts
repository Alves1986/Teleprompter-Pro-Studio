import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        clientsClaim: true,
        skipWaiting: true
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-icon.svg', 'maskable-icon.svg'],
      manifest: {
        id: '/',
        name: 'Teleprompter Pro Studio',
        short_name: 'TelePro',
        description: 'Teleprompter profissional com recursos de IA e sincronização em nuvem.',
        theme_color: '#1E2030',
        background_color: '#0A0A0F',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/maskable-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  }
});
