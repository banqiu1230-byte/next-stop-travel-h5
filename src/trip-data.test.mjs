import assert from 'node:assert/strict'
import { getTransport, placesSeed, previewConditionChange, validateConditionPreview } from './trip-data.js'

const drivePlace = placesSeed.find(place => place.mode === 'drive')
const tiredDrive = getTransport(drivePlace, 'tired', 'low')

assert.equal(tiredDrive.recommended.id, 'drive')
assert.match(tiredDrive.reason, /先休息/)
assert.equal(tiredDrive.alternatives.some(option => option.id === 'charter'), false)

const cityDrive = getTransport({ ...drivePlace, mode: undefined }, 'tired', 'low', 'drive')
assert.equal(cityDrive.recommended.id, 'drive')
assert.equal(cityDrive.alternatives.some(option => option.id === 'charter'), false)

const shuttlePlace = placesSeed.find(place => place.mode === 'shuttle')
const scenicTransfer = getTransport(shuttlePlace, '', 'normal', 'drive')
assert.equal(scenicTransfer.recommended.id, 'shuttle')
assert.equal(scenicTransfer.recommended.cost, '以景区为准')
assert.deepEqual(scenicTransfer.alternatives, [])

console.log('self-drive continuity validation ok')

const westLake = { id: 'west-lake', name: '杭州西湖风景名胜区', duration: '3–4 小时', closes: '待确认', priority: 'must', travel: 35 }
const lateInput = { ids: [westLake.id], places: [westLake], condition: 'late', currentId: westLake.id, clock: '18:36' }
const latePreview = previewConditionChange(lateInput)
assert.deepEqual(latePreview.nextPlan, [westLake.id], 'A timing conflict must not silently remove a must-see place')
assert.equal(latePreview.canApply, false, 'An unchanged late route must not be saved as resolved')
assert.equal(latePreview.conflicts[0].issue.code, 'day-overflow')
assert.match(latePreview.conflicts[0].issue.detail, /22:46/)
assert.equal(latePreview.unverified[0].id, westLake.id, 'Unknown hours remain a separate verification requirement')

const earlyPreview = previewConditionChange({ ...lateInput, clock: '09:30' })
assert.equal(earlyPreview.conflicts.length, 0)
assert.equal(earlyPreview.canApply, false, 'A no-op late adjustment is not an update')
assert.equal(earlyPreview.unverified.length, 1)

const lockedPreview = previewConditionChange({ ...lateInput, lockedIds: [westLake.id] })
assert.deepEqual(lockedPreview.nextPlan, [westLake.id])
assert.equal(lockedPreview.canApply, false)
const proposedRemoval = validateConditionPreview({ ...lateInput, lockedIds: [westLake.id], preview: { nextPlan: [] } })
assert.equal(proposedRemoval.canApply, false)
assert.equal(proposedRemoval.conflicts[0].issue.code, 'protected-removed')

const bookedPlace = { ...westLake, fixed: '18:00', duration: '30 分钟' }
const missedBooking = previewConditionChange({ ...lateInput, places: [bookedPlace] })
assert.equal(missedBooking.conflicts[0].issue.code, 'appointment-passed')
assert.equal(missedBooking.canApply, false)
const removedBooking = validateConditionPreview({ ...lateInput, places: [bookedPlace], preview: { nextPlan: [] } })
assert.equal(removedBooking.canApply, false)

const restaurant = { id: 'dinner', name: '附近餐厅', duration: '30 分钟', closes: '23:00', category: '美食', travel: 5 }
const changedInput = { ...lateInput, ids: [westLake.id, restaurant.id], places: [westLake, restaurant] }
const feasibleChange = validateConditionPreview({ ...changedInput, preview: { nextPlan: [restaurant.id] } })
assert.equal(feasibleChange.canApply, true, 'An explicitly previewed feasible route can still be confirmed')
assert.equal(feasibleChange.nextId, restaurant.id)
assert.deepEqual(feasibleChange.conflicts, [])

const unknownHoursChange = validateConditionPreview({ ...changedInput, clock: '09:30', preview: { nextPlan: [restaurant.id, westLake.id] } })
assert.equal(unknownHoursChange.canApply, true)
assert.equal(unknownHoursChange.unverified[0].id, westLake.id, 'Reordering must not mark unknown opening hours verified')
assert.equal(westLake.openingVerifiedAt, undefined)
console.log('condition preview timing and confirmation validation ok')
