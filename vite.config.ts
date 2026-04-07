import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    fs: {
      allow: [__dirname],
    },
  },
  plugins: [
    react(),
    {
      name: 'takeout-inbox-local-only',
      configureServer(server) {
        server.middlewares.use('/data/takeout-quote-inbox.json', (req, res, next) => {
          const enabled = String(process.env.VITE_ENABLE_TAKEOUT_INBOX ?? '').trim().toLowerCase()
          if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
            next()
            return
          }

          const manifestPath = path.join(__dirname, 'public', 'data', 'takeout-quote-inbox.json')
          if (!fs.existsSync(manifestPath)) {
            res.statusCode = 404
            res.end('takeout manifest not found')
            return
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(fs.readFileSync(manifestPath))
        })

        server.middlewares.use('/assets/takeout-quote-inbox', (req, res, next) => {
          const enabled = String(process.env.VITE_ENABLE_TAKEOUT_INBOX ?? '').trim().toLowerCase()
          if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
            next()
            return
          }

          const requestPath = decodeURIComponent((req.url ?? '').replace(/^\/+/, ''))
          const relativePath = requestPath.replace(/^assets\/takeout-quote-inbox\/?/, '')
          const assetPath = path.join(__dirname, 'assets', 'takeout-backups', 'takeout-quote-inbox', relativePath)
          if (!fs.existsSync(assetPath) || fs.statSync(assetPath).isDirectory()) {
            next()
            return
          }

          fs.createReadStream(assetPath).pipe(res)
        })
      },
    },
  ],
  build: {
    rollupOptions: {
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
          if (id.includes('src/lib/estimatePdfExport')) {
            return 'estimate-export'
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
