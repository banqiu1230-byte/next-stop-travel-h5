// A browser with no saved trips starts empty. Legacy fields are migrated only
// when there is an existing trip to own them; they never create a demo trip.
export function restoreTripState(value) {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const trips = Array.isArray(saved.trips) ? saved.trips.filter(trip => trip && typeof trip === 'object' && trip.id) : []
  const activeTripId = trips.some(trip => trip.id === saved.activeTripId) ? saved.activeTripId : trips[0]?.id || null
  const activeTrip = trips.find(trip => trip.id === activeTripId)
  const scoped = (field, legacyField, fallback) => {
    if (!trips.length) return {}
    const record = saved[field] && typeof saved[field] === 'object' && !Array.isArray(saved[field]) ? { ...saved[field] } : {}
    if (activeTripId && record[activeTripId] === undefined) {
      if (saved[legacyField] !== undefined) record[activeTripId] = saved[legacyField]
      else if (fallback !== undefined) record[activeTripId] = fallback
    }
    return record
  }
  return {
    ...saved,
    trips,
    activeTripId,
    placesByTrip: scoped('placesByTrip', 'places'),
    visitedByTrip: scoped('visitedByTrip', 'visited'),
    plansByTrip: scoped('plansByTrip', 'dayPlan', activeTrip?.dailyPlans?.[Math.max(0, (activeTrip.currentDay || 1) - 1)] || []),
    lockedByTrip: scoped('lockedByTrip', 'locked'),
    conditionByTrip: scoped('conditionByTrip', 'condition'),
    energyByTrip: scoped('energyByTrip', 'energy'),
    journeyStageByTrip: scoped('journeyStageByTrip', 'journeyStage')
  }
}
