import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

// `npm run dev` hem React istemcisini hem de Worker + Durable Object'i
// (workerd üzerinde) aynı süreçte çalıştırır; ayrı bir sunucu gerekmez.
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
