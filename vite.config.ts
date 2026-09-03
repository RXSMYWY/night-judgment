import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/ws': {
        target: process.env.ROOM_PROXY_TARGET || 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
