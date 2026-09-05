import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, '../dist/extension'),
    rollupOptions: {
      input: resolve(__dirname, 'src/manifest.json')
    }
  }
});