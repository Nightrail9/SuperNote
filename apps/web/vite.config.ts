import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (!normalized.includes('/node_modules/')) {
            return
          }

          if (
            normalized.includes('/node_modules/vue/') ||
            normalized.includes('/node_modules/vue-router/') ||
            normalized.includes('/node_modules/pinia/')
          ) {
            return 'framework'
          }

          if (
            normalized.includes('/element-plus/') ||
            normalized.includes('/@element-plus/')
          ) {
            return 'element-plus'
          }

          if (
            normalized.includes('/md-editor-v3/') ||
            normalized.includes('/codemirror/') ||
            normalized.includes('/markdown-it/') ||
            normalized.includes('/highlight.js/') ||
            normalized.includes('/katex/') ||
            normalized.includes('/mermaid/')
          ) {
            return 'markdown-stack'
          }

          if (normalized.includes('/axios/')) {
            return 'http-client'
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
