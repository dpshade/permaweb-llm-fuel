// @ts-check
import { defineConfig } from 'astro/config';

// Conditional output directory for Vercel builds
const isVercelBuild = process.env.VERCEL_BUILD === 'true';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  outDir: isVercelBuild ? '.vercel/output/static' : 'dist',
  build: {
    inlineStylesheets: 'always'
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    },
    resolve: {
      alias: {
        '@': '/src',
        '@client': '/src/client',
        '@server': '/src/server',
        '@client/utils': '/src/client/utils',
        '@server/utils': '/src/server/utils'
      }
    }
  },
  // Ensure iframe compatibility
  server: {
    headers: {
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *;"
    }
  },
  // Disable dev toolbar to reduce console noise
  devToolbar: {
    enabled: false
  }
});
