import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        // Dashboard (privado, Clerk+MUI) y el widget de Webchat (público, liviano,
        // contenido del iframe embebible) son bundles separados.
        main: path.resolve(__dirname, 'index.html'),
        webchat: path.resolve(__dirname, 'webchat.html'),
      },
    },
  },
  envDir: '../../',
});
