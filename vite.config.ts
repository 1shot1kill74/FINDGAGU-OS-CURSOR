import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  plugins: [
    react(),
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
