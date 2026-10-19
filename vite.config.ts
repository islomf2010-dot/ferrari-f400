import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    // Fonts are the only thing worth inlining; everything else stays a file.
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // The whole experience is React + GSAP and nothing else. The previous
        // three.js / R3F chunks are gone with the real-time 3D scene they
        // served: a pre-rendered film is cheaper to ship and cheaper to run.
        manualChunks: {
          gsap: ['gsap'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});