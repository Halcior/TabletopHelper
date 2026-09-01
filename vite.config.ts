import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha.slice(0, 7)),
  },
  server: {
    port: 5173
  }
})
