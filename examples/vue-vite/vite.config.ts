import domirror from '@domirror/plugin/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [domirror({ enabled: process.env.DOMIRROR === '1', designSystem: ['src/ds/**'] }), vue()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
