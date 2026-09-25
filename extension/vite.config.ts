import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [
    webExtension({
      // manifest.json lives at the extension root; entry points (background,
      // content scripts, popup) are resolved from it by the plugin.
      manifest: () => JSON.parse(readFileSync(fileURLToPath(new URL('./manifest.json', import.meta.url)), 'utf-8')),
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
