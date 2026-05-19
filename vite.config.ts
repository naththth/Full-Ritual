import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANT: troque 'full-ritual' pelo nome real do repositório no GitHub.
// Se for usar domínio customizado apontado para a raiz, mude para base: '/'.
export default defineConfig({
  base: '/full-ritual/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Full Ritual',
        short_name: 'Ritual',
        description: 'Cuidado em cinco dimensões. Pele, corpo, mente, dieta, espírito.',
        theme_color: '#4A2C22',
        background_color: '#F5EEDF',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/full-ritual/',
        start_url: '/full-ritual/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
