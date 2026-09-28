import assert from 'node:assert/strict'
import { validatePlan, validateReplan } from './deepseek.mjs'
import { previewConditionChange } from '../src/trip-data.js'

const input = { days: 2, places: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
const result = validatePlan({ days: [{ placeIds: ['a', 'a', 'invalid'] }, { placeIds: ['b'] }] }, input)
const ids = result.days.flatMap(day => day.placeIds)

assert.deepEqual([...ids].sort(), ['a', 'b', 'c'])
assert.equal(new Set(ids).size, 3)
assert.equal(result.checks.maxStops, 3)

const pacedInput = { days: 2, pace: 'slow', maxStops: 2, places: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }
const pacedResult = validatePlan({ days: [{ placeIds: ['a', 'b', 'c', 'd'] }, { placeIds: [] }] }, pacedInput)
assert.deepEqual(pacedResult.days.map(day => day.placeIds.length), [4, 0])
assert.match(pacedResult.checks.warnings[0], /超过建议/)

const conditionPlaces = [
  { id: 1, name: '远处景点', category: '景点', travel: 40, priority: 'want' },
  { id: 2, name: '附近餐厅', category: '美食', travel: 8, priority: 'want' },
  { id: 3, name: '预约展览', category: '艺术', travel: 20, priority: 'must' }
]
const closedPreview = previewConditionChange({ ids: [1, 2, 3], places: conditionPlaces, condition: 'closed', currentId: 1 })
assert.deepEqual(closedPreview.nextPlan, [2, 3])
assert.match(closedPreview.changes.join(' '), /下一站：附近餐厅/)

const hungryPreview = previewConditionChange({ ids: [1, 2, 3], places: conditionPlaces, condition: 'hungry', currentId: 1, lockedIds: [3] })
assert.equal(hungryPreview.nextPlan[0], 2)
assert.match(hungryPreview.changes.join(' '), /保留 1 个预约或锁定地点/)

const replanInput = {
  city: '杭州', request: '我累了，少去一个地方', currentId: 'a', planIds: ['a', 'b', 'c'], visitedIds: [], lockedIds: ['a'],
  places: [{ id: 'a', name: '预约展览' }, { id: 'b', name: '步行街' }, { id: 'c', name: '公园' }]
}
const shortened = validateReplan({ conditionKey: 'tired', title: '精简行程', placeIds: ['a', 'b'], changes: ['取消公园'] }, replanInput)
assert.deepEqual(shortened.nextPlan, ['a', 'b'])
assert.deepEqual(shortened.changes, ['移除：公园', '调整后下一站：预约展览'])
assert.equal(shortened.checks.lockedKept, true)

const unsafeLockedRemoval = validateReplan({ conditionKey: 'skip', placeIds: ['b', 'c'] }, replanInput)
assert.deepEqual(unsafeLockedRemoval.nextPlan, ['a', 'b', 'c'])
assert.equal(unsafeLockedRemoval.checks.lockedKept, true)
console.log('deepseek plan validation ok')
