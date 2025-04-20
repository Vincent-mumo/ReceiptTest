import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    open: true, // Auto-open browser
    host: 'localhost', // Restrict to localhost
  },
  resolve: {
    alias: {
      jquery: 'jquery', // Ensure jQuery resolves correctly
    },
  },
  build: {
    sourcemap: true, // Debugging
    minify: 'esbuild', // Performance
  },
  optimizeDeps: {
    include: ['jquery'],
    esbuildOptions: {
      define: {
        global: 'window',
      },
    },
  },
});