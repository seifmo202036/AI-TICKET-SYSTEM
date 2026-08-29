import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Same-origin cookies, no CORS needed
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
    },
  },
});
