import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { deepSeekPlanMiddleware, deepSeekReplanMiddleware } from './server/deepseek.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiHandler = deepSeekPlanMiddleware({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL })
  const replanHandler = deepSeekReplanMiddleware({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL })
  const aiProxy = {
    name: 'deepseek-plan-proxy',
    configureServer(server) { server.middlewares.use('/api/ai/plan', aiHandler); server.middlewares.use('/api/ai/replan', replanHandler) },
    configurePreviewServer(server) { server.middlewares.use('/api/ai/plan', aiHandler); server.middlewares.use('/api/ai/replan', replanHandler) }
  }
  return { base: './', plugins: [react(), aiProxy] }
})
