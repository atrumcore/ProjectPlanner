import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honour a PORT env var so multiple dev servers can run side by side
  // (e.g. two editor sessions); falls back to Vite's default 5173.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
})
