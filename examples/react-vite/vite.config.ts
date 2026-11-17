import domirror from '@domirror/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [domirror({ enabled: process.env.DOMIRROR === '1', designSystem: ['src/ds/**'] }), react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
