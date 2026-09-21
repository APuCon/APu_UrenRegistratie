import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lokaal ontwikkelen: gebruik de SWA CLI (zie README) zodat inloggen en /api samen werken.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
