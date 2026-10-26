import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const API = process.env.VITE_PROXY || 'http://localhost:8080';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': API, '/ws': { target: API, ws: true } } },
});
