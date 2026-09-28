export async function requestAiPlan(input) {
  const response = await fetch('/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })

  if (response.status === 503 || response.status === 404) {
    const error = new Error('DeepSeek 尚未配置')
    error.code = 'AI_NOT_CONFIGURED'
    throw error
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'AI 规划暂时不可用')
  }

  const plan = await response.json()
  if (!Array.isArray(plan.days)) throw new Error('AI 返回的路线格式不正确')
  return plan
}

export async function requestAiReplan(input) {
  const response = await fetch('/api/ai/replan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'AI 调整暂时不可用')
  if (!Array.isArray(payload.nextPlan) || !payload.provider) throw new Error('AI 返回的调整格式不正确')
  return payload
}
