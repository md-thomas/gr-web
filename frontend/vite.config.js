import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend (Flask) address used by `npm run dev`
const backend = process.env.BACKEND_URL || 'http://localhost:5050'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backend,
      '/run-flow': backend,
    },
  },
})
