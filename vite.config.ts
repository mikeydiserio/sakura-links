import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
      },
      output: {
        manualChunks: {
          three: ['three'],
          physics: ['cannon-es'],
        },
      },
    },
  },
});
