import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { version } from '../package.json';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // './' makes all asset URLs relative to index.html's location, so the
  // same build works whether the app is served from the root ('/') or a
  // sub-path ('/traingraph/') without any rebuild.
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
