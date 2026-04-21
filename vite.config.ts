// Vite configuration for the Sepia renderer + Electron main/preload bundles.
// We use the array form of vite-plugin-electron so we can compile the main
// process, the renderer preload, AND the separate picker-overlay preload
// (each in its own Vite sub-build) — /simple only accepts one preload.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import rendererPlugin from 'vite-plugin-electron-renderer';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: { build: { outDir: 'dist-electron' } },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) { options.reload(); },
        vite: { build: { outDir: 'dist-electron' } },
      },
      {
        entry: 'electron/pickerPreload.ts',
        vite: { build: { outDir: 'dist-electron' } },
      },
    ]),
    rendererPlugin(),
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
