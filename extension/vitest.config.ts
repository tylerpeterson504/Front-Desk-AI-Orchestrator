import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    // Enable module isolation between tests
    isolate: true,
    // Ensure TypeScript files are transformed
    transformMode: {
      web: [/\.ts$/]
    },
    server: {
      deps: {
        inline: ['**/*.ts', '**/*.js']
      }
    }
  },
  resolve: {
    alias: {
      // Map bare imports if needed
    }
  },
});