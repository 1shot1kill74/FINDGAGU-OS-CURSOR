import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const showroomShortsProxyTarget =
    env.SHOWROOM_SHORTS_PROXY_TARGET?.trim() || 'https://findgagu-os-cursor.vercel.app'
  const showroomShortsProxyToken = env.SHOWROOM_SHORTS_PROXY_TOKEN?.trim() || ''

  return {
    server: {
      host: true,
      port: 5181,
      strictPort: true,
      open: '/public/showroom',
      proxy: {
        '/api/showroom-shorts-worker': {
          target: showroomShortsProxyTarget,
          changeOrigin: true,
          secure: true,
          configure(proxy) {
            if (!showroomShortsProxyToken) return
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${showroomShortsProxyToken}`)
            })
          },
        },
      },
    },
    plugins: [
      react(),
    ],
    build: {
      outDir: 'dist-public',
      rollupOptions: {
        input: path.resolve(__dirname, 'public-index.html'),
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/pdfjs-dist')) {
              return 'vendor-pdfjs'
            }
            if (id.includes('node_modules/html2canvas')) {
              return 'vendor-html2canvas'
            }
            if (id.includes('node_modules/jspdf')) {
              return 'vendor-jspdf'
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@/lib/imageAssetService': path.resolve(__dirname, './src/lib/publicImageAssetService.ts'),
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
