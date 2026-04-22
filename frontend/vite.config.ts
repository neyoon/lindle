import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const frontendPort = Number(process.env.FRONTEND_PORT ?? process.env.VITE_PORT ?? 1106)
const backendPort = Number(process.env.BACKEND_PORT ?? 6011)
const apiTarget = process.env.VITE_API_TARGET ?? `http://localhost:${backendPort}`

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
})
