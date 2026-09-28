import { generatePlan, generateReplan } from './deepseek.mjs'

const MAX_BODY_BYTES = 200_000
const DEFAULT_ORIGIN = 'https://banqiu1230-byte.github.io'

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  })
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

async function readBoundedJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    throw Object.assign(new Error('请求内容过大'), { status: 413 })
  }
  if (!request.body) throw Object.assign(new Error('缺少规划信息'), { status: 400 })
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        throw Object.assign(new Error('请求内容过大'), { status: 413 })
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    try { return JSON.parse(text) } catch { throw Object.assign(new Error('请求格式不正确'), { status: 400 }) }
  } finally {
    reader.releaseLock()
  }
}

// These are per-isolate limits, not account-wide billing caps. The provider's
// spending limit remains the final cap when the platform scales to more workers.
export function createWorker({ fetch: upstreamFetch = (...args) => fetch(...args), now = Date.now } = {}) {
  const requestsByIp = new Map()
  let activeAiRequests = 0

  function consumeLimit(request, kind, limit, windowMs) {
    const time = now()
    for (const [key, item] of requestsByIp) {
      if (item.resetAt <= time) requestsByIp.delete(key)
    }
    // Cloudflare owns this header. Do not trust arbitrary X-Forwarded-For input.
    const key = `${kind}:${request.headers.get('cf-connecting-ip') || 'unknown'}`
    let item = requestsByIp.get(key)
    if (!item) {
      if (requestsByIp.size >= 10_000) return 60
      item = { count: 0, resetAt: time + windowMs }
      requestsByIp.set(key, item)
    }
    if (item.count >= limit) return Math.max(1, Math.ceil((item.resetAt - time) / 1000))
    item.count += 1
    return 0
  }

  async function proxyAmap(request, env, url, cors) {
    if (!env.AMAP_SECURITY_JS_CODE) return json({ error: '地图服务尚未配置' }, 503, cors)
    const path = url.pathname.slice('/_AMapService'.length)
    if (!/^\/v[345]\/[a-zA-Z0-9_./-]+$/.test(path) || path.length > 300) {
      return json({ error: '没有这个地图接口' }, 404, cors)
    }
    const mapKey = env.AMAP_KEY || env.AMAP_JS_KEY
    const requestedKey = url.searchParams.get('key')
    if (mapKey && requestedKey && requestedKey !== mapKey) {
      return json({ error: '地图应用不匹配' }, 403, cors)
    }
    const retry = consumeLimit(request, 'map', positiveNumber(env.MAP_RATE_LIMIT, 180), 60_000)
    if (retry) return json({ error: '地图查询较频繁，请稍后重试' }, 429, { ...cors, 'Retry-After': String(retry) })
    const host = path.startsWith('/v4/map/styles') ? 'webapi.amap.com' : 'restapi.amap.com'
    const target = new URL(path, `https://${host}`)
    target.search = url.search
    target.searchParams.set('jscode', env.AMAP_SECURITY_JS_CODE)
    if (mapKey) target.searchParams.set('key', mapKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const upstream = await upstreamFetch(target.href, { signal: controller.signal, redirect: 'error' })
      if (!upstream.ok) return json({ error: '地图服务暂时不可用，请稍后重试' }, 502, cors)
      return new Response(upstream.body, {
        status: 200,
        headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'private, max-age=60' }
      })
    } catch (error) {
      return json({ error: error.name === 'AbortError' ? '地图查询超时，请重试' : '地图服务暂时不可用，请稍后重试' }, error.name === 'AbortError' ? 504 : 502, cors)
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url)
      const isApi = url.pathname.startsWith('/api/')
      const isMap = url.pathname.startsWith('/_AMapService/')
      if (!isApi && !isMap) return env.ASSETS?.fetch(request) || json({ error: '没有这个页面' }, 404)

      const origin = request.headers.get('origin')
      const allowedOrigins = new Set(String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN).split(',').map(value => value.trim()).filter(Boolean))
      allowedOrigins.add(url.origin)
      if (origin && !allowedOrigins.has(origin)) return json({ error: '该网页没有接口访问权限' }, 403)
      if (!origin && request.headers.get('referer')) {
        try {
          if (!allowedOrigins.has(new URL(request.headers.get('referer')).origin)) return json({ error: '该网页没有接口访问权限' }, 403)
        } catch { return json({ error: '该网页没有接口访问权限' }, 403) }
      }
      const cors = { Vary: 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) }
      const methods = isMap || url.pathname === '/api/health' ? 'GET, OPTIONS' : 'POST, OPTIONS'
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { ...cors, 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }
        })
      }
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') return json({ error: '请使用 GET' }, 405, { ...cors, Allow: 'GET, OPTIONS' })
        return json({ ok: true, aiConfigured: Boolean(env.DEEPSEEK_API_KEY), mapProxyConfigured: Boolean(env.AMAP_SECURITY_JS_CODE) }, 200, cors)
      }
      if (isMap) {
        if (request.method !== 'GET') return json({ error: '请使用 GET' }, 405, { ...cors, Allow: 'GET, OPTIONS' })
        return proxyAmap(request, env, url, cors)
      }

      const generate = { '/api/ai/plan': generatePlan, '/api/ai/replan': generateReplan }[url.pathname]
      if (!generate) return json({ error: '没有这个接口' }, 404, cors)
      if (request.method !== 'POST') return json({ error: '请使用 POST' }, 405, { ...cors, Allow: 'POST, OPTIONS' })
      if (!env.DEEPSEEK_API_KEY) return json({ error: 'AI 规划服务尚未配置' }, 503, cors)
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
        return json({ error: '请求需要使用 JSON 格式' }, 415, cors)
      }
      const retry = consumeLimit(request, 'ai', positiveNumber(env.AI_RATE_LIMIT, 12), 600_000)
      if (retry) return json({ error: '规划请求较频繁，请稍后再试' }, 429, { ...cors, 'Retry-After': String(retry) })
      if (activeAiRequests >= positiveNumber(env.AI_MAX_CONCURRENT, 4)) {
        return json({ error: '正在处理较多行程，请稍后重试' }, 503, { ...cors, 'Retry-After': '10' })
      }

      activeAiRequests += 1
      try {
        const payload = await generate(await readBoundedJson(request), {
          apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL,
          fetch: upstreamFetch, signal: request.signal
        })
        return json(payload, 200, cors)
      } catch (error) {
        return json({ error: error.status ? error.message : '规划信息不完整或格式不正确，请检查后重试' }, error.status || 400, cors)
      } finally {
        activeAiRequests -= 1
      }
    }
  }
}

export default createWorker()
