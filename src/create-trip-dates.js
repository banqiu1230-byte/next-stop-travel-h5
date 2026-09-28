function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(`${value}T00:00:00`)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

// Creation only: existing trips remain readable, including past journeys.
// Re-evaluate at each action so an overnight draft cannot bypass the rule.
export function createTripDateError(startDate, endDate, now = new Date()) {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) return '请选择有效的出发和返程日期。'
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (startDate < today) return '出发日期不能早于今天，请重新选择。'
  if (endDate < startDate) return '返程日期不能早于出发日期，请重新选择。'
  return ''
}
