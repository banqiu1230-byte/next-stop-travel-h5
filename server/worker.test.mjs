import assert from 'node:assert/strict'
import { createWorker } from './worker.mjs'
import { generatePlan } from './deepseek.mjs'

const env = {
  DEEPSEEK_API_KEY: 'test-private-ai-key', DEEPSEEK_MODEL: 'test-model',
  AMAP_KEY: 'test-public-map-key', AMAP_SECURITY_JS_CODE: 'test-private-map-code',
  ALLOWED_ORIGINS: 'https://banqiu1230-byte.github.io'
}
const planInput = {
  city: '上海', days: 2, pace: 'normal',
  places: [{ id: 'a', name: '豫园' }, { id: 'b', name: '外滩' }, { id: 'c', name: '南京路' }]
}
const responseFor = payload => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
  headers: { 'Content-Type': 'application/json' }
})
const goodPlan = () => responseFor({ days: [{ placeIds: ['a', 'a', 'invented'] }, { placeIds: ['b'] }], summary: '两日路线' })
function request(path = '/api/ai/plan', { method = 'POST', body = planInput, headers = {} } = {}) {
  return new Request(`https://travel.example${path}`, {
    method,
    headers: { Origin: 'https://banqiu1230-byte.github.io', 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.1', ...headers },
    ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
  })
}

let calls = 0
const worker = createWorker({ fetch: async (url, options) => {
  calls += 1
  assert.equal(url, 'https://api.deepseek.com/chat/completions')
  assert.equal(options.headers.Authorization, 'Bearer test-private-ai-key')
  assert.equal(JSON.parse(options.body).model, 'test-model')
  return goodPlan()
} })
let result = await worker.fetch(request(), env)
assert.equal(result.status, 200)
assert.equal(result.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGINS)
const plan = await result.json()
assert.deepEqual(plan.days.flatMap(day => day.placeIds), ['a', 'c', 'b'])
assert.equal(plan.provider, 'deepseek')
assert.equal(calls, 1)

result = await worker.fetch(request('/api/health', { method: 'GET' }), env)
assert.deepEqual(await result.json(), { ok: true, aiConfigured: true, mapProxyConfigured: true })
assert.equal((await worker.fetch(request('/api/unknown'), env)).status, 404)
assert.equal((await worker.fetch(request('/api/ai/plan', { method: 'GET' }), env)).status, 405)
assert.equal((await worker.fetch(request(), {})).status, 503)
assert.equal((await worker.fetch(request('/api/ai/plan', { headers: { Origin: 'https://untrusted.example' } }), env)).status, 403)
assert.equal((await worker.fetch(request('/api/ai/plan', { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415)
result = await worker.fetch(request('/api/ai/plan', { method: 'OPTIONS' }), env)
assert.equal(result.status, 204)
assert.equal(result.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
assert.equal((await worker.fetch(request('/api/ai/plan', { body: '{' }), env)).status, 400)
assert.equal((await worker.fetch(request('/api/ai/plan', { body: { city: '上海' } }), env)).status, 400)
assert.equal((await worker.fetch(request('/api/ai/plan', { headers: { 'Content-Length': '200001' } }), env)).status, 413)
assert.equal((await worker.fetch(request('/api/ai/plan', { body: JSON.stringify({ text: '沪'.repeat(70_000) }) }), env)).status, 413)
assert.equal(calls, 1, 'bad requests must not reach a chargeable upstream')

const replanWorker = createWorker({ fetch: async () => responseFor({ conditionKey: 'tired', placeIds: ['b'] }) })
result = await replanWorker.fetch(request('/api/ai/replan', { body: {
  city: '上海', request: '我累了，少去一个', planIds: ['a', 'b', 'c'], visitedIds: [], lockedIds: ['a'], places: planInput.places
} }), env)
assert.equal(result.status, 200)
assert.deepEqual((await result.json()).nextPlan, ['a', 'b'])

const failureWorker = createWorker({ fetch: async () => new Response('upstream echoed test-private-ai-key', { status: 401 }) })
result = await failureWorker.fetch(request(), env)
assert.equal(result.status, 502)
assert.equal((await result.text()).includes('test-private-ai-key'), false)

let time = 0
const limitedWorker = createWorker({ fetch: async () => goodPlan(), now: () => time })
assert.equal((await limitedWorker.fetch(request(), { ...env, AI_RATE_LIMIT: '1' })).status, 200)
result = await limitedWorker.fetch(request(), { ...env, AI_RATE_LIMIT: '1' })
assert.equal(result.status, 429)
assert.equal(result.headers.get('Retry-After'), '600')
time = 600_001
assert.equal((await limitedWorker.fetch(request(), { ...env, AI_RATE_LIMIT: '1' })).status, 200)

let release
let started
const entered = new Promise(resolve => { started = resolve })
const busyWorker = createWorker({ fetch: async () => {
  started()
  await new Promise(resolve => { release = resolve })
  return goodPlan()
} })
const pending = busyWorker.fetch(request(), { ...env, AI_MAX_CONCURRENT: '1' })
await entered
result = await busyWorker.fetch(request(), { ...env, AI_MAX_CONCURRENT: '1' })
assert.equal(result.status, 503)
assert.equal(result.headers.get('Retry-After'), '10')
release()
assert.equal((await pending).status, 200)

await assert.rejects(() => generatePlan(planInput, {
  apiKey: 'test-private-ai-key', timeoutMs: 5,
  fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
}), error => error.status === 504)

let proxiedUrl
const mapWorker = createWorker({ fetch: async url => {
  proxiedUrl = new URL(url)
  return new Response('callback({"status":"1"})', { headers: { 'Content-Type': 'application/javascript' } })
} })
result = await mapWorker.fetch(new Request('https://travel.example/_AMapService/v3/place/text?keywords=上海&callback=callback&jscode=untrusted', {
  headers: { Referer: 'https://banqiu1230-byte.github.io/next-stop-travel-h5/' }
}), env)
assert.equal(result.status, 200, 'AMap JSONP has a Referer but may not carry Origin')
assert.equal(proxiedUrl.origin, 'https://restapi.amap.com')
assert.equal(proxiedUrl.searchParams.get('key'), env.AMAP_KEY)
assert.equal(proxiedUrl.searchParams.get('jscode'), env.AMAP_SECURITY_JS_CODE)
assert.equal(await result.text(), 'callback({"status":"1"})')
assert.equal((await mapWorker.fetch(new Request('https://travel.example/_AMapService/v4/map/styles'), env)).status, 200)
assert.equal(proxiedUrl.origin, 'https://webapi.amap.com')
assert.equal((await mapWorker.fetch(new Request('https://travel.example/_AMapService/v3/place/text?key=foreign-key'), env)).status, 403)
assert.equal((await mapWorker.fetch(new Request('https://travel.example/_AMapService/v3/place/text', { headers: { Referer: 'https://untrusted.example/' } }), env)).status, 403)
assert.equal((await mapWorker.fetch(new Request('https://travel.example/_AMapService/https://evil.example/'), env)).status, 404)
assert.equal((await mapWorker.fetch(new Request('https://travel.example/_AMapService/v3/place/text'), {})).status, 503)

result = await worker.fetch(new Request('https://travel.example/'), { ASSETS: { fetch: async () => new Response('<html>app</html>') } })
assert.equal(await result.text(), '<html>app</html>')
console.log('production worker contract validation ok')
