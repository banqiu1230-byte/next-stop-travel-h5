const MAX_BODY_BYTES = 200_000

function parseDurationMinutes(value) {
  const text = String(value || '')
  const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0])).filter(Number.isFinite)
  if (!values.length) return null
  const average = values.reduce((sum, item) => sum + item, 0) / values.length
  return /小时/.test(text) ? Math.round(average * 60) : Math.round(average)
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) reject(new Error('请求内容过大'))
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('请求格式不正确')) }
    })
    req.on('error', reject)
  })
}

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('缺少规划信息')
  if (!input.city || !Number.isInteger(input.days) || input.days < 1 || input.days > 30) throw new Error('目的地或旅行天数不正确')
  if (!Array.isArray(input.places) || input.places.length < 2 || input.places.length > 80) throw new Error('地点数量不正确')
  const pace = String(input.pace || 'normal')
  const maxStops = { slow: 2, normal: 3, full: 4 }[pace] || 3
  return {
    city: String(input.city).slice(0, 60),
    origin: String(input.origin || '').slice(0, 60),
    days: input.days,
    pace,
    maxStops,
    transport: String(input.transport || 'public'),
    dayStartTime: /^\d{2}:\d{2}$/.test(String(input.dayStartTime || '')) ? String(input.dayStartTime) : '09:30',
    preferences: String(input.preferences || '').slice(0, 500),
    styles: Array.isArray(input.styles) ? input.styles.slice(0, 12) : [],
    stays: Array.isArray(input.stays) ? input.stays.slice(0, 20) : [],
    places: input.places.map(place => ({
      id: String(place.id), name: String(place.name || '').slice(0, 100), area: String(place.area || '').slice(0, 80),
      category: String(place.category || '').slice(0, 40), priority: String(place.priority || 'want'),
      appointment: place.fixed || null, position: Array.isArray(place.position) ? place.position.slice(0, 2) : null,
      durationMinutes: Math.max(15, Math.min(720, Number(place.durationMinutes) || parseDurationMinutes(place.duration) || 90)),
      closes: /^\d{1,2}:\d{2}$/.test(String(place.closes || '')) ? String(place.closes) : null,
      rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
      source: String(place.source || 'unknown').slice(0, 30)
    }))
  }
}

export function validatePlan(plan, input) {
  if (!plan || !Array.isArray(plan.days)) throw new Error('AI 返回格式错误')
  const allowed = new Set(input.places.map(place => place.id))
  const used = new Set()
  const days = Array.from({ length: input.days }, (_, index) => {
    const source = plan.days[index] || {}
    const placeIds = []
    for (const rawId of Array.isArray(source.placeIds) ? source.placeIds : []) {
      const id = String(rawId)
      if (!allowed.has(id) || used.has(id)) continue
      used.add(id)
      placeIds.push(id)
    }
    return { dayIndex: index, placeIds, note: String(source.note || '').slice(0, 160) }
  })
  const capacity = Number.isInteger(input.maxStops) ? input.maxStops : ({ slow: 2, normal: 3, full: 4 }[input.pace] || 3)
  input.places.forEach(place => {
    if (used.has(place.id)) return
    const available = days.filter(day => day.placeIds.length < capacity)
    const candidates = available.length ? available : days
    candidates.reduce((shortest, day) => day.placeIds.length < shortest.placeIds.length ? day : shortest, candidates[0]).placeIds.push(place.id)
  })
  const warnings = days.filter(day => day.placeIds.length > capacity).map(day => `第 ${day.dayIndex + 1} 天超过建议的 ${capacity} 个地点`)
  return { days, summary: String(plan.summary || '').slice(0, 240), provider: 'deepseek', checks: { maxStops: capacity, warnings } }
}

export function deepSeekPlanMiddleware(config = {}) {
  return async function handleDeepSeekPlan(req, res, next) {
    if (req.method !== 'POST') return next?.()
    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY
    if (!apiKey) return send(res, 503, { error: 'DeepSeek 尚未配置' })

    try {
      const input = validateInput(await readJson(req))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 2400,
          messages: [
            { role: 'system', content: '你是旅行路线规划助手。只能使用用户提供的真实地点 ID，不得编造地点、营业时间、价格、评分或交通事实。输出 JSON，格式为 {"days":[{"dayIndex":0,"placeIds":["id"],"note":"简短安排理由"}],"summary":"简短说明"}。优先保留必去和预约地点，结合坐标减少折返；每一天尽量不超过 maxStops，并结合 durationMinutes、closes 与 dayStartTime 避免明显超时或闭馆冲突。所有地点恰好出现一次；未知信息保持未知。' },
            { role: 'user', content: JSON.stringify(input) }
          ]
        })
      }).finally(() => clearTimeout(timeout))

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error?.message || `DeepSeek 请求失败（${response.status}）`)
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('DeepSeek 没有返回路线')
      send(res, 200, validatePlan(JSON.parse(content), input))
    } catch (error) {
      send(res, error.name === 'AbortError' ? 504 : 400, { error: error.name === 'AbortError' ? 'DeepSeek 请求超时' : error.message })
    }
  }
}

