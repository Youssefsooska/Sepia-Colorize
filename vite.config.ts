// Vite configuration for the Sepia renderer + Electron main/preload bundles.
// vite-plugin-electron handles compiling electron/*.ts into dist-electron/ during
// dev so the app can launch via `npm run dev`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Renderer is the React app under src/ — served by Vite dev server
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
