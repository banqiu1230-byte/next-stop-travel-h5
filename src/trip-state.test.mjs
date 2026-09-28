import assert from 'node:assert/strict'
import { restoreTripState } from './trip-state.js'

for (const empty of [undefined, null, {}, [], { trips: [] }, { trips: [], activeTripId: 'xinjiang', dayPlan: [1, 2], places: [{ id: 1 }] }]) {
  const restored = restoreTripState(empty)
  assert.deepEqual(restored.trips, [])
  assert.equal(restored.activeTripId, null)
  for (const key of ['placesByTrip', 'visitedByTrip', 'plansByTrip', 'lockedByTrip', 'conditionByTrip', 'energyByTrip', 'journeyStageByTrip']) assert.deepEqual(restored[key], {})
  assert.deepEqual(restoreTripState(JSON.parse(JSON.stringify(restored))), restored)
}

const trip = { id: 'my-shanghai', city: '上海', currentDay: 2, dailyPlans: [['garden'], ['bund']] }
const stored = {
  trips: [trip], activeTripId: trip.id,
  placesByTrip: { [trip.id]: [{ id: 'garden' }, { id: 'bund' }] },
  visitedByTrip: { [trip.id]: ['garden'] }, plansByTrip: { [trip.id]: ['bund'] },
  lockedByTrip: { [trip.id]: ['bund'] }, conditionByTrip: { [trip.id]: 'rain' }
}
const restored = restoreTripState(stored)
assert.deepEqual(restored.trips, stored.trips)
for (const key of ['placesByTrip', 'visitedByTrip', 'plansByTrip', 'lockedByTrip', 'conditionByTrip']) assert.deepEqual(restored[key], stored[key])
assert.deepEqual(stored.placesByTrip[trip.id].length, 2)
assert.equal(restoreTripState({ ...stored, activeTripId: 'removed-trip' }).activeTripId, trip.id)
assert.deepEqual(restoreTripState({ trips: [trip] }).plansByTrip[trip.id], ['bund'])
assert.deepEqual(restoreTripState({ trips: [trip], places: [{ id: 'legacy' }], dayPlan: ['legacy'] }).placesByTrip[trip.id], [{ id: 'legacy' }])
assert.deepEqual(restoreTripState({ ...stored, trips: [] }).placesByTrip, {})

console.log('empty onboarding and saved-trip restoration validation ok')