function validateReplanInput(input) {
  if (!input || typeof input !== 'object') throw new Error('缺少调整信息')
  if (!input.city || !input.request || !Array.isArray(input.planIds) || !Array.isArray(input.places)) throw new Error('调整信息不完整')
  if (input.planIds.length < 1 || input.planIds.length > 30 || input.places.length > 80) throw new Error('路线地点数量不正确')
  const planIds = [...new Set(input.planIds.map(id => String(id)))]
  const allowed = new Set(planIds)
  const places = input.places.filter(place => allowed.has(String(place.id))).map(place => ({
    id: String(place.id), name: String(place.name || '').slice(0, 100), area: String(place.area || '').slice(0, 80),
    category: String(place.category || '').slice(0, 40), priority: String(place.priority || 'want'),
    appointment: place.fixed || null, durationMinutes: Math.max(15, Math.min(720, Number(place.durationMinutes) || parseDurationMinutes(place.duration) || 90)),
    position: Array.isArray(place.position) ? place.position.slice(0, 2) : null, closes: String(place.closes || '').slice(0, 20)
  }))
  return {
    city: String(input.city).slice(0, 60), request: String(input.request).slice(0, 500), currentId: String(input.currentId || ''),
    planIds, visitedIds: (input.visitedIds || []).map(id => String(id)).filter(id => allowed.has(id)),
    lockedIds: (input.lockedIds || []).map(id => String(id)).filter(id => allowed.has(id)), places
  }
}

export function validateReplan(result, input) {
  const allowed = new Set(input.planIds)
  const visited = input.planIds.filter(id => input.visitedIds.includes(id))
  const originalFuture = input.planIds.filter(id => !input.visitedIds.includes(id))
  const conditionKey = ['rain', 'tired', 'hungry', 'late', 'skip', 'closed', 'custom'].includes(result.conditionKey) ? result.conditionKey : 'custom'
  const canRemove = ['tired', 'late', 'skip', 'closed', 'custom'].includes(conditionKey)
  const proposed = []
  for (const rawId of Array.isArray(result.placeIds) ? result.placeIds : []) {
    const id = String(rawId)
    if (!allowed.has(id) || visited.includes(id) || proposed.includes(id)) continue
    proposed.push(id)
  }
  if (!canRemove || !Array.isArray(result.placeIds)) originalFuture.forEach(id => {
    if (!proposed.includes(id)) proposed.push(id)
  })
  const movable = proposed.filter(id => !input.lockedIds.includes(id))
  const future = originalFuture.map(id => input.lockedIds.includes(id) ? id : movable.shift()).filter(Boolean)
  future.push(...movable)
  const nextPlan = [...visited, ...future]
  const placeName = new Map(input.places.map(place => [place.id, place.name]))
  const removed = originalFuture.filter(id => !future.includes(id))
  const orderChanged = !removed.length && future.some((id, index) => originalFuture[index] !== id)
  const changes = []
  if (removed.length) changes.push(`移除：${removed.map(id => placeName.get(id) || id).join('、')}`)
  if (orderChanged) changes.push('重新安排未锁定地点的先后顺序')
  if (!removed.length && !orderChanged) changes.push('当前路线无需调整')
  changes.push(future.length ? `调整后下一站：${placeName.get(future[0]) || '待确认地点'}` : '调整后今天没有待去地点')
  const explanation = removed.length
    ? `根据“${input.request}”精简了未锁定地点，预约和锁定地点保持不变。`
    : orderChanged
      ? `根据“${input.request}”调整了未锁定地点的顺序，预约和锁定地点保持不变。`
      : `已检查“${input.request}”，当前路线不需要改变，预约和锁定地点保持不变。`
  return {
    provider: 'deepseek', conditionKey, title: String(result.title || '我整理了一版调整方案').slice(0, 120),
    explanation: explanation.slice(0, 240),
    nextPlan, nextId: future[0] || null, changes, checks: { lockedKept: input.lockedIds.every(id => nextPlan.includes(id)) }
  }
}

export function deepSeekReplanMiddleware(config = {}) {
  return async function handleDeepSeekReplan(req, res, next) {
    if (req.method !== 'POST') return next?.()
    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY
    if (!apiKey) return send(res, 503, { error: 'DeepSeek 尚未配置' })
    try {
      const input = validateReplanInput(await readJson(req))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', thinking: { type: 'disabled' },
          response_format: { type: 'json_object' }, max_tokens: 1600,
          messages: [
            { role: 'system', content: '你是旅行中的实时行程调整助手。只能使用用户提供的地点 ID，不得编造地点、营业时间、票价、评分、距离或交通事实。理解用户的自然语言变化，输出 JSON：{"conditionKey":"rain|tired|hungry|late|skip|closed|custom","title":"对用户的简短回应","explanation":"调整理由","placeIds":["调整后仍保留的未完成地点ID，按新顺序排列"]}。placeIds 是完整的调整结果，省略某个未锁定 ID 就表示从今天移除该站。已完成地点不参与排序；预约和锁定地点必须保留且不能改变位置；用户说累了或晚了时应优先减少未锁定站点，说不想去或临时关闭时应移除当前未锁定站点；信息不足时保持原顺序。' },
            { role: 'user', content: JSON.stringify(input) }
          ]
        })
      }).finally(() => clearTimeout(timeout))
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error?.message || `DeepSeek 请求失败（${response.status}）`)
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('DeepSeek 没有返回调整方案')
      send(res, 200, validateReplan(JSON.parse(content), input))
    } catch (error) {
      send(res, error.name === 'AbortError' ? 504 : 400, { error: error.name === 'AbortError' ? 'DeepSeek 请求超时' : error.message })
    }
  }
}
