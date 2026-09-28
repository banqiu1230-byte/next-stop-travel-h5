import { mkdir, rm } from 'node:fs/promises'
import { build as buildClient, loadEnv } from 'vite'
import { build as bundleWorker } from 'esbuild'

// Only the public JS API key is needed by the browser. Private credentials
// are supplied separately to the deployed Worker's environment.
const env = loadEnv('production', process.cwd(), '')
process.env.VITE_AMAP_KEY = env.VITE_AMAP_KEY || env.AMAP_KEY || ''
process.env.VITE_AMAP_SERVICE_HOST = '/_AMapService'
process.env.VITE_AMAP_SECURITY_JS_CODE = ''
process.env.VITE_API_BASE_URL = ''

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })
await buildClient({ build: { outDir: 'dist/client', emptyOutDir: true } })
await mkdir('dist/server', { recursive: true })
await bundleWorker({
  entryPoints: ['server/worker.mjs'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true
})
console.log('Hosted browser and API build ready.')
