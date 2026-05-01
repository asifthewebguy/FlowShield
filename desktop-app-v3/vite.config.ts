import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed port; we use the default 1420 from the Tauri docs.
// HMR works through this port; production builds bundle into dist/ which
// Tauri then serves from `frontendDist` (see tauri.conf.json).
const TAURI_DEV_PORT = 1420;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development:
  //  - clearScreen=false so Rust compile errors stay visible
  //  - server.strictPort prevents falling back to a random port (Tauri webview
  //    is hardcoded to TAURI_DEV_PORT)
  //  - envPrefix lets us forward TAURI_* env vars to the frontend
  clearScreen: false,
  server: {
    port: TAURI_DEV_PORT,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    hmr: process.env.TAURI_DEV_HOST
      ? { protocol: 'ws', host: process.env.TAURI_DEV_HOST, port: 1421 }
      : undefined,
    watch: {
      // Don't waste CPU watching the Rust source
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
