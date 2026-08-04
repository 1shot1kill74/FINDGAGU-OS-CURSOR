import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(async ({ mode, command }) => {
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

  const plugins: PluginOption[] = [react()]
  // 프로덕션 빌드 시 api/* import 그래프를 vite.config가 끌어오지 않도록 분리 로드
  if (command === 'serve') {
    const pluginUrl = pathToFileURL(path.join(__dirname, 'vite.local-api-plugin.ts')).href
    const mod = await import(pluginUrl)
    plugins.push(mod.createLocalApiPlugin())
  }

  return {
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      open: false,
      watch: {
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
    plugins,
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
