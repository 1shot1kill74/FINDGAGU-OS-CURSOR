import type { Plugin, ViteDevServer, Connect } from 'vite'

type Handler = (
  req: {
    method?: string
    headers: Record<string, string | string[] | undefined>
    query?: Record<string, string | string[] | undefined>
    body?: unknown
  },
  res: {
    setHeader(name: string, value: string): void
    status(code: number): { json(body: unknown): void; send(body: string): void }
  },
) => Promise<void>

type Route = {
  methods: string[]
  load: () => Promise<{ default: Handler }>
}

export function createLocalApiPlugin(): Plugin {
  return {
    name: 'local-ad-inbox-apis',
    configureServer(server: ViteDevServer) {
      const routes: Record<string, Route> = {
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

      server.middlewares.use(async (req: Connect.IncomingMessage, res, next) => {
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
  }
}
