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
  const showroomCaseContentProxyTarget =
    env.SHOWROOM_CASE_CONTENT_PROXY_TARGET?.trim() || 'https://www.findgagu.co.kr'

  return {
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      open: '/dashboard',
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
        '/api/showroom-case-content': {
          target: showroomCaseContentProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'local-ad-inbox-apis',
        configureServer(server) {
          const routes: Record<string, () => Promise<{ default: (req: any, res: any) => Promise<void> }>> = {
            '/api/ad-inbox-pair-recommend': () => import('./api/ad-inbox-pair-recommend.ts'),
            '/api/ad-inbox-cleanup-people': () => import('./api/ad-inbox-cleanup-people.ts'),
          }

          server.middlewares.use(async (req, res, next) => {
            const pathOnly = req.url?.split('?')[0] || ''
            const loader = routes[pathOnly]
            if (!loader) {
              next()
              return
            }
            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.end('')
              return
            }
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, message: 'POST only' }))
              return
            }

            try {
              const chunks: Buffer[] = []
              await new Promise<void>((resolve, reject) => {
                req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
                req.on('end', () => resolve())
                req.on('error', reject)
              })
              const rawBody = Buffer.concat(chunks).toString('utf8')
              const handler = (await loader()).default
              const headers: Record<string, string | string[] | undefined> = { ...req.headers }
              await handler(
                { method: req.method, headers, body: rawBody ? JSON.parse(rawBody) : {} },
                {
                  setHeader(name: string, value: string) {
                    res.setHeader(name, value)
                  },
                  status(code: number) {
                    res.statusCode = code
                    return {
                      json(body: unknown) {
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify(body))
                      },
                      send(body: string) {
                        res.end(body)
                      },
                    }
                  },
                },
              )
            } catch (error) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: false,
                  message: error instanceof Error ? error.message : 'local ad-inbox api failed',
                }),
              )
            }
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
  }
})
