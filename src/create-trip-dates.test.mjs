import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createTripDateError } from './create-trip-dates.js'

const noon = new Date(2026, 8, 28, 12)
assert.equal(createTripDateError('2026-09-28', '2026-09-28', noon), '')
assert.equal(createTripDateError('2026-09-29', '2026-10-01', noon), '')
assert.match(createTripDateError('2026-09-27', '2026-09-29', noon), /不能早于今天/)
assert.match(createTripDateError('2026-09-29', '2026-09-28', noon), /不能早于出发日期/)
for (const [start, end] of [['', ''], ['2026-02-30', '2026-10-01'], ['2026-9-28', '2026-09-29'], ['2026-09-28', null]]) {
  assert.match(createTripDateError(start, end, noon), /有效/)
}

// An initially valid draft is rechecked when the user eventually creates it.
assert.equal(createTripDateError('2026-09-28', '2026-09-29', new Date(2026, 8, 28, 23, 59)), '')
assert.match(createTripDateError('2026-09-28', '2026-09-29', new Date(2026, 8, 29, 0, 1)), /不能早于今天/)

// Today follows the device's calendar, not the UTC day of toISOString().
for (const [tz, instant, today, yesterday] of [
  ['Asia/Shanghai', '2026-09-28T16:05:00Z', '2026-09-29', '2026-09-28'],
  ['America/Los_Angeles', '2026-09-28T01:05:00Z', '2026-09-27', '2026-09-26']
]) {
  const script = `import { createTripDateError } from ${JSON.stringify(new URL('./create-trip-dates.js', import.meta.url).href)};
    const now = new Date(${JSON.stringify(instant)});
    console.log(JSON.stringify([createTripDateError(${JSON.stringify(today)}, ${JSON.stringify(today)}, now), createTripDateError(${JSON.stringify(yesterday)}, ${JSON.stringify(today)}, now)]));`
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }))
  assert.equal(result[0], '')
  assert.match(result[1], /不能早于今天/)
}

console.log('create-trip date floor, local timezone and midnight validation ok')
