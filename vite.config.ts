import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const buildSha =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offline-app-shell',
      apply: 'build',
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle)
          .filter((name) => /\.(js|css|webp|woff2?)$/.test(name))
          .map((name) => `/${name}`)
          .sort()
        const id = createHash('sha256')
          .update(assets.join('\n'))
          .digest('hex')
          .slice(0, 12)
        const source = readFileSync('public/sw.js', 'utf8')
          .replace('__BUILD_ID__', id)
          .replace('/* BUILD_ASSETS */ []', JSON.stringify(assets))
        this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      },
    },
  ],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha.slice(0, 7)),
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
