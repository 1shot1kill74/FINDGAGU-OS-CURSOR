import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 로컬 /api/* 핸들러(process.env)가 .env 값을 읽도록 주입
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
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
      // 재시작 때마다 대시보드를 새로 열면 작업 중이던 Case Studio 등이 끊김
      open: false,
      watch: {
        // docs/시뮬 HTML·임시·DB 산출물이 갱신돼도 SPA 전체 리로드하지 않음
        ignored: [
          '**/docs/**',
          '**/snapshots/**',
          '**/vikunja/**',
          '**/supabase/.temp/**',
          '**/.tmp*/**',
          '**/agent-tools/**',
        ],
      },
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
          const routes: Record<
            string,
            {
              methods: string[]
              load: () => Promise<{ default: (req: any, res: any) => Promise<void> }>
            }
          > = {
            '/api/ad-inbox-pair-recommend': {
              methods: ['POST'],
              load: () => import('./api/ad-inbox-pair-recommend.ts'),
            },
            '/api/ad-inbox-cleanup-people': {
              methods: ['POST'],
              load: () => import('./api/ad-inbox-cleanup-people.ts'),
            },
            '/api/showroom-case-brief-draft': {
              methods: ['POST'],
              load: () => import('./api/showroom-case-brief-draft.ts'),
            },
            '/api/edu-outreach-collect': {
              methods: ['POST'],
              load: () => import('./api/edu-outreach-collect.ts'),
            },
            '/api/edu-outreach-fetch-article': {
              methods: ['POST'],
              load: () => import('./api/edu-outreach-fetch-article.ts'),
            },
            '/api/youtube-analytics-oauth-start': {
              methods: ['POST'],
              load: () => import('./api/youtube-analytics-oauth-start.ts'),
            },
            '/api/youtube-analytics-oauth-callback': {
              methods: ['GET'],
              load: () => import('./api/youtube-analytics-oauth-callback.ts'),
            },
            '/api/youtube-analytics-status': {
              methods: ['GET'],
              load: () => import('./api/youtube-analytics-status.ts'),
            },
            '/api/youtube-analytics-sync': {
              methods: ['POST'],
              load: () => import('./api/youtube-analytics-sync.ts'),
            },
            '/api/youtube-analytics-report': {
              methods: ['GET'],
              load: () => import('./api/youtube-analytics-report.ts'),
            },
          }

          server.middlewares.use(async (req, res, next) => {
            const rawUrl = req.url || ''
            const pathOnly = rawUrl.split('?')[0] || ''
            const route = routes[pathOnly]
            if (!route) {
              next()
              return
            }
            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.end('')
              return
            }
            if (!req.method || !route.methods.includes(req.method)) {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, message: `${route.methods.join('/')} only` }))
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
              const handler = (await route.load()).default
              const headers: Record<string, string | string[] | undefined> = { ...req.headers }
              const query: Record<string, string | string[] | undefined> = {}
              try {
                const u = new URL(rawUrl, 'http://localhost')
                u.searchParams.forEach((value, key) => {
                  const prev = query[key]
                  if (prev === undefined) query[key] = value
                  else if (Array.isArray(prev)) prev.push(value)
                  else query[key] = [prev, value]
                })
              } catch {
                /* ignore */
              }
              await handler(
                {
                  method: req.method,
                  headers,
                  query,
                  body: rawBody ? JSON.parse(rawBody) : {},
                },
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
