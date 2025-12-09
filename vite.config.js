import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL || '/',
  esbuild: {
    // Remove console.logs in production builds for security
    // This prevents API keys and sensitive data from appearing in production console
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})

