import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3000';

function backendOriginForProxy(envFromFile: Record<string, string>): string {
  const raw = (process.env.VITE_API_URL || envFromFile.VITE_API_URL || '').trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* use default */
    }
  }
  return DEFAULT_BACKEND_ORIGIN;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiProxyTarget = backendOriginForProxy(env);
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3001,
      host: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          timeout: 120_000,
          proxyTimeout: 120_000,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Source maps roughly double peak memory during chunk rendering; skip in production builds.
      sourcemap: mode === 'development',
    },
    define: {
      // Use process.env so Cloud Build/Docker ENV VITE_API_URL is injected at build time
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || env.VITE_API_URL || ''),
    },
  };
});
