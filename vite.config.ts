/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Same policy as vercel.json, added to the built page as a meta tag so the
// browser blocks requests to any other site wherever Caselo is hosted.
// Not applied in dev, where Vite needs inline scripts and a websocket.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'caselo-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  }
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
})
