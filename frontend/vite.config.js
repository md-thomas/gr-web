import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend (Flask) address used by `npm run dev`
const backend = process.env.BACKEND_URL || 'http://localhost:5050'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ELK (used by Declutter) is ~1.4 MB; it's in its own chunk that's only
    // loaded when Declutter is first used
    chunkSizeWarningLimit: 1600,
  },
  server: {
    proxy: {
      '/api': backend,
    },
  },
})
