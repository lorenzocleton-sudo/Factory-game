import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under the GitHub Pages sub-path
  // (https://<user>.github.io/<repo>/) as well as at a domain root.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
  },
});
