import { defineConfig } from 'vite';

// base './' so the build works from a sub-path (GitHub Pages serves it at /Palmbound/)
export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: { main: 'index.html', play: 'play/index.html' } },
  },
});
