import assert from 'node:assert/strict'
import { getTransport, placesSeed } from './trip-data.js'

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
