import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Plugin to replace OG image URLs with absolute URLs for GitHub Pages
    {
      name: 'replace-og-image-urls',
      transformIndexHtml(html) {
        const siteUrl = process.env.VITE_SITE_URL || ''
        if (!siteUrl) {
          // Development mode - keep relative path
          return html
        }
        
        // Construct absolute URL for OG image
        // VITE_SITE_URL already includes the full path (e.g., https://user.github.io/repo)
        // BASE_URL is the base path (e.g., /repo/)
        // So we just need: siteUrl + /ogimg.png
        const absoluteOgImageUrl = `${siteUrl}/ogimg.png`
        
        return html.replace(
          /content="\/ogimg\.png"/g,
          `content="${absoluteOgImageUrl}"`
        )
      },
    },
  ],
  base: process.env.BASE_URL || '/',
  esbuild: {
    // Remove console.logs in production builds for security
    // This prevents API keys and sensitive data from appearing in production console
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})

