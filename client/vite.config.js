import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true, proxyTimeout: 120000, timeout: 120000 } }
  }
})
