import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Lee los .env (incl. .env.<target>) desde la raíz del monorepo, igual que el frontend.
  envDir: path.resolve(__dirname, '../../'),
});
