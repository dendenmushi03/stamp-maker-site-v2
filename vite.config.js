// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';  // ← ここが重要！

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        removeBg: resolve(__dirname, 'remove-bg.html'),
        howto: resolve(__dirname, 'howto.html')
      }
    }
  }
});
