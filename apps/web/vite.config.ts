import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// @decartai/sdk is optional (Live AI try-on). When it is not installed, point imports at a stub so
// the build still succeeds and the lockfile does not need the package.
const hasDecartSdk = (() => {
  try {
    createRequire(import.meta.url).resolve('@decartai/sdk');
    return true;
  } catch {
    return false;
  }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: hasDecartSdk
      ? {}
      : { '@decartai/sdk': fileURLToPath(new URL('./src/lib/decartSdkMissing.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['@tryanywhere/engine'],
  },
});
