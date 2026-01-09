import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/contentScript.jsx'),
      },
      output: {
        entryFileNames: 'contentScript.bundle.js',
        dir: 'dist',
        format: 'iife',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    target: 'esnext',
  },
});
