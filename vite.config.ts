import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Se sirve desde GitHub Pages bajo /excabit/ (docs/05 §1).
  base: process.env.GITHUB_ACTIONS ? '/excabit/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
