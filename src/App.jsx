import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, BusFront, CarFront, Check,
  CalendarDays, ChevronDown, CircleEllipsis, Clock3, CloudSun, Coffee, Compass, ExternalLink,
  Footprints, GitCompareArrows, Heart, Home, Images, ListChecks, LocateFixed, Lock, Map as MapIcon, MoreHorizontal,
  MapPin, MessageCircle, Navigation, Pencil, Plus, RotateCcw, Search, ShieldCheck, ShoppingBag,
  Sparkles, Star, ThumbsDown, ThumbsUp, TicketCheck, TrainFront, Trash2, Undo2, Unlock,
  UtensilsCrossed, WalletCards, WifiOff, X, Zap
} from 'lucide-react'
import { conditionMeta, formatTravelTime, getTransport, initialPlan, placesByTripSeed, previewConditionChange, sortForCondition } from './trip-data'
import { requestAiPlan, requestAiReplan } from './ai-planner'
import { restoreTripState } from './trip-state'
import { configureAMap } from './service-config'
import TripDateField from './TripDateField'
import './empty-trip.css'

const tabs = [
  { id: 'today', label: '行程', icon: Home },
  { id: 'map', label: '地图', icon: MapIcon },
  { id: 'me', label: '我的', icon: CircleEllipsis }
]

function packingItemsForTrip(trip) {
  const outdoor = trip.city === '新疆' || (trip.styles || []).some(style => ['自然', '周边', '自驾'].includes(style))
  return [
    { id: 'documents', label: '身份证件' },
    { id: 'power', label: '手机、充电器和充电宝' },
    { id: 'medicine', label: '常用药品' },
    { id: 'clothes', label: outdoor ? '防晒用品和保暖外套' : '适合天气的衣物和雨具' }
  ]
}

function getTripStays(trip) {
  if (Array.isArray(trip.stays)) return trip.stays
  if (!trip.hotel || trip.hotel === '未设置') return []
  return [{
    id: `legacy-stay-${trip.id}`,
    placeId: trip.hotelPlaceId || null,
    name: trip.hotel,
    area: trip.city,
    checkIn: trip.startDate || '',
    checkOut: trip.endDate || ''
  }]
}

function shortStayDate(date) {
  if (!date) return '日期待定'
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function tripDateAtOffset(startDate, offset) {
  if (!startDate) return ''
  const [year, month, day] = startDate.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return ''
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
}

function dateKeyOffset(fromDate, toDate) {
  if (!fromDate || !toDate) return 0
  const from = fromDate.split('-').map(Number)
  const to = toDate.split('-').map(Number)
  if (![...from, ...to].every(Number.isFinite)) return 0
  return Math.round((Date.UTC(to[0], to[1] - 1, to[2]) - Date.UTC(from[0], from[1] - 1, from[2])) / 86400000)
}

function formatTripDateRange(startDate, endDate) {
  if (!startDate || !endDate) return '日期待定'
  const [startYear, startMonth, startDay] = startDate.split('-')
  const [endYear, endMonth, endDay] = endDate.split('-')
  const start = `${startYear}.${startMonth}.${startDay}`
  const end = startYear === endYear ? `${endMonth}.${endDay}` : `${endYear}.${endMonth}.${endDay}`
  return `${start} — ${end}`
}

function formatTripDate(startDate, dayIndex) {
  const dateKey = tripDateAtOffset(startDate, dayIndex)
  if (!dateKey) return `第 ${dayIndex + 1} 天`
  const date = new Date(`${dateKey}T00:00:00`)
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)
  return `${date.getMonth() + 1}/${date.getDate()} · ${weekday}`
}

function formatStartedDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日开始`
}

function clockToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 9 * 60
}

function formatClockMinutes(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function inferConditionRequest(value) {
  const text = String(value || '').trim()
  if (/关门|闭馆|关闭|停业|没开/.test(text)) return 'closed'
  if (/不想去|跳过|换掉|取消这站/.test(text)) return 'skip'
  if (/饿|吃|餐厅|小吃|咖啡|喝点/.test(text)) return 'hungry'
  if (/下雨|雨天|天气|降温|太热|太晒/.test(text)) return 'rain'
  if (/累|休息|少走|走不动|体力/.test(text)) return 'tired'
  if (/晚了|来不及|时间不够|提前结束|赶时间/.test(text)) return 'late'
  return 'custom'
}

function inferReplanScope(value) {
  return /整个|整段|全程|整趟|后面几天|后续行程|剩下的行程|接下来几天|明天|未来几天|旅行安排/.test(String(value || '')) ? 'trip' : null
}

function explicitlyRemovedPlaceIds(value, places, currentId, conditionKey) {
  const text = String(value || '')
  const removing = /不去|别去|删除|删掉|去掉|移除|取消|跳过|换掉|关门|闭馆|关闭|停业/.test(text)
  const named = removing ? places.filter(place => text.includes(place.name)).map(place => place.id) : []
  if (['skip', 'closed'].includes(conditionKey) && currentId !== undefined && currentId !== null) named.push(currentId)
  return [...new Set(named)]
}

function durationToMinutes(value) {
  const text = String(value || '')
  const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0])).filter(Number.isFinite)
  if (!values.length) return 90
  const average = values.reduce((sum, item) => sum + item, 0) / values.length
  return /\u5c0f\u65f6/.test(text) ? Math.round(average * 60) : Math.round(average)
}

function closingTimeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null
}

function transferReserveMinutes(origin, destination, transport = 'public') {
  const distanceKm = placeDistance(origin, destination)
  if (!Number.isFinite(distanceKm)) return transport === 'walk' ? 20 : transport === 'drive' ? 25 : 35
  if (transport === 'walk') return Math.max(10, Math.min(180, Math.ceil((distanceKm / 4.2 * 60) / 5) * 5))
  if (transport === 'drive') return Math.max(15, Math.min(240, Math.ceil((12 + distanceKm * 1.35) / 5) * 5))
  return Math.max(20, Math.min(120, Math.ceil((18 + distanceKm * 4) / 5) * 5))
}

function legTransportMode(origin, destination, preferredMode = 'public') {
  const distanceKm = placeDistance(origin, destination)
  const scenicTransfer = (origin?.mode === 'shuttle' || destination?.mode === 'shuttle')
    && (origin?.area === destination?.area || (Number.isFinite(distanceKm) && distanceKm <= 10))
  return scenicTransfer ? 'shuttle' : preferredMode
}

function transportReserveLabel(transport) {
  return transport === 'drive' ? '自驾' : transport === 'walk' ? '步行' : '公共交通'
}

function buildSuggestedDaySchedule(dayPlaces, { startTime = '09:30', transport = 'public', origin = null, firstTravelMinutes = null } = {}) {
  let cursor = clockToMinutes(startTime)
  return dayPlaces.map((place, index) => {
    const previous = index > 0 ? dayPlaces[index - 1] : origin
    const estimatedFirstLeg = index === 0 && Number.isFinite(firstTravelMinutes) ? firstTravelMinutes : 0
    const transferMinutes = previous ? transferReserveMinutes(previous, place, transport) : estimatedFirstLeg
    const earliestStart = cursor + transferMinutes
    const appointment = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
    const appointmentConflict = appointment !== null && earliestStart > appointment
    const departPrevious = previous || estimatedFirstLeg
      ? appointment !== null && !appointmentConflict
        ? Math.max(cursor, appointment - transferMinutes)
        : cursor
      : null
    const start = appointment !== null ? Math.max(earliestStart, appointment) : earliestStart
    const end = start + durationToMinutes(place.duration)
    const closing = closingTimeToMinutes(place.closes)
    const closingConflict = closing !== null && end > closing
    const lateFinish = end > 21 * 60 + 30
    cursor = end
    return {
      placeId: place.id,
      start,
      end,
      departPrevious,
      transferMinutes,
      appointmentConflict,
      closingConflict,
      lateFinish,
      warning: appointmentConflict ? '预约时间可能赶不上' : closingConflict ? '预计结束晚于闭馆' : lateFinish ? '当天结束较晚' : ''
    }
  })
}

function tripDayStartTime(trip, dayIndex) {
  const defaultStart = trip?.dayStartTime || '09:30'
  const arrivalTime = trip?.planningIntent?.arrivalTime
  if (dayIndex !== 0 || !arrivalTime) return defaultStart
  return formatClockMinutes(Math.max(clockToMinutes(defaultStart), clockToMinutes(arrivalTime) + 60))
}

function runtimeStopIssue(place, { arrival, leave, now }) {
  const appointment = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
  if (appointment !== null && now >= appointment) return { code: 'appointment-passed', title: `${place.fixed} 预约已过`, detail: '当天无法再按原预约执行' }
  if (appointment !== null && arrival > appointment) return { code: 'appointment-late', title: `预计赶不上 ${place.fixed} 预约`, detail: '需要移出当天或调整整段行程' }
  const closing = closingTimeToMinutes(place.closes)
  if (closing !== null && arrival >= closing) return { code: 'closed-before-arrival', title: '预计到达时已闭馆', detail: `${place.closes} 关闭，当天不建议再去` }
  if (closing !== null && leave > closing) return { code: 'closing-short', title: '当天可游览时间不足', detail: `预计结束晚于 ${place.closes} 闭馆` }
  if (leave > 22 * 60 + 30) return { code: 'day-overflow', title: '当天时间不足', detail: `预计 ${formatClockMinutes(leave)} 结束` }
  return null
}

function departureReadiness({ place, clock, travelMinutes, hasOrigin, routeStatus, previewDay = false }) {
  if (!place) return { status: 'empty', label: '暂无下一站' }
  if (previewDay) return { status: 'preview', label: '到当天再开始', detail: '这是日程预览，不使用现在的时间和位置。' }
  if (!hasOrigin) return { status: 'locate', label: '定位并计算路线', detail: '需要先知道你从哪里出发。' }
  if (routeStatus === 'loading') return { status: 'loading', label: '正在计算路线', detail: '路线返回后再判断是否来得及。' }
  if (!Number.isFinite(travelMinutes)) return { status: 'verify-route', label: '在高德核对路线', detail: '还没有可用的行程时间。' }
  const now = clockToMinutes(clock)
  const timing = scheduleRuntimeStop(now + 5, travelMinutes, place)
  const issue = runtimeStopIssue(place, { arrival: timing.arrival, leave: timing.leave, now })
  if (issue) return { status: 'blocked', label: '调整今天路线', detail: issue.title, issue }
  if (place.closes === '待确认' && !place.openingVerifiedAt) return { status: 'verify', label: '先核对营业状态', detail: '开放时间未确认，不能先判定可以前往。' }
  return { status: 'ready', label: '开始前往', timing }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function tripDayIndexForDate(trip, dateKey = localDateKey()) {
  if (!trip?.startDate || !trip?.endDate || dateKey < trip.startDate || dateKey > trip.endDate) return -1
  const start = new Date(`${trip.startDate}T00:00:00`)
  const current = new Date(`${dateKey}T00:00:00`)
  return Math.round((current - start) / 86400000)
}

function displayedTripStatus(trip, dateKey = localDateKey()) {
  if (!trip) return ''
  if (trip.status === '已完成') return '已完成'
  if (['旅行中', '已暂停'].includes(trip.status)) return trip.status
  if (trip.endDate && trip.endDate < dateKey) return '已结束'
  if (trip.startDate && trip.startDate <= dateKey && (!trip.endDate || dateKey <= trip.endDate)) return '可出发'
  return trip.status || '待出发'
}

function bookingTimingLabel(task, trip, now = new Date()) {
  if (task.status === 'confirmed') {
    if (!task.confirmedAt) return '已确认 · 时间未记录'
    const confirmed = new Date(task.confirmedAt)
    return `已于 ${confirmed.getMonth() + 1}/${confirmed.getDate()} ${String(confirmed.getHours()).padStart(2, '0')}:${String(confirmed.getMinutes()).padStart(2, '0')} 确认`
  }
  if (task.needsReview) return '行程已调整 · 需要重新确认'
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = trip?.startDate ? new Date(`${trip.startDate}T00:00:00`) : null
  const days = start && !Number.isNaN(start.getTime()) ? Math.ceil((start - today) / 86400000) : null
  if (days === null) return task.deadline
  if (days < 0 && localDateKey(now) <= trip.endDate) return '旅行进行中 · 现在核对'
  if (days < 0) return '行程已结束 · 仅保留记录'
  if (days === 0) return '今天出发 · 现在处理'
  const recommendedLead = task.kind === 'transport' ? 14 : task.kind === 'stay' ? 7 : task.placeId ? 3 : 7
  if (days <= recommendedLead) return `距出发 ${days} 天 · 建议现在确认`
  return task.deadline
}

function networkStatusLabel(online) {
  return online ? '' : '当前离线：已保存的行程仍可查看，实时路线、搜索和营业状态暂停更新。'
}

function scheduleRuntimeStop(cursor, travelMinutes, place, appointmentBuffer = 20) {
  const earliestArrival = cursor + travelMinutes
  const appointment = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
  const canMeetAppointment = appointment !== null && earliestArrival <= appointment
  const departure = canMeetAppointment ? Math.max(cursor, appointment - appointmentBuffer - travelMinutes) : cursor
  const arrival = departure + travelMinutes
  const visitStart = appointment !== null && arrival <= appointment ? appointment : arrival
  const leave = visitStart + durationToMinutes(place.duration)
  return { departure, arrival, visitStart, leave, appointment }
}

function buildRuntimeDayStatus({ ids, places, visitedIds = [], clock, stage = 'ready', condition = '', energy = 'normal', transportMode = 'public' }) {
  const placeMap = new Map(places.map(place => [place.id, place]))
  const now = clockToMinutes(clock)
  let cursor = now + (stage === 'ready' ? 5 : 0)
  let blocked = false
  let previousPlace = null
  return ids.map(id => {
    const place = placeMap.get(id)
    if (!place) return { id, missing: true }
    if (visitedIds.includes(id)) {
      previousPlace = place
      return { id, place, done: true, issue: null }
    }
    const fixedAt = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
    if (fixedAt !== null && now >= fixedAt) return { id, place, issue: { code: 'appointment-passed', title: `${place.fixed} 预约已过`, detail: '当天无法再按原预约执行' } }
    if (blocked) return { id, place, issue: { code: 'blocked-by-previous', title: '当天时间不足', detail: '前序安排已超出当天' } }
    const recommended = getTransport(place, condition, energy, transportMode).recommended
    const fallbackTravelMinutes = Number.isFinite(recommended.minutes) ? recommended.minutes : transportMode === 'walk' ? 20 : transportMode === 'drive' ? 30 : 35
    const travelMinutes = previousPlace?.position && place.position ? transferReserveMinutes(previousPlace, place, transportMode) : fallbackTravelMinutes
    const { departure, arrival, visitStart, leave, appointment } = scheduleRuntimeStop(cursor, travelMinutes, place)
    const issue = runtimeStopIssue(place, { arrival, leave, now })
    if (issue) blocked = true
    else {
      cursor = leave
      previousPlace = place
    }
    return { id, place, departure, arrival, visitStart, leave, appointment, travelMinutes, issue }
  })
}

function buildTodayFeasibilityProposal({ ids, places, visitedIds = [], lockedIds = [], clock, condition = '', energy = 'normal', transportMode = 'public' }) {
  const completed = ids.filter(id => visitedIds.includes(id))
  const pending = sortForCondition(ids.filter(id => !visitedIds.includes(id)), places, condition, lockedIds)
  const accepted = []
  const overflow = []
  const targetDayEnd = condition === 'tired' || energy === 'low' ? 20 * 60 : condition === 'late' ? 21 * 60 + 30 : 22 * 60 + 30
  pending.forEach(id => {
    const status = buildRuntimeDayStatus({ ids: [...accepted, id], places, clock, condition, energy, transportMode }).at(-1)
    const paceIssue = !status?.issue && Number.isFinite(status?.leave) && status.leave > targetDayEnd
      ? { code: 'pace-overflow', title: condition === 'tired' || energy === 'low' ? '轻松节奏不应晚于 20:00' : '当天结束太晚', detail: `预计 ${formatClockMinutes(status.leave)} 结束` }
      : null
    if (status?.issue || paceIssue) overflow.push({ id, place: status.place, issue: status.issue || paceIssue })
    else accepted.push(id)
  })
  return { nextPlan: [...completed, ...accepted], accepted, overflow }
}

function routeEvidence(option) {
  const count = option.places.length
  const verified = option.places.filter(place => place.source === 'amap').length
  const rated = option.places.filter(place => Number.isFinite(place.rating)).length
  const photographed = option.places.filter(place => place.photos?.length).length
  const unknownHours = option.places.filter(place => place.closes === '待确认').length
  return {
    count,
    verified,
    rated,
    photographed,
    unknownHours,
    summary: [`高德地点 ${count} 个`, rated ? `${rated} 个有公开评分` : '评分待补充', photographed ? `${photographed} 个有地点图片` : '图片待补充'].join(' · '),
    pending: unknownHours ? `${unknownHours} 个营业时间待核对` : '营业时间已记录'
  }
}

function placeSelectionReason(place, option) {
  if (place.priority === 'must') return '你标记的必去地点'
  if (/餐厅|美食|咖啡|小吃/.test(`${place.category} ${place.name}`)) return `补充${place.area || '沿途'}用餐停靠`
  if (Number.isFinite(place.rating) && place.rating >= 4.7) return `公开评分 ${place.rating}，并与路线同区组合`
  if (option?.id === 'popular') return '优先保留热门地点，再按区域减少折返'
  if (option?.id === 'relaxed') return '控制每日密度，给移动和休息留时间'
  return '与前后地点按区域组合，减少折返'
}

function useCurrentClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
}

function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

function useDeviceLocation() {
  const [location, setLocation] = useState({ status: 'idle', coords: null, accuracy: null, updatedAt: null, error: '', tracking: false })
  const watchId = useRef(null)
  const applyPosition = useCallback(position => setLocation(value => ({
    ...value,
    status: 'ready',
    coords: [position.coords.longitude, position.coords.latitude],
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    updatedAt: new Date().toISOString(),
    error: ''
  })), [])
  const applyError = useCallback(error => setLocation(value => ({ ...value, status: 'error', error: error.code === 1 ? '定位权限未开启' : '暂时无法获取位置' })), [])
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation(value => ({ ...value, status: 'unsupported', error: '当前浏览器不支持定位', tracking: false }))
      return
    }
    setLocation(value => ({ ...value, status: 'loading', error: '' }))
    navigator.geolocation.getCurrentPosition(applyPosition, applyError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }, [applyError, applyPosition])
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation(value => ({ ...value, status: 'unsupported', error: '当前浏览器不支持定位', tracking: false }))
      return
    }
    if (watchId.current !== null) return
    setLocation(value => ({ ...value, status: value.coords ? 'ready' : 'loading', tracking: true, error: '' }))
    watchId.current = navigator.geolocation.watchPosition(applyPosition, applyError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 })
  }, [applyError, applyPosition])
  const stopTracking = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setLocation(value => ({ ...value, tracking: false }))
  }, [])
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible' && watchId.current !== null) requestLocation()
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    return () => document.removeEventListener('visibilitychange', refreshOnReturn)
  }, [requestLocation])
  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
  }, [])
  return { ...location, requestLocation, startTracking, stopTracking }
}

function amapNavigationUrl(place, transportMode) {
  if (!Array.isArray(place?.position)) return ''
  const [lng, lat] = place.position
  const mode = { transit: 'bus', drive: 'car', shuttle: 'car', walk: 'walk', taxi: 'car', charter: 'car' }[transportMode] || 'bus'
  const params = new URLSearchParams({
    to: `${lng},${lat},${place.name}`,
    mode,
    policy: mode === 'bus' ? '0' : '1',
    src: 'next-stop-travel',
    callnative: '1'
  })
  return `https://uri.amap.com/navigation?${params.toString()}`
}

function amapPlaceUrl(place) {
  const keyword = [place?.name, place?.area].filter(Boolean).join(' ')
  if (!keyword) return 'https://www.amap.com/'
  return `https://www.amap.com/search?query=${encodeURIComponent(keyword)}`
}

const destinationGuides = [
  {
    match: /上海/,
    summary: '上海的体验差异主要来自跨江与跨区移动。两日游先选一侧做主线，比堆地标更重要。',
    zones: [
      ['黄浦—外滩', '经典地标与夜景集中，第一次来最稳', '热门时段步行密度高'],
      ['静安—徐汇', '街区、咖啡与城市生活感更强', '适合慢游和连续步行'],
      ['浦东—陆家嘴', '城市天际线与亲子场馆集中', '跨江需多留 30–45 分钟']
    ],
    stay: '两日经典线优先住人民广场、南京东路或地铁 2 号线沿线，减少跨区折返。',
    watch: '外滩、豫园等热门点尽量错开午后与夜景高峰；具体开放和预约仍需出发前核对。'
  },
  {
    match: /杭州/,
    summary: '杭州的关键不是“景点越多越好”，而是把西湖步行区与跨区场馆拆开。',
    zones: [
      ['西湖东线', '交通方便，适合第一次来和夜游', '周末湖滨客流较大'],
      ['西湖北线', '自然、人文与寺庙更集中', '步行和坡度相对更多'],
      ['运河—拱墅', '博物馆与街区体验完整', '和西湖至少预留 40 分钟移动']
    ],
    stay: '优先选择龙翔桥、凤起路或武林广场周边，公交和地铁都更稳定。',
    watch: '西湖环线容易低估步行距离；雷峰塔、灵隐寺等票务与客流以当天官方信息为准。'
  },
  {
    match: /成都/,
    summary: '成都适合按“熊猫基地—市中心—西部人文”分片，避免每天横穿城区。',
    zones: [
      ['成华—熊猫基地', '亲子和第一次来优先', '建议早到并单独安排半天'],
      ['锦江—青羊', '美食、街区和夜生活集中', '地铁覆盖较好'],
      ['武侯—杜甫草堂', '人文景点密度更高', '适合串联一整天']
    ],
    stay: '春熙路、天府广场附近适合首访；若熊猫基地是重点，不必为一站专门换酒店。',
    watch: '熊猫活动受天气与时段影响明显；热门餐厅排队时间不要当成固定事实。'
  },
  {
    match: /大理/,
    summary: '大理最影响体验的是洱海两岸距离和住宿位置，不适合把环海点当作市区短途。',
    zones: [
      ['大理古城—苍山', '人文、餐饮和公共交通更方便', '热门街区晚间较拥挤'],
      ['才村—龙龛', '看日出与慢骑行更合适', '夜间返程选择较少'],
      ['喜洲—海舌', '田野与古镇体验集中', '往返古城需留足移动时间']
    ],
    stay: '公共交通优先古城或才村；想看日出可把一晚放在洱海西岸。',
    watch: '环海移动受天气、路况和车辆限制影响，长距离当天再用地图确认。'
  }
]

function destinationGuide(city) {
  const known = destinationGuides.find(item => item.match.test(city || ''))
  if (known) return known
  return {
    summary: `${city || '目的地'}的路线先按相邻区域成组，再根据住处与交通方式决定每天边界。`,
    zones: [['核心城区', '第一次到访和公共交通更稳', '热门时段可能拥挤'], ['特色街区', '适合餐饮、散步与临时发现', '营业时间需要逐店核对'], ['近郊方向', '自然或主题体验更完整', '往返通常占用半天以上']],
    stay: '优先住在两条以上公共交通线路交会处，或靠近第一天与最后一天的主要活动区。',
    watch: '区域建议用于路线取舍，不代表实时客流、营业或票务状态。'
  }
}

function buildIntentSummary({ note, styles, pace, transport, dayStartTime, travelConstraint, budget, diet, lodgingPreference, arrivalTime, departureTime }) {
  const noteText = String(note || '').trim()
  const facts = [
    styles.length ? `偏好 ${styles.join('、')}` : '尚未限定主题，可保留多样性',
    `${pace === 'slow' ? '轻松' : pace === 'full' ? '充实' : '适中'}节奏 · ${transport === 'drive' ? '自驾' : transport === 'walk' ? '步行为主' : '公共交通'}`,
    `${dayStartTime} 左右开始${travelConstraint !== 'none' ? ` · ${travelConstraintMeta[travelConstraint]?.label}` : ''}`,
    budget !== 'unset' ? `预算 ${budget}` : '预算未限定',
    diet ? `饮食要求：${diet}` : null,
    lodgingPreference ? `住宿倾向：${lodgingPreference}` : null,
    noteText ? `特别说明：${noteText}` : null
  ].filter(Boolean)
  const questions = []
  if (!arrivalTime || !departureTime) questions.push({ id: 'travel-time', label: '补充抵达/返程时间', detail: '会影响第一天和最后一天能排多少内容' })
  if (!lodgingPreference) questions.push({ id: 'stay', label: '住宿区域还没定', detail: '先按交通便利区域规划，之后可替换真实住宿' })
  if (budget === 'unset') questions.push({ id: 'budget', label: '预算未限定', detail: '当前会优先体验与少折返，不按价格筛选' })
  if (/长辈|老人|少走/.test(noteText) && pace === 'full') questions.unshift({ id: 'pace-conflict', label: '节奏存在冲突', detail: '“充实”与“少走路”同时出现，已优先降低密度' })
  return { facts, questions: questions.slice(0, 3) }
}

function estimateRouteOption(option, days, transport) {
  const places = option?.places || []
  const ticketCandidates = places.filter(place => /景点|自然|艺术|博物馆|乐园/.test(place.category || '')).length
  const baseDaily = transport === 'drive' ? 220 : transport === 'walk' ? 120 : 150
  const low = Math.max(1, days) * baseDaily + ticketCandidates * 40
  const high = Math.max(1, days) * (baseDaily + 100) + ticketCandidates * 120
  const transfer = option?.totalKm ? transport === 'drive' ? `${option.totalKm} 公里级跨区移动` : `约 ${Math.max(2, Math.round(option.totalKm / 8))} 段公共交通` : '路线待确认'
  const crowdScore = places.reduce((score, place) => score + (Number(place.rating) >= 4.7 ? 1 : 0), 0)
  const bookingCount = places.filter(place => place.fixed || /博物馆|乐园|演出|景区/.test(`${place.category} ${place.name}`)).length
  return {
    budget: `¥${Math.round(low / 50) * 50}–${Math.round(high / 50) * 50}`,
    budgetNote: '每人粗估 · 不含住宿与城际交通',
    transfer,
    crowd: crowdScore >= Math.max(2, places.length / 2) ? '热门时段偏高' : crowdScore ? '中等' : '相对分散',
    booking: bookingCount ? `${bookingCount} 处建议提前核对` : null
  }
}

function bookingTasksForTrip(trip, places) {
  const existing = Array.isArray(trip?.bookingTasks) ? trip.bookingTasks : []
  if (existing.length) return existing
  const tasks = []
  if (trip?.origin && normalizePlaceLabel(trip.origin) !== normalizePlaceLabel(trip.city)) tasks.push({ id: `intercity-${trip.id}`, kind: 'transport', title: `${trip.origin}往返${trip.city}`, detail: '车次或航班价格与余票待核对', deadline: '建议出发前 7–14 天确认', status: 'todo' })
  tasks.push({ id: `stay-${trip.id}`, kind: 'stay', title: '住宿', detail: trip?.stays?.length ? `已记录 ${trip.stays.length} 段住宿` : '住宿区域与房态待确认', deadline: '建议出发前 7 天确认', status: trip?.stays?.length ? 'confirmed' : 'todo' })
  places.filter(place => !place.isHotel && (place.fixed || /博物馆|乐园|演出|景区|寺|故宫|熊猫/.test(`${place.category} ${place.name}`))).slice(0, 6).forEach(place => {
    tasks.push({ id: `place-${place.id}`, kind: 'ticket', placeId: place.id, title: place.name, detail: place.fixed ? `已记录 ${place.fixed} 到达，票务状态待确认` : '门票、预约规则与临时闭馆待核对', deadline: place.fixed ? '尽快确认预约凭证' : '建议出发前 1–3 天核对', status: 'todo' })
  })
  return tasks
}

function executionRisks({ trip, current, plan, places, visited, clock, bookingTasks, condition, energy, transportMode }) {
  if (!current) return []
  const risks = []
  if (condition === 'tired' || energy === 'low') {
    risks.push({
      id: 'rest',
      level: 'medium',
      label: '当前建议',
      title: transportMode === 'drive' ? '先休息，再继续开车' : '先休息，再继续行程',
      detail: `在${current.name}附近休息 20–30 分钟，状态恢复后再出发。`,
      action: '调整状态'
    })
  }
  const pendingCurrent = bookingTasks.find(task => task.placeId === current.id && task.status === 'todo')
  if (pendingCurrent) risks.push({ id: 'booking', level: 'high', title: `${current.name}预约仍待确认`, detail: '出发前先核对票务或入园规则，避免到场无法进入。', action: '查看待办' })
  if (current.closes === '待确认') risks.push({ id: 'hours', level: 'medium', title: '营业时间尚未确认', detail: '当前推荐保留，但不把未知开放状态当作已确认事实。', action: '去核对' })
  const now = clockToMinutes(clock)
  const currentFixedAt = current.fixed ? clockToMinutes(current.fixed) : null
  if (Number.isFinite(currentFixedAt) && now >= currentFixedAt) risks.push({ id: 'late', level: 'high', label: '当前要做', title: '先确认是否还能入场', detail: `${current.name}的预约时间已过，出发前先联系地点确认。`, action: '查看待办' })
  else if (Number.isFinite(currentFixedAt) && now > currentFixedAt - 30) risks.push({ id: 'late', level: 'high', title: '距离预约时间不足 30 分钟', detail: '建议立即确认路线；后续非预约地点可能顺延。', action: '查看路线' })
  const futureFixed = plan
    .map(id => places.get(id))
    .filter(place => place && !visited.includes(place.id) && place.id !== current.id && place.fixed && clockToMinutes(place.fixed) > now)
    .sort((a, b) => clockToMinutes(a.fixed) - clockToMinutes(b.fixed))[0]
  if (futureFixed) risks.push({ id: 'downstream', level: 'medium', title: `后续 ${futureFixed.fixed} 有预约`, detail: `完成当前站后仍需给 ${futureFixed.name} 预留交通缓冲。`, action: '查看后续' })
  return risks.slice(0, 2)
}

function describePlanDiff(before, after, placeMap) {
  const beforeFlat = before.flat()
  const afterFlat = after.flat()
  const removed = beforeFlat.filter(id => !afterFlat.includes(id)).map(id => placeMap.get(id)?.name).filter(Boolean)
  const added = afterFlat.filter(id => !beforeFlat.includes(id)).map(id => placeMap.get(id)?.name).filter(Boolean)
  const moved = afterFlat.filter(id => beforeFlat.includes(id) && beforeFlat.indexOf(id) !== afterFlat.indexOf(id)).length
  return [removed.length ? `移除 ${removed.join('、')}` : null, added.length ? `新增 ${added.join('、')}` : null, moved ? `${moved} 个地点顺序或日期变化` : null].filter(Boolean).join(' · ') || '路线内容未改变'
}

function stayForTripDate(stays, date) {
  if (!stays.length) return null
  if (!date) return stays[0]
  return stays.find(stay => {
    const hasStarted = !stay.checkIn || stay.checkIn <= date
    const hasNotEnded = !stay.checkOut || date < stay.checkOut
    return hasStarted && hasNotEnded
  }) || null
}

const xinjiangInitialPlans = [[1], [2], [...initialPlan], [7], [8], [9], [10], [], []]

const initialTrips = [
  { id: 'xinjiang', city: '新疆', cityCode: 'XINJIANG', title: '新疆・北疆自驾', dates: '2026.08.31 — 09.08', startDate: '2026-08-31', endDate: '2026-09-08', days: 9, currentDay: 3, must: 4, saved: 10, people: 2, hotel: '布尔津・河畔民宿', location: '布尔津・前往禾木', temperature: '16°', weather: '晴间多云', status: '旅行中', tone: 'gold', styles: ['自驾', '自然'], dailyPlans: xinjiangInitialPlans.map(day => [...day]) },
  { id: 'dali', city: '大理', cityCode: 'DALI', title: '大理・洱海慢游', dates: '2026.11.12 — 11.16', startDate: '2026-11-12', endDate: '2026-11-16', days: 5, must: 2, saved: 3, people: 2, hotel: '才村码头附近', status: '待出发', tone: 'sage', styles: ['慢游', '自然'], dailyPlans: [[101], [102], [103], [], []] },
  { id: 'chengdu', city: '成都', cityCode: 'CHENGDU', title: '成都・周末吃逛', dates: '2027.02.19 — 02.22', startDate: '2027-02-19', endDate: '2027-02-22', days: 4, must: 1, saved: 3, people: 2, hotel: '春熙路附近', status: '计划中', tone: 'brick', styles: ['美食', '慢游'], dailyPlans: [[201], [202], [203], []] }
]

function tripTransportMode(trip) {
  if (trip?.transportPreference) return trip.transportPreference
  if (trip?.styles?.includes('自驾') || /自驾/.test(trip?.title || '')) return 'drive'
  return 'public'
}

const conditionIcons = {
  rain: CloudSun, tired: Coffee, hungry: UtensilsCrossed,
  late: Clock3, skip: X, closed: RotateCcw
}

const amapSearchCache = new Map()

function loadAMap(plugins = []) {
  try {
    const key = configureAMap()
    return AMapLoader.load({ key, version: '2.0', plugins })
  } catch (error) {
    return Promise.reject(error)
  }
}

function poiCategory(type = '') {
  if (type.includes('咖啡')) return '咖啡'
  if (type.includes('餐饮') || type.includes('美食')) return '美食'
  if (type.includes('购物') || type.includes('商场')) return '购物'
  if (type.includes('住宿') || type.includes('酒店')) return '住宿'
  if (type.includes('风景') || type.includes('旅游') || type.includes('公园')) return '景点'
  return '地点'
}

function poiTone(category) {
  return { 咖啡: 'blue', 美食: 'ochre', 购物: 'red', 住宿: 'cream', 景点: 'green' }[category] || 'violet'
}

function estimatePlaceDuration(poi, category) {
  const text = `${poi.name || ''} ${poi.type || ''}`
  if (/博物馆|美术馆|科技馆|纪念馆/.test(text)) return '约 2–3 小时'
  if (/山|湖|大型景区|度假区/.test(text)) return '约 3–4 小时'
  if (/外滩|古镇|古城|步行街|老街|街区|园林|公园/.test(text)) return '约 1.5–2 小时'
  if (category === '美食') return '约 60–90 分钟'
  if (category === '咖啡') return '约 45–60 分钟'
  if (category === '购物') return '约 1.5–2 小时'
  if (category === '景点') return '约 2–3 小时'
  return '约 1–2 小时'
}

function poiToPlace(poi, city) {
  const lng = typeof poi.location?.getLng === 'function' ? poi.location.getLng() : poi.location?.lng
  const lat = typeof poi.location?.getLat === 'function' ? poi.location.getLat() : poi.location?.lat
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null
  const category = poiCategory(poi.type || '')
  const address = Array.isArray(poi.address) ? poi.address.join('') : (poi.address || '地址待确认')
  const area = poi.adname || poi.cityname || city
  const ratingValue = Number.parseFloat(poi.biz_ext?.rating || poi.business?.rating || poi.rating)
  const photos = (poi.photos || []).map(photo => photo.url || photo).filter(Boolean).map(url => String(url).replace(/^http:/, 'https:'))
  const rawId = String(poi.id || `${poi.name}-${lng}-${lat}`)
  const seed = [...rawId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return {
    id: `amap-${rawId}`, amapId: poi.id, source: 'amap', name: poi.name || '未命名地点',
    sub: `${area}・${address}`, area, category, priority: 'want', tone: poiTone(category),
    travel: null, walk: null, distance: null, closes: '待确认',
    mode: city === '新疆' ? 'drive' : undefined, road: '加入路线后查看导航', fuelCost: '待导航',
    position: [Number(lng), Number(lat)], x: 20 + (seed % 60), y: 20 + ((seed * 7) % 60),
    indoor: ['咖啡', '美食', '购物', '住宿'].includes(category), nearby: 0,
    duration: estimatePlaceDuration(poi, category), durationEstimated: true, rating: Number.isFinite(ratingValue) ? ratingValue : null, reviewCount: 0,
    summary: `来自高德地图的真实地点。${address === '地址待确认' ? '具体地址和营业时间建议出发前再次确认。' : `地址：${address}。营业时间建议出发前再次确认。`}`,
    photos: photos.slice(0, 4), reviews: []
  }
}

async function searchAmapPlaces(search, city, type = '', pageSize = 12) {
  const query = search.trim()
  if (!query || !city) return []
  const cacheKey = `${city}:${type}:${pageSize}:${query.toLowerCase()}`
  if (amapSearchCache.has(cacheKey)) return amapSearchCache.get(cacheKey)

  const AMap = await loadAMap(['AMap.PlaceSearch'])
  if (!AMap.PlaceSearch) await new Promise(resolve => AMap.plugin('AMap.PlaceSearch', resolve))
  const pois = await new Promise((resolve, reject) => {
    const placeSearch = new AMap.PlaceSearch({
      city: city === '新疆' ? '650000' : city,
      citylimit: true,
      type: type || undefined,
      pageSize,
      pageIndex: 1,
      children: 0,
      extensions: 'all'
    })
    placeSearch.search(query, (searchStatus, result) => {
      if (searchStatus === 'complete') resolve(result?.poiList?.pois || [])
      else if (searchStatus === 'no_data') resolve([])
      else {
        const reason = typeof result === 'string' ? result : result?.info
        reject(new Error(reason && !String(reason).includes('[object ') ? reason : '地点查询暂时不可用，请稍后重试。'))
      }
    })
  })
  const mapped = pois.map(poi => poiToPlace(poi, city)).filter(Boolean)
  amapSearchCache.set(cacheKey, mapped)
  return mapped
}

const amapTransitCache = new Map()
const amapDrivingCache = new Map()

function transitSegmentText(segment) {
  if (segment?.instruction) return String(segment.instruction).replace(/\s+/g, ' ').trim()
  const detail = segment?.transit
  if (!detail) return ''
  if (segment.transit_mode === 'WALK') return `步行 ${Math.round(Number(segment.distance || 0))} 米`
  const line = detail.lines?.[0]?.name || '公共交通'
  const onStation = detail.on_station?.name || '上车站'
  const offStation = detail.off_station?.name || '下车站'
  const stopCount = Number(detail.via_num)
  return `${onStation}乘${line}，${Number.isFinite(stopCount) ? `经过 ${stopCount + 1} 站，` : ''}${offStation}下车`
}

async function searchAmapTransitRoute(origin, destination, city) {
  if (!Array.isArray(origin) || !Array.isArray(destination) || !city) return null
  const cacheKey = `${city}:${origin.join(',')}:${destination.join(',')}`
  if (amapTransitCache.has(cacheKey)) return amapTransitCache.get(cacheKey)
  const request = (async () => {
    const AMap = await loadAMap(['AMap.Transfer'])
    if (!AMap.Transfer) await new Promise(resolve => AMap.plugin('AMap.Transfer', resolve))
    const result = await new Promise((resolve, reject) => {
      const transfer = new AMap.Transfer({
        city,
        policy: AMap.TransferPolicy?.LEAST_TIME ?? 0,
        nightflag: true,
        extensions: 'all'
      })
      transfer.search(new AMap.LngLat(origin[0], origin[1]), new AMap.LngLat(destination[0], destination[1]), (status, routeResult) => {
        if (status === 'complete') resolve(routeResult)
        else if (status === 'no_data') resolve(null)
        else reject(new Error(typeof routeResult === 'string' ? routeResult : (routeResult?.info || '公交路线查询失败')))
      })
    })
    const plan = result?.plans?.[0]
    if (!plan) return null
    const steps = (plan.segments || []).map(transitSegmentText).filter(Boolean)
    return {
      minutes: Math.max(1, Math.round(Number(plan.time || 0) / 60)),
      walkMeters: Math.round(Number(plan.walking_distance || 0)),
      cost: Number.isFinite(Number(plan.cost)) ? Number(plan.cost) : null,
      steps
    }
  })().catch(error => {
    amapTransitCache.delete(cacheKey)
    throw error
  })
  amapTransitCache.set(cacheKey, request)
  return request
}

async function searchAmapDrivingRoute(origin, destination) {
  if (!Array.isArray(origin) || !Array.isArray(destination)) return null
  const cacheKey = `${origin.join(',')}:${destination.join(',')}`
  if (amapDrivingCache.has(cacheKey)) return amapDrivingCache.get(cacheKey)
  const request = (async () => {
    const AMap = await loadAMap(['AMap.Driving'])
    if (!AMap.Driving) await new Promise(resolve => AMap.plugin('AMap.Driving', resolve))
    const result = await new Promise((resolve, reject) => {
      const driving = new AMap.Driving({
        policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0,
        showTraffic: false,
        extensions: 'all'
      })
      driving.search(new AMap.LngLat(origin[0], origin[1]), new AMap.LngLat(destination[0], destination[1]), (status, routeResult) => {
        if (status === 'complete') resolve(routeResult)
        else if (status === 'no_data') resolve(null)
        else reject(new Error(typeof routeResult === 'string' ? routeResult : (routeResult?.info || '驾车路线查询失败')))
      })
    })
    const route = result?.routes?.[0]
    if (!route) return null
    return {
      minutes: Math.max(1, Math.round(Number(route.time || 0) / 60)),
      distanceKm: Math.round(Number(route.distance || 0) / 100) / 10,
      tolls: Number.isFinite(Number(route.tolls)) ? Number(route.tolls) : null
    }
  })().catch(error => {
    amapDrivingCache.delete(cacheKey)
    throw error
  })
  amapDrivingCache.set(cacheKey, request)
  return request
}

function useAmapTransitRoute(origin, destination, city, enabled = true) {
  const [state, setState] = useState({ status: 'idle', route: null })
  const originKey = Array.isArray(origin) ? origin.join(',') : ''
  const destinationKey = Array.isArray(destination) ? destination.join(',') : ''
  useEffect(() => {
    let cancelled = false
    if (!enabled || !originKey || !destinationKey || !city) {
      setState({ status: 'idle', route: null })
      return undefined
    }
    setState({ status: 'loading', route: null })
    searchAmapTransitRoute(origin, destination, city).then(route => {
      if (!cancelled) setState({ status: route ? 'complete' : 'empty', route })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error', route: null })
    })
    return () => { cancelled = true }
  }, [originKey, destinationKey, city, enabled])
  return state
}

function useAmapDrivingRoute(origin, destination, enabled = true) {
  const [state, setState] = useState({ status: 'idle', route: null })
  const originKey = Array.isArray(origin) ? origin.join(',') : ''
  const destinationKey = Array.isArray(destination) ? destination.join(',') : ''
  useEffect(() => {
    let cancelled = false
    if (!enabled || !originKey || !destinationKey) {
      setState({ status: 'idle', route: null })
      return undefined
    }
    setState({ status: 'loading', route: null })
    searchAmapDrivingRoute(origin, destination).then(route => {
      if (!cancelled) setState({ status: route ? 'complete' : 'empty', route })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error', route: null })
    })
    return () => { cancelled = true }
  }, [originKey, destinationKey, enabled])
  return state
}

const amapWeatherCache = new Map()

function useAmapWeather(city, enabled = true) {
  const [state, setState] = useState({ status: 'idle', weather: null })
  useEffect(() => {
    let cancelled = false
    if (!enabled || !city) {
      setState({ status: 'idle', weather: null })
      return undefined
    }
    const cached = amapWeatherCache.get(city)
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
      setState({ status: 'complete', weather: cached.weather })
      return undefined
    }
    setState({ status: 'loading', weather: null })
    loadAMap(['AMap.Weather']).then(AMap => new Promise((resolve, reject) => {
      if (!AMap.Weather) return reject(new Error('天气服务不可用'))
      new AMap.Weather().getLive(city === '新疆' ? '乌鲁木齐市' : city, (status, result) => {
        if (status === 'complete' && result) resolve(result)
        else reject(new Error(typeof result === 'string' ? result : '天气查询失败'))
      })
    })).then(result => {
      if (cancelled) return
      const weather = { temperature: result.temperature ? `${result.temperature}°` : '--', label: result.weather || '天气待确认', province: result.province || '', city: result.city || city }
      amapWeatherCache.set(city, { at: Date.now(), weather })
      setState({ status: 'complete', weather })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error', weather: null })
    })
    return () => { cancelled = true }
  }, [city, enabled])
  return state
}

function placeOpenLabel(place) {
  if (place.closes === '待确认') return '营业时间待确认'
  if (place.closes === '全天') return '全天开放'
  return `${place.closes} 结束营业`
}

function placeClosingSentence(place) {
  if (place.closes === '待确认') return '营业时间待确认'
  if (place.closes === '全天') return '全天开放'
  return `${place.closes} 关门`
}

function useAmapPlaceSearch(search, city, type = '') {
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const requestRef = React.useRef(0)
  const query = search.trim()

  useEffect(() => {
    const requestId = ++requestRef.current
    setError('')
    if (!query || !city) {
      setResults([])
      setStatus('idle')
      return undefined
    }
    if (query.length < 2) {
      setResults([])
      setStatus('short')
      return undefined
    }

    setResults([])
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const mapped = await searchAmapPlaces(query, city, type, 12)
        if (requestRef.current !== requestId) return
        setResults(mapped)
        setStatus('complete')
      } catch (searchFailure) {
        if (requestRef.current !== requestId) return
        console.error('高德地点搜索失败', searchFailure)
        setResults([])
        setError(searchFailure.message || '暂时无法搜索，请稍后重试')
        setStatus('error')
      }
    }, 480)
    return () => clearTimeout(timer)
  }, [city, query, type])

  return { query, results, status, error }
}

function dateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.round((end - start) / 86400000) + 1
}

function placeDistance(a, b) {
  if (!a?.position || !b?.position) return Number.POSITIVE_INFINITY
  const toRad = value => value * Math.PI / 180
  const [lng1, lat1] = a.position
  const [lng2, lat2] = b.position
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const value = Math.min(1, Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2)
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function routeDistance(places) {
  return places.slice(1).reduce((total, place, index) => {
    const distance = placeDistance(places[index], place)
    return total + (Number.isFinite(distance) ? distance : 0)
  }, 0)
}

function improveRouteOrder(places) {
  let route = [...places]
  if (route.length < 4) return route
  for (let pass = 0; pass < route.length; pass += 1) {
    let improved = false
    const currentDistance = routeDistance(route)
    for (let start = 1; start < route.length - 1 && !improved; start += 1) {
      for (let end = start + 1; end < route.length; end += 1) {
        const candidate = [...route.slice(0, start), ...route.slice(start, end + 1).reverse(), ...route.slice(end + 1)]
        if (routeDistance(candidate) + 0.1 < currentDistance) {
          route = candidate
          improved = true
          break
        }
      }
    }
    if (!improved) break
  }
  return route
}

function buildFlexiblePlan(places, days, pace, hotel, tripStartDate = '') {
  const remaining = [...places]
  const ordered = []
  const firstHotel = Array.isArray(hotel) ? hotel[0] : hotel
  let anchor = firstHotel || remaining[0]
  while (remaining.length) {
    const next = remaining.reduce((best, place) => {
      if (!best) return place
      return placeDistance(anchor, place) < placeDistance(anchor, best) ? place : best
    }, null)
    ordered.push(next)
    remaining.splice(remaining.indexOf(next), 1)
    anchor = next
  }
  const route = improveRouteOrder(ordered)
  const groups = Array.from({ length: days }, () => [])
  const activeDays = Math.min(days, route.length)
  const baseSize = activeDays ? Math.floor(route.length / activeDays) : 0
  const remainder = activeDays ? route.length % activeDays : 0
  let cursor = 0
  for (let dayIndex = 0; dayIndex < activeDays; dayIndex += 1) {
    const groupSize = baseSize + (dayIndex < remainder ? 1 : 0)
    groups[dayIndex] = route.slice(cursor, cursor + groupSize)
    cursor += groupSize
  }
  const isMealStop = place => /美食|餐厅|小吃|咖啡|市集/.test(place?.category || '')
  groups.forEach((group, dayIndex) => {
    const movableMeals = group.filter(place => isMealStop(place) && place.priority !== 'must').slice(1)
    movableMeals.forEach(place => {
      const targetIndex = groups.map((target, index) => ({ index, meals: target.filter(isMealStop).length, size: target.length }))
        .filter(target => target.index !== dayIndex && target.meals === 0)
        .sort((a, b) => a.size - b.size || a.index - b.index)[0]?.index
      if (targetIndex === undefined) return
      groups[dayIndex] = groups[dayIndex].filter(item => item.id !== place.id)
      groups[targetIndex].push(place)
    })
  })
  if (Array.isArray(hotel) && hotel.length && tripStartDate) {
    groups.forEach((group, dayIndex) => {
      if (group.length < 2) return
      const date = new Date(`${tripStartDate}T00:00:00`)
      date.setDate(date.getDate() + dayIndex)
      const dateKey = date.toISOString().slice(0, 10)
      const dayHotel = hotel.find(stay => (!stay.checkIn || stay.checkIn <= dateKey) && (!stay.checkOut || dateKey < stay.checkOut)) || hotel[Math.min(dayIndex, hotel.length - 1)]
      const pool = [...group]
      const dayOrder = []
      let dayAnchor = dayHotel
      while (pool.length) {
        const next = pool.reduce((best, place) => !best || placeDistance(dayAnchor, place) < placeDistance(dayAnchor, best) ? place : best, null)
        dayOrder.push(next)
        pool.splice(pool.indexOf(next), 1)
        dayAnchor = next
      }
      groups[dayIndex] = dayOrder
    })
  }
  return groups
}

function semanticPlaceKey(place, city) {
  const normalizedName = normalizePlaceLabel(String(place?.name || '').replace(/[\uff08(][^\uff09)]*[\uff09)]/g, ''))
    .replace(/(?:旗舰店|总店|分店|新店|老店|景区|风景名胜区|旅游区)$/g, '')
  const landmark = classicLandmarks(city).find(name => normalizedName.includes(normalizePlaceLabel(name)))
  if (landmark) return `landmark:${normalizePlaceLabel(landmark)}`
  return `place:${normalizedName}:${normalizePlaceLabel(place?.category)}`
}

function uniqueRoutePlaces(places, options = {}) {
  const { semantic = false, city = '' } = options
  const seen = new Set()
  return places.filter(place => {
    if (!place) return false
    const key = semantic ? semanticPlaceKey(place, city) : place.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function balanceDailyMealStops(dailyPlans, places, startDay = 0) {
  const placeMap = new Map(places.map(place => [place.id, place]))
  const isMeal = id => /美食|餐厅|小吃|咖啡|市集/.test(placeMap.get(id)?.category || '')
  const next = dailyPlans.map(day => [...day])
  for (let dayIndex = startDay; dayIndex < next.length; dayIndex += 1) {
    const mealIds = next[dayIndex].filter(isMeal)
    const targetMealFloor = Math.ceil(next.slice(startDay).flat().filter(isMeal).length / Math.max(1, next.length - startDay))
    mealIds.slice(Math.max(1, targetMealFloor)).forEach(id => {
      const target = next.map((day, index) => ({ index, meals: day.filter(isMeal).length, size: day.length }))
        .filter(item => item.index >= startDay && item.index !== dayIndex)
        .sort((a, b) => a.meals - b.meals || a.size - b.size || a.index - b.index)[0]
      if (!target || target.meals >= next[dayIndex].filter(isMeal).length) return
      next[dayIndex] = next[dayIndex].filter(item => item !== id)
      next[target.index].push(id)
    })
  }
  return next
}

function capGuidedCategoryDensity(places, days) {
  const counts = new Map()
  const foodPattern = /美食|餐厅|小吃|咖啡|市集/
  return places.filter(place => {
    if (place.priority === 'must') return true
    const categoryKey = foodPattern.test(place.category || '') ? 'food' : normalizePlaceLabel(place.category || '其他')
    const limit = categoryKey === 'food' ? Math.max(2, days) : Math.max(2, days * 2)
    const current = counts.get(categoryKey) || 0
    if (current >= limit) return false
    counts.set(categoryKey, current + 1)
    return true
  })
}

function pickConnectedRoutePlaces(places, limit, maxLegKm) {
  const remaining = uniqueRoutePlaces(places)
  if (!remaining.length) return []
  const chosen = [remaining.shift()]
  while (remaining.length && chosen.length < limit) {
    const anchor = chosen.at(-1)
    let nearestIndex = 0
    for (let index = 1; index < remaining.length; index += 1) {
      if (placeDistance(anchor, remaining[index]) < placeDistance(anchor, remaining[nearestIndex])) nearestIndex = index
    }
    const [next] = remaining.splice(nearestIndex, 1)
    const legKm = placeDistance(anchor, next) * 1.25
    if (Number.isFinite(legKm) && legKm > maxLegKm && chosen.length >= 2) continue
    chosen.push(next)
  }
  return chosen
}

function routeOptionStats(groups) {
  let previous = null
  let totalKm = 0
  let maxDayKm = 0
  groups.forEach(group => {
    let dayKm = 0
    group.forEach(place => {
      if (previous) {
        const distance = placeDistance(previous, place)
        if (Number.isFinite(distance)) dayKm += distance * 1.25
      }
      previous = place
    })
    totalKm += dayKm
    maxDayKm = Math.max(maxDayKm, dayKm)
  })
  const maxDriveHours = maxDayKm ? Math.ceil((maxDayKm / 65) * 2) / 2 : null
  return {
    totalKm: totalKm ? Math.round(totalKm / 10) * 10 : null,
    maxDriveHours,
    maxStops: Math.max(0, ...groups.map(group => group.length))
  }
}

function formatDriveHours(hours) {
  if (!hours) return '由高德确认'
  const whole = Math.floor(hours)
  return hours % 1 ? `${whole} 小时 30 分` : `${whole} 小时`
}

function routeTransportMetric(transport, maxDriveHours) {
  if (transport === 'drive') return { value: formatDriveHours(maxDriveHours), label: '最长驾驶', compact: `最长驾驶 ${formatDriveHours(maxDriveHours)}` }
  if (transport === 'walk') return { value: '步行为主', label: '主要交通', compact: '主要交通 步行为主' }
  return { value: '公共交通', label: '主要交通', compact: '主要交通 公共交通' }
}

const routePreferenceRules = [
  { label: '经典地标', input: /经典|地标|第一次|首访|必打卡/, place: /地标|景区|名胜|博物馆|历史|古城|古镇|外滩|豫园|故宫|西湖|天池|熊猫/ },
  { label: '自然风景', input: /自然|风景|山岳|湖泊|湖景|海边|滨海|草原|户外/, place: /自然|风景|公园|山岳|湖泊|海边|滨海|草原|地貌|观景|村落/ },
  { label: '人文历史', input: /人文|文化|历史|古城|古镇|博物馆|艺术/, place: /人文|文化|历史|古城|古镇|博物馆|艺术|街区|村落/ },
  { label: '美食', input: /美食|吃|餐厅|小吃|咖啡/, place: /美食|餐厅|小吃|咖啡|市集/ },
  { label: '购物逛街', input: /购物|逛|商场|市集/, place: /购物|商场|市集|街区/ },
  { label: '亲子', input: /亲子|孩子|家庭/, place: /亲子|乐园|动物|公园|博物馆/ }
]

function preferenceProfile(styles, note) {
  const input = `${styles.join(' ')} ${note}`
  return routePreferenceRules.filter(rule => rule.input.test(input))
}

const classicLandmarksByCity = [
  { match: /上海/, names: ['外滩', '豫园', '南京路步行街', '上海博物馆'] },
  { match: /北京/, names: ['故宫博物院', '天安门广场', '颐和园', '天坛公园'] },
  { match: /杭州/, names: ['西湖风景名胜区', '灵隐寺', '河坊街', '中国大运河博物馆'] },
  { match: /成都/, names: ['成都大熊猫繁育研究基地', '武侯祠', '杜甫草堂', '宽窄巷子'] },
  { match: /广州/, names: ['广州塔', '陈家祠', '沙面岛', '越秀公园'] },
  { match: /深圳/, names: ['世界之窗', '莲花山公园', '大鹏所城', '深圳湾公园'] },
  { match: /大理/, names: ['洱海', '大理古城', '喜洲古镇', '苍山感通索道'] },
  { match: /新疆|乌鲁木齐/, names: ['天山天池', '新疆国际大巴扎', '新疆维吾尔自治区博物馆'] }
]

function classicLandmarks(city) {
  return classicLandmarksByCity.find(item => item.match.test(city))?.names || []
}

function normalizePlaceLabel(name) {
  return String(name || '').toLowerCase().replace(/[\s·•\-—_()（）【】\[\]]/g, '')
}

function classicPlaceScore(place, city) {
  const placeName = normalizePlaceLabel(place.name)
  return classicLandmarks(city).reduce((score, name, index) => {
    const landmarkName = normalizePlaceLabel(name)
    const matchScore = placeName === landmarkName ? 10 : placeName.startsWith(landmarkName) ? 6 : 0
    return Math.max(score, matchScore - index * 0.25)
  }, 0)
}

function placePreferenceScore(place, profile) {
  const text = `${place.name} ${place.area} ${place.sub} ${place.category} ${place.summary || ''}`
  return profile.reduce((score, rule) => score + (rule.place.test(text) ? 1 : 0), 0)
}

function applyRoutePreferences(options, styles, note) {
  const profile = preferenceProfile(styles, note)
  const wantsSlow = /慢游|轻松|不赶|悠闲|休息/.test(`${styles.join(' ')} ${note}`)
  const wantsNearby = /周边|少开车|少坐车|不想跑远/.test(`${styles.join(' ')} ${note}`)
  if (!profile.length && !wantsSlow && !wantsNearby) return options
  return options.map(option => {
    const labels = profile.filter(rule => option.places.some(place => rule.place.test(`${place.name} ${place.area} ${place.sub} ${place.category}`))).map(rule => rule.label)
    const placeScore = option.places.reduce((sum, place) => sum + placePreferenceScore(place, profile), 0) / option.places.length
    const slowScore = wantsSlow && (!option.maxDriveHours || option.maxDriveHours <= 3) ? 1.5 : 0
    const nearbyScore = wantsNearby && (!option.totalKm || option.totalKm <= 250) ? 1.5 : 0
    return { ...option, preferenceLabels: [...labels, ...(slowScore ? ['慢游'] : []), ...(nearbyScore ? ['少赶路'] : [])].slice(0, 3), preferenceScore: placeScore + slowScore + nearbyScore }
  }).sort((a, b) => b.preferenceScore - a.preferenceScore).map((option, index) => ({ ...option, tag: index === 0 ? '最符合偏好' : option.tag }))
}

function createRouteOption({ id, title, tag, reason, tradeoff, places, days, pace, hotel, limit, maxLegKm }) {
  const picked = pickConnectedRoutePlaces(places, Math.max(2, Math.min(limit, places.length)), maxLegKm)
  if (picked.length < 2) return null
  const groups = buildFlexiblePlan(picked, days, pace, hotel)
  const stats = routeOptionStats(groups)
  const routeLabel = [...new Set(picked.map(place => place.area).filter(Boolean))].slice(0, 4).join(' → ')
  return { id, title, tag, reason, tradeoff, places: picked, groups, routeLabel, ...stats }
}

export function buildRouteOptions({ city, places, days, pace, hotel, manual = false, styles = [], preferenceNote = '' }) {
  const profile = preferenceProfile(styles, preferenceNote)
  const uniquePool = uniqueRoutePlaces(places, { semantic: !manual, city })
  const pool = (manual ? uniquePool : capGuidedCategoryDensity(uniquePool, days)).map((place, index) => ({ place, index, score: placePreferenceScore(place, profile) })).sort((a, b) => Number(b.place.priority === 'must') - Number(a.place.priority === 'must') || b.score - a.score || a.index - b.index).map(item => item.place)
  const dailyLimit = { slow: 2, normal: 3, full: 4 }[pace] || 3
  const standardLimit = manual ? pool.length : Math.min(pool.length, Math.max(4, days * dailyLimit))
  const relaxedLimit = manual ? pool.length : Math.min(pool.length, Math.max(2, Math.ceil(days * 1.5)))
  const roadTrip = /新疆|西藏|内蒙古|青海|甘肃/.test(city)
  const maxLegKm = manual ? Number.POSITIVE_INFINITY : roadTrip ? (days <= 4 ? 240 : 380) : 120

  if (/新疆/.test(city) && !manual) {
    const southPattern = /喀什|和田|阿克苏|库车|库尔勒|塔什库尔干|克州|巴音郭楞|莎车|叶城/
    const northPattern = /阿勒泰|布尔津|禾木|喀纳斯|伊犁|博尔塔拉|塔城|克拉玛依|昌吉|乌鲁木齐|天山/
    const regionText = place => `${place.name} ${place.area} ${place.sub}`
    const north = pool.filter(place => northPattern.test(regionText(place)) || (!southPattern.test(regionText(place)) && place.position?.[1] >= 43.2))
    const south = pool.filter(place => southPattern.test(regionText(place)) || (!northPattern.test(regionText(place)) && place.position?.[1] < 43.2))
    const nearby = pool.filter(place => /乌鲁木齐|昌吉|吐鲁番|天山/.test(regionText(place)))
    const longTrip = days >= 7
    const options = [
      createRouteOption({ id: 'north', title: '北疆风光线', tag: longTrip ? '推荐' : '风光', reason: '自然景观集中，按相邻区域向前推进，避免当天来回折返。', tradeoff: '风景优先，跨城转场会多于城市短线。', places: north, days, pace, hotel, limit: standardLimit, maxLegKm }),
      createRouteOption({ id: 'south', title: '南疆人文线', tag: '人文', reason: '古城与人文体验更集中，同片区连续安排，停留节奏更从容。', tradeoff: '人文优先，自然景观比例会更少。', places: south, days, pace: 'slow', hotel, limit: relaxedLimit, maxLegKm }),
      createRouteOption({ id: 'nearby', title: '乌鲁木齐周边线', tag: longTrip ? '少赶路' : '推荐', reason: '目的地更集中，短天数也能留出吃饭、休息和临时调整时间。', tradeoff: '车程更轻松，但覆盖区域最少。', places: nearby.length >= 2 ? nearby : pool, days, pace: 'slow', hotel, limit: Math.min(relaxedLimit, Math.max(3, days * 2)), maxLegKm: 180 })
    ].filter(Boolean)
    if (options.length >= 2) return applyRoutePreferences(longTrip ? options : [options.at(-1), ...options.slice(0, -1)], styles, preferenceNote)
  }

  const popular = [...pool].sort((a, b) => classicPlaceScore(b, city) - classicPlaceScore(a, city) || (b.rating || 0) - (a.rating || 0))
  return applyRoutePreferences([
    createRouteOption({ id: 'recommended', title: '少折返推荐线', tag: '推荐', reason: '优先连接相邻区域，把长距离移动和游玩时间分开。', tradeoff: '综合最稳，不刻意追求打卡数量。', places: pool, days, pace, hotel, limit: standardLimit, maxLegKm }),
    createRouteOption({ id: 'relaxed', title: '轻松留白线', tag: '更轻松', reason: '每天减少地点数量，为吃饭、休息和临时发现留出时间。', tradeoff: '节奏最松，会主动舍弃一部分次要地点。', places: [...pool].reverse(), days, pace: 'slow', hotel, limit: relaxedLimit, maxLegKm }),
    createRouteOption({ id: 'popular', title: '经典热门线', tag: '热门', reason: '优先保留评分较高的地点，再按地理位置减少折返。', tradeoff: '经典点更多，热门时段可能更拥挤。', places: popular, days, pace, hotel, limit: standardLimit, maxLegKm })
  ].filter(Boolean), styles, preferenceNote)
}

function loadState() {
  try { return JSON.parse(localStorage.getItem('next-stop-state-v3')) || {} } catch { return {} }
}

function repairLegacyChengduRoute(state) {
  const tripIndex = state.trips?.findIndex(trip => trip.id === 'chengdu') ?? -1
  const savedPlaces = state.placesByTrip?.chengdu
  if (tripIndex < 0 || savedPlaces?.length !== 1 || savedPlaces[0]?.id !== 201) return state
  const routeIds = state.trips[tripIndex].dailyPlans?.flat().filter(Boolean) || []
  if (new Set(routeIds).size > 1) return state

  const seedTrip = initialTrips.find(trip => trip.id === 'chengdu')
  const trips = state.trips.map((trip, index) => index === tripIndex ? { ...trip, dailyPlans: seedTrip.dailyPlans.map(day => [...day]) } : trip)
  const currentDay = Math.max(0, (trips[tripIndex].currentDay || 1) - 1)
  const plansByTrip = { ...(state.plansByTrip || {}), chengdu: trips[tripIndex].dailyPlans[currentDay] || [201] }
  const visitedByTrip = trips[tripIndex].status === '已完成'
    ? { ...(state.visitedByTrip || {}), chengdu: trips[tripIndex].dailyPlans.flat() }
    : state.visitedByTrip
  return { ...state, trips, plansByTrip, visitedByTrip, placesByTrip: { ...state.placesByTrip, chengdu: placesByTripSeed.chengdu } }
}

function repairLegacyXinjiangRoute(state) {
  const tripIndex = state.trips?.findIndex(trip => trip.id === 'xinjiang') ?? -1
  if (tripIndex < 0 || state.trips[tripIndex].dailyPlans?.some(day => day.length)) return state
  const trips = state.trips.map((trip, index) => index === tripIndex ? { ...trip, dailyPlans: xinjiangInitialPlans.map(day => [...day]) } : trip)
  return { ...state, trips }
}

export default function App() {
  const saved = useMemo(() => restoreTripState(repairLegacyChengduRoute(repairLegacyXinjiangRoute(restoreTripState(loadState())))), [])
  const clock = useCurrentClock()
  const online = useNetworkStatus()
  const deviceLocation = useDeviceLocation()
  const [tab, setTab] = useState('today')
  const [screen, setScreen] = useState('main')
  const [placesByTrip, setPlacesByTrip] = useState(saved.placesByTrip)
  const [visitedByTrip, setVisitedByTrip] = useState(saved.visitedByTrip)
  const [plansByTrip, setPlansByTrip] = useState(saved.plansByTrip)
  const [lockedByTrip, setLockedByTrip] = useState(saved.lockedByTrip)
  const [conditionByTrip, setConditionByTrip] = useState(saved.conditionByTrip)
  const [conditionRequestByTrip, setConditionRequestByTrip] = useState(() => saved.conditionRequestByTrip || {})
  const [energyByTrip, setEnergyByTrip] = useState(saved.energyByTrip)
  const [journeyStageByTrip, setJourneyStageByTrip] = useState(saved.journeyStageByTrip)
  const [journeyProgressByTrip, setJourneyProgressByTrip] = useState(saved.journeyProgressByTrip || {})
  const [selectedPlaceId, setSelectedPlaceId] = useState(1)
  const [searchPreview, setSearchPreview] = useState(null)
  const [detailReturn, setDetailReturn] = useState('main')
  const [hotelReturn, setHotelReturn] = useState('main')
  const [routeEditReturn, setRouteEditReturn] = useState('main')
  const [conditionReturn, setConditionReturn] = useState('main')
  const [routeAddDay, setRouteAddDay] = useState(0)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [trips, setTrips] = useState(saved.trips)
  const [activeTripId, setActiveTripId] = useState(saved.activeTripId)
  const [packingByTrip, setPackingByTrip] = useState(saved.packingByTrip || {})
  const [bookingByTrip, setBookingByTrip] = useState(saved.bookingByTrip || {})
  const [routeVersionsByTrip, setRouteVersionsByTrip] = useState(saved.routeVersionsByTrip || {})
  const [adviceFeedbackByTrip, setAdviceFeedbackByTrip] = useState(saved.adviceFeedbackByTrip || {})
  const [productSignals, setProductSignals] = useState(saved.productSignals || { routeComparisons: 0, evidenceViews: 0, replans: 0, bookingConfirmed: 0, helpful: 0, unhelpful: 0 })
  const [lastRouteChange, setLastRouteChange] = useState(null)
  const [routeEditUndo, setRouteEditUndo] = useState(null)

  const places = placesByTrip[activeTripId] || []
  const visited = visitedByTrip[activeTripId] || []
  const dayPlan = plansByTrip[activeTripId] || []
  const locked = lockedByTrip[activeTripId] || []
  const condition = conditionByTrip[activeTripId] || ''
  const conditionRequest = conditionRequestByTrip[activeTripId] || ''
  const energy = energyByTrip[activeTripId] || 'normal'
  const journeyStage = journeyStageByTrip[activeTripId] || 'ready'
  const journeyProgress = journeyProgressByTrip[activeTripId] || {}
  const packingChecked = packingByTrip[activeTripId] || []
  const setPlaces = update => setPlacesByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || []) : update }))
  const setVisited = update => setVisitedByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || []) : update }))
  const setDayPlan = update => setPlansByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || []) : update }))
  const setLocked = update => setLockedByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || []) : update }))
  const setCondition = update => setConditionByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || '') : update }))
  const setConditionRequest = update => setConditionRequestByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || '') : update }))
  const setEnergy = update => setEnergyByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || 'normal') : update }))
  const setJourneyStage = update => setJourneyStageByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || 'ready') : update }))
  const setJourneyProgress = update => setJourneyProgressByTrip(all => ({ ...all, [activeTripId]: typeof update === 'function' ? update(all[activeTripId] || {}) : update }))
  const placeMap = useMemo(() => new Map(places.map(place => [place.id, place])), [places])
  const currentId = dayPlan.find(id => !visited.includes(id))
  const currentPlace = currentId ? placeMap.get(currentId) : null
  const activeTripBase = trips.find(trip => trip.id === activeTripId) || trips[0] || null
  const activeTripStays = activeTripBase ? getTripStays(activeTripBase) : []
  const usableTripPlaces = places.filter(place => !place.isHotel && place.category !== '住宿')
  const fallbackDailyPlans = !activeTripBase ? [] : activeTripBase.dailyPlans?.some(day => day.length)
    ? activeTripBase.dailyPlans
    : buildFlexiblePlan(usableTripPlaces, activeTripBase.days, activeTripBase.pace || 'normal', null).map(group => group.map(place => place.id))
  const activeDayIndex = Math.max(0, Math.min(fallbackDailyPlans.length - 1, (activeTripBase?.currentDay || 1) - 1))
  const currentDayIds = new Set(dayPlan)
  const hasLiveDayState = ['旅行中', '已暂停'].includes(activeTripBase?.status)
  const syncedDailyPlans = hasLiveDayState
    ? fallbackDailyPlans.map((day, index) => index === activeDayIndex ? [...dayPlan] : day.filter(id => !currentDayIds.has(id)))
    : fallbackDailyPlans.map(day => [...day])
  const activeTrip = activeTripBase ? { ...activeTripBase, stays: activeTripStays, dailyPlans: syncedDailyPlans, saved: places.length, must: places.filter(place => place.priority === 'must').length } : null
  const bookingTasks = activeTrip ? (bookingByTrip[activeTripId] || bookingTasksForTrip(activeTrip, places)).filter(task => !(task.kind === 'transport' && normalizePlaceLabel(activeTrip.origin) === normalizePlaceLabel(activeTrip.city))) : []
  const routeVersions = routeVersionsByTrip[activeTripId] || []
  const adviceFeedback = adviceFeedbackByTrip[activeTripId] || ''
  const currentPlanIndex = currentId ? dayPlan.indexOf(currentId) : -1
  const previousRoutePlace = currentPlanIndex > 0 ? placeMap.get(dayPlan[currentPlanIndex - 1]) : null
  const currentTripDate = tripDateAtOffset(activeTrip?.startDate, Math.max(0, (activeTrip?.currentDay || 1) - 1))
  const currentStay = stayForTripDate(activeTripStays, currentTripDate)
  const currentStayPlace = currentStay?.placeId ? placeMap.get(currentStay.placeId) : null
  const currentRouteOrigin = Array.isArray(deviceLocation.coords) ? { name: '当前位置', position: deviceLocation.coords } : previousRoutePlace || currentStayPlace
  const tripsWithCounts = trips.map(trip => ({ ...trip, stays: getTripStays(trip), saved: (placesByTrip[trip.id] || []).length, must: (placesByTrip[trip.id] || []).filter(place => place.priority === 'must').length }))

  useEffect(() => {
    localStorage.setItem('next-stop-state-v3', JSON.stringify({
      placesByTrip, visitedByTrip, plansByTrip, lockedByTrip, conditionByTrip, conditionRequestByTrip, energyByTrip, journeyStageByTrip, journeyProgressByTrip,
      packingByTrip, bookingByTrip, routeVersionsByTrip, adviceFeedbackByTrip, productSignals, trips, activeTripId
    }))
  }, [placesByTrip, visitedByTrip, plansByTrip, lockedByTrip, conditionByTrip, conditionRequestByTrip, energyByTrip, journeyStageByTrip, journeyProgressByTrip, packingByTrip, bookingByTrip, routeVersionsByTrip, adviceFeedbackByTrip, productSignals, trips, activeTripId])

  useEffect(() => {
    setTrips(items => items.map(trip => {
      if (trip.id === activeTripId && trip.status === '旅行中') return { ...trip, startedAt: trip.startedAt || new Date().toISOString() }
      return trip.id !== activeTripId && trip.status === '旅行中' ? { ...trip, status: '已暂停' } : trip
    }))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2100)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [tab, screen])

  useEffect(() => {
    const trip = trips.find(item => item.id === activeTripId)
    if (!trip || trip.status !== '旅行中' || !trip.currentDay || !trip.dailyPlans?.length) return
    const dayIndex = trip.currentDay - 1
    const currentIds = new Set(dayPlan)
    const syncedPlans = trip.dailyPlans.map((day, index) => index === dayIndex ? [...dayPlan] : day.filter(id => !currentIds.has(id)))
    if (JSON.stringify(syncedPlans) === JSON.stringify(trip.dailyPlans)) return
    setTrips(items => items.map(item => item.id === activeTripId
      ? { ...item, dailyPlans: syncedPlans }
      : item))
  }, [activeTripId, dayPlan])

  useEffect(() => {
    if (journeyStage === 'enroute' && currentPlace?.position) deviceLocation.startTracking()
    else deviceLocation.stopTracking()
  }, [activeTripId, currentId, journeyStage, Boolean(currentPlace?.position)])

  function openDetails(id, returnTo = screen) {
    setProductSignals(value => ({ ...value, evidenceViews: (value.evidenceViews || 0) + 1 }))
    setSearchPreview(null)
    setSelectedPlaceId(id)
    setDetailReturn(returnTo)
    setScreen('detail')
  }

  function openSearchDetails(place, returnTo = 'add') {
    setProductSignals(value => ({ ...value, evidenceViews: (value.evidenceViews || 0) + 1 }))
    setSearchPreview(place)
    setSelectedPlaceId(place.id)
    setDetailReturn(returnTo)
    setScreen('detail')
  }

  function openHotel(returnTo = screen) {
    if (activeTrip.status === '已完成') {
      setToast('已完成的旅行仅支持查看')
      return
    }
    setHotelReturn(returnTo)
    setScreen('hotel')
  }

  function openRouteEditor(returnTo = screen) {
    if (activeTrip.status === '已完成') {
      setToast('已完成的旅行仅支持查看')
      return
    }
    setRouteEditUndo(null)
    setRouteEditReturn(returnTo)
    setScreen('trip-route-edit')
  }

  function openRoutePlacePicker(dayIndex) {
    setRouteAddDay(dayIndex)
    setSearch('')
    setScreen('trip-route-add')
  }

  function openCurrent() {
    if (!currentId) return
    setScreen('recommend')
  }

  function beginOpeningVerification() {
    if (!currentPlace) return
    setJourneyProgress(value => ({ ...value, verificationPendingPlaceId: currentPlace.id }))
    window.open(amapPlaceUrl(currentPlace), '_blank', 'noopener,noreferrer')
  }

  function finishOpeningVerification(isOpen) {
    if (!currentPlace) return
    const verificationDayLabel = journeyStage === 'dayPreview' ? '计划当天' : '今天'
    if (!isOpen) {
      setJourneyProgress(value => ({ ...value, verificationPendingPlaceId: null }))
      setConditionReturn('recommend')
      setScreen('conditions')
      setToast(`已记录${verificationDayLabel}不开放，请预览调整方案`)
      return
    }
    setPlaces(items => items.map(place => place.id === currentPlace.id ? { ...place, openingVerifiedAt: new Date().toISOString() } : place))
    setJourneyProgress(value => ({ ...value, verificationPendingPlaceId: null }))
    setToast(`已记录：${verificationDayLabel}开放`)
  }

  function openConditions(returnTo = 'main') {
    if (!currentPlace) {
      setToast('当前没有待调整的地点')
      return
    }
    setConditionReturn(returnTo)
    setScreen('conditions')
  }

  function recordTripVersion(label, plans = activeTrip.dailyPlans) {
    const snapshot = {
      id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      at: new Date().toISOString(),
      dailyPlans: plans.map(day => [...day]),
      places: places.map(place => ({ ...place })),
      visited: [...visited],
      locked: [...locked]
    }
    setRouteVersionsByTrip(all => ({ ...all, [activeTripId]: [snapshot, ...(all[activeTripId] || [])].slice(0, 8) }))
  }

  function restoreTripVersion(version) {
    if (!version?.dailyPlans) return
    recordTripVersion('恢复版本前', activeTrip.dailyPlans)
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans: version.dailyPlans.map(day => [...day]) } : trip))
    setPlaces(version.places?.map(place => ({ ...place })) || places)
    setVisited([...(version.visited || [])])
    setLocked([...(version.locked || [])])
    const currentDayIndex = Math.max(0, (activeTrip.currentDay || 1) - 1)
    setDayPlan(version.dailyPlans[currentDayIndex] || version.dailyPlans.find(day => day.length) || [])
    setToast(`已恢复：${version.label}`)
  }

  function updateBookingTask(taskId, status) {
    setBookingByTrip(all => {
      const currentTasks = all[activeTripId] || bookingTasksForTrip(activeTrip, places)
      return { ...all, [activeTripId]: currentTasks.map(task => task.id === taskId ? {
        ...task,
        status,
        confirmedAt: status === 'confirmed' ? new Date().toISOString() : null,
        needsReview: status === 'confirmed' ? false : task.needsReview
      } : task) }
    })
    if (status === 'confirmed') setProductSignals(value => ({ ...value, bookingConfirmed: (value.bookingConfirmed || 0) + 1 }))
  }

  function setAdviceFeedback(value) {
    const previous = adviceFeedbackByTrip[activeTripId]
    setAdviceFeedbackByTrip(all => ({ ...all, [activeTripId]: value }))
    if (previous !== value) setProductSignals(signals => ({ ...signals, [value]: (signals[value] || 0) + 1 }))
    setToast(value === 'helpful' ? '谢谢，这会帮助我们保留有效建议' : '已记录，这条建议需要改进')
  }

  function chooseCondition(key, requestLabel = '', aiPreview = null) {
    if (!currentPlace) return
    const label = requestLabel.trim() || conditionMeta[key]?.label || '自定义调整'
    recordTripVersion(`按“${label}”调整前`)
    setLastRouteChange({ tripId: activeTripId, plan: [...dayPlan], condition, conditionRequest, journeyStage })
    const preview = aiPreview?.nextPlan ? aiPreview : previewConditionChange({ ids: dayPlan, places, condition: key, lockedIds: locked, visitedIds: visited, currentId })
    setDayPlan(preview.nextPlan)
    if (key === 'closed') setToast(`${currentPlace.name} 已从今天移除`)
    setCondition(key)
    setConditionRequest(label)
    setProductSignals(value => ({ ...value, replans: (value.replans || 0) + 1 }))
    setJourneyStage(value => value === 'dayPreview' ? 'dayPreview' : 'ready')
    setJourneyProgress({})
  }

  function chooseTripCondition(key, requestLabel = '', tripPreview = null) {
    if (!tripPreview?.dailyPlans?.length) return
    if (tripPreview.unscheduledIds?.length) {
      setToast('这版还有地点放不下，尚未更新行程')
      return
    }
    const label = requestLabel.trim() || conditionMeta[key]?.label || '自定义调整'
    recordTripVersion(`按“${label}”调整整段行程前`)
    setLastRouteChange({
      tripId: activeTripId,
      plan: [...dayPlan],
      dailyPlans: activeTrip.dailyPlans.map(day => [...day]),
      condition,
      conditionRequest,
      journeyStage,
      bookingTasks: bookingTasks.map(task => ({ ...task }))
    })
    const nextPlans = tripPreview.dailyPlans.map(day => [...day])
    const currentDayIndex = Math.max(0, (activeTrip.currentDay || 1) - 1)
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans: nextPlans } : trip))
    const impactedPlaceIds = new Set(tripPreview.bookingImpacts?.map(item => item.placeId).filter(Boolean) || [])
    const lodgingChanged = Boolean(tripPreview.lodgingImpacts?.length)
    if (impactedPlaceIds.size || lodgingChanged) {
      setBookingByTrip(all => {
        const currentTasks = all[activeTripId] || bookingTasksForTrip(activeTrip, places)
        return {
          ...all,
          [activeTripId]: currentTasks.map(task => impactedPlaceIds.has(task.placeId) || (lodgingChanged && task.kind === 'stay')
            ? { ...task, status: 'todo', confirmedAt: null, needsReview: true, affectedByReplanAt: new Date().toISOString() }
            : task)
        }
      })
    }
    setDayPlan(nextPlans[currentDayIndex] || [])
    setLocked(items => items.filter(id => nextPlans.some(day => day.includes(id))))
    setCondition(key)
    setConditionRequest(label)
    setProductSignals(value => ({ ...value, replans: (value.replans || 0) + 1 }))
    setJourneyStage(value => value === 'dayPreview' ? 'dayPreview' : 'ready')
    setJourneyProgress({})
    setToast(`已更新后续行程，共调整 ${tripPreview.changedDayCount || 0} 天`)
  }

  function undoConditionChange() {
    if (!lastRouteChange || lastRouteChange.tripId !== activeTripId) return
    if (lastRouteChange.dailyPlans) {
      const restoredPlans = lastRouteChange.dailyPlans.map(day => [...day])
      setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans: restoredPlans } : trip))
    }
    setDayPlan(lastRouteChange.plan)
    setCondition(lastRouteChange.condition)
    setConditionRequest(lastRouteChange.conditionRequest || '')
    if (lastRouteChange.bookingTasks) setBookingByTrip(all => ({ ...all, [activeTripId]: lastRouteChange.bookingTasks.map(task => ({ ...task })) }))
    setLastRouteChange(null)
    setJourneyStage(lastRouteChange.journeyStage || 'ready')
    setJourneyProgress({})
    setToast('已恢复调整前的路线')
  }

  async function rebuildTripRoute() {
    const activeDay = Math.max(0, (activeTrip.currentDay || 1) - 1)
    const remainingDays = Math.max(1, activeTrip.dailyPlans.length - activeDay)
    const protectedPastIds = new Set(activeTrip.dailyPlans.slice(0, activeDay).flat())
    const hotelPlaces = activeTrip.stays.map(stay => {
      const place = places.find(item => item.id === stay.placeId)
      return place ? { ...place, checkIn: stay.checkIn, checkOut: stay.checkOut } : null
    }).filter(Boolean)
    const routePlaces = uniqueRoutePlaces(places.filter(place => !place.isHotel && place.category !== '住宿' && !visited.includes(place.id) && !protectedPastIds.has(place.id)), { semantic: true, city: activeTrip.city })
    if (routePlaces.length < 2) {
      setToast('至少需要 2 个行程地点')
      return
    }
    let groups
    let planner = 'local-rules-v3'
    setToast('正在整理整段路线…')
    try {
      const aiPlan = await requestAiPlan({
        city: activeTrip.city,
        days: remainingDays,
        pace: activeTrip.pace || 'normal',
        transport: activeTrip.transportPreference || 'public',
        dayStartTime: activeTrip.dayStartTime || '09:30',
        preferences: [activeTrip.preferenceNote, `当前是第 ${activeDay + 1} 天 ${clock}，已完成地点不调整；今天已经来不及的地点请分配到后续日期。`].filter(Boolean).join('；'),
        places: routePlaces,
        stays: activeTrip.stays,
        intent: 'replan'
      })
      const routeMap = new Map(routePlaces.map(place => [String(place.id), place]))
      groups = aiPlan.days.map(day => day.placeIds.map(id => routeMap.get(String(id))).filter(Boolean))
      if (!groups.some(group => group.length)) throw new Error('AI 没有返回可用地点')
      planner = 'deepseek'
    } catch (error) {
      if (error.code !== 'AI_NOT_CONFIGURED') console.warn('AI 重新规划不可用，已回退本地规划', error)
      groups = buildFlexiblePlan(routePlaces, remainingDays, activeTrip.pace || 'normal', hotelPlaces, tripDateAtOffset(activeTrip.startDate, activeDay))
    }
    const completedToday = (activeTrip.dailyPlans[activeDay] || []).filter(id => visited.includes(id))
    const remainingPlans = Array.from({ length: remainingDays }, (_, index) => (groups[index] || []).map(place => place.id).filter(id => !visited.includes(id)))
    const dailyPlans = [...activeTrip.dailyPlans.slice(0, activeDay), ...remainingPlans]
    dailyPlans[activeDay] = [...completedToday, ...(dailyPlans[activeDay] || [])]
    const todayProposal = buildTodayFeasibilityProposal({ ids: dailyPlans[activeDay], places, visitedIds: visited, lockedIds: locked, clock, condition, energy, transportMode: tripTransportMode(activeTrip) })
    dailyPlans[activeDay] = todayProposal.nextPlan
    if (todayProposal.overflow.length && dailyPlans[activeDay + 1]) {
      const shiftedIds = todayProposal.overflow.map(item => item.id)
      dailyPlans[activeDay + 1] = [...shiftedIds, ...dailyPlans[activeDay + 1].filter(id => !shiftedIds.includes(id))]
    }
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans, planner } : trip))
    setDayPlan(dailyPlans[activeDay] || dailyPlans.find(group => group.length) || [])
    setToast(todayProposal.overflow.length ? `整段路线已更新，${todayProposal.overflow.length} 个地点已移出今天` : planner === 'deepseek' ? '路线已按当前地点重新整理' : '已按距离整理路线，地点没有丢失')
  }

  function selectHotel(place, range = {}) {
    const hotelPlace = { ...place, isHotel: true, priority: 'optional' }
    const stay = { id: `stay-${Date.now()}`, placeId: place.id, name: place.name, area: place.area, checkIn: range.checkIn || activeTrip.startDate, checkOut: range.checkOut || activeTrip.endDate }
    const nextStays = [...activeTrip.stays, stay]
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, stays: nextStays, hotel: nextStays[0].name, hotelPlaceId: nextStays[0].placeId } : trip))
    setPlaces(items => items.some(item => item.id === place.id) ? items : [...items, hotelPlace])
    setToast(`已添加住宿：${place.name}`)
  }

  function updateStay(stayId, patchValue) {
    const nextStays = activeTrip.stays.map(stay => stay.id === stayId ? { ...stay, ...patchValue } : stay)
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, stays: nextStays } : trip))
  }

  function removeStay(stayId) {
    const removed = activeTrip.stays.find(stay => stay.id === stayId)
    const nextStays = activeTrip.stays.filter(stay => stay.id !== stayId)
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, stays: nextStays, hotel: nextStays[0]?.name || '未设置', hotelPlaceId: nextStays[0]?.placeId || null } : trip))
    if (removed && !nextStays.some(stay => stay.placeId === removed.placeId)) setPlaces(items => items.filter(place => place.id !== removed.placeId))
  }

  function rememberRouteEdit(label) {
    recordTripVersion(`${label}前`)
    setRouteEditUndo({
      tripId: activeTripId,
      label,
      dailyPlans: activeTrip.dailyPlans.map(day => [...day]),
      places: places.map(place => ({ ...place })),
      visited: [...visited],
      locked: [...locked],
      todayPlan: [...dayPlan]
    })
  }

  function updateTripRoute(updater, label = '路线调整') {
    const currentPlans = activeTrip.dailyPlans.map(day => [...day])
    const nextPlans = updater(currentPlans.map(day => [...day]))
    if (JSON.stringify(nextPlans) === JSON.stringify(currentPlans)) return
    rememberRouteEdit(label)
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans: nextPlans } : trip))
    const currentDayIndex = Math.max(0, (activeTrip.currentDay || 1) - 1)
    setDayPlan(nextPlans[currentDayIndex] || nextPlans.find(day => day.length) || [])
  }

  function undoRouteEdit() {
    if (!routeEditUndo || routeEditUndo.tripId !== activeTripId) return
    const snapshot = routeEditUndo
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dailyPlans: snapshot.dailyPlans.map(day => [...day]) } : trip))
    setPlaces(snapshot.places.map(place => ({ ...place })))
    setVisited([...snapshot.visited])
    setLocked([...snapshot.locked])
    setDayPlan([...snapshot.todayPlan])
    setRouteEditUndo(null)
    setToast(`已撤销：${snapshot.label}`)
  }

  function moveTripStop(placeId, dayOffset, orderOffset = 0) {
    if (dayOffset) {
      setBookingByTrip(all => {
        const currentTasks = all[activeTripId] || bookingTasksForTrip(activeTrip, places)
        return {
          ...all,
          [activeTripId]: currentTasks.map(task => task.placeId === placeId || task.kind === 'stay'
            ? { ...task, status: 'todo', confirmedAt: null, needsReview: true, affectedByReplanAt: new Date().toISOString() }
            : task)
        }
      })
    }
    updateTripRoute(plans => {
      const dayIndex = plans.findIndex(day => day.includes(placeId))
      if (dayIndex < 0) return plans
      const placeIndex = plans[dayIndex].indexOf(placeId)
      if (orderOffset) {
        const targetIndex = placeIndex + orderOffset
        if (targetIndex < 0 || targetIndex >= plans[dayIndex].length) return plans
        ;[plans[dayIndex][placeIndex], plans[dayIndex][targetIndex]] = [plans[dayIndex][targetIndex], plans[dayIndex][placeIndex]]
        return plans
      }
      const targetDay = dayIndex + dayOffset
      if (targetDay < 0 || targetDay >= plans.length) return plans
      plans[dayIndex].splice(placeIndex, 1)
      plans[targetDay].push(placeId)
      return plans
    }, dayOffset ? '跨天移动地点' : '调整当天顺序')
    if (dayOffset) setToast('已移动地点；受影响的住宿和预约已标记为待确认')
  }

  function togglePackingItem(itemId) {
    setPackingByTrip(all => {
      const checked = all[activeTripId] || []
      return { ...all, [activeTripId]: checked.includes(itemId) ? checked.filter(id => id !== itemId) : [...checked, itemId] }
    })
  }

  function moveStop(id, direction) {
    if (locked.includes(id)) return
    setDayPlan(plan => {
      const next = [...plan]
      const index = next.indexOf(id)
      let target = index + direction
      while (target >= 0 && target < next.length && locked.includes(next[target])) target += direction
      if (target < 0 || target >= next.length) return plan
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function advanceJourney() {
    if (journeyStage === 'dayPreview') {
      const previewDate = tripDateAtOffset(activeTrip.startDate, Math.max(0, (activeTrip.currentDay || 1) - 1))
      if (previewDate && previewDate !== localDateKey()) {
        setToast(`这是 ${formatTripDate(activeTrip.startDate, Math.max(0, (activeTrip.currentDay || 1) - 1))} 的预览，到当天再开始`)
        return
      }
      setJourneyStage('ready')
      setJourneyProgress({})
      setToast(`已开始第 ${activeTrip.currentDay || 1} 天，出发时会按实时位置更新时间`)
      return
    }
    if (journeyStage === 'ready') {
      if (!currentRouteOrigin?.position) {
        setToast('先定位或设置当天起点，再计算是否来得及')
        return
      }
      if (currentPlace?.closes === '待确认') {
        setToast('营业状态还没确认，暂未标记为已出发')
        return
      }
      const travelMinutes = transferReserveMinutes(currentRouteOrigin, currentPlace, legTransportMode(currentRouteOrigin, currentPlace, tripTransportMode(activeTrip)))
      const timing = scheduleRuntimeStop(clockToMinutes(clock) + 5, travelMinutes, currentPlace)
      const issue = runtimeStopIssue(currentPlace, { arrival: timing.arrival, leave: timing.leave, now: clockToMinutes(clock) })
      if (issue) {
        setToast(`${issue.title}，请先调整今天路线`)
        return
      }
      const departedAt = Date.now()
      setJourneyProgress({ placeId: currentId, departedAt, arrivedAt: null, remindAt: null, arrivalSnoozeUntil: null })
      setJourneyStage('enroute')
      const minutes = getTransport(currentPlace, condition, energy, tripTransportMode(activeTrip)).recommended.minutes
      setToast(Number.isFinite(minutes) ? `已出发 · 预计 ${formatTravelTime(minutes)} · 已开启到达提醒` : `已开始前往 ${currentPlace.name}`)
      return
    }
    if (journeyStage === 'enroute') {
      const arrivedAt = Date.now()
      const stayMinutes = durationToMinutes(currentPlace?.duration)
      setJourneyProgress(value => ({ ...value, placeId: currentId, arrivedAt, remindAt: arrivedAt + stayMinutes * 60000, arrivalSnoozeUntil: null }))
      setJourneyStage('arrived')
      setToast(`已到达 ${currentPlace.name} · 开始记录停留时间`)
      return
    }
    const nextVisited = visited.includes(currentId) ? visited : [...visited, currentId]
    setVisited(nextVisited)
    const next = dayPlan.find(id => id !== currentId && !nextVisited.includes(id))
    setJourneyStage(next ? 'ready' : 'dayComplete')
    setJourneyProgress({})
    setScreen('main')
    setToast(next ? `这一站完成，下一站已准备好` : '今天的路线已全部完成')
  }

  function launchNavigation() {
    if (!currentPlace) return
    if (journeyStage === 'ready' && currentPlace.closes === '待确认') {
      setToast('先核对营业状态；导航不会自动把未知变成可行')
      return
    }
    const transport = getTransport(currentPlace, condition, energy, tripTransportMode(activeTrip)).recommended
    const url = amapNavigationUrl(currentPlace, transport.id)
    if (!url) {
      setToast('这个地点还没有可导航的坐标')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    if (journeyStage === 'ready') {
      const departedAt = Date.now()
      setJourneyProgress({ placeId: currentId, departedAt, arrivedAt: null, remindAt: null, arrivalSnoozeUntil: null })
      setJourneyStage('enroute')
      setToast(Number.isFinite(transport.minutes) ? `已打开高德地图 · 预计 ${formatTravelTime(transport.minutes)}` : '已打开高德地图查看路线')
    }
  }

  function previewNavigation() {
    if (!currentPlace) return
    const transport = getTransport(currentPlace, condition, energy, tripTransportMode(activeTrip)).recommended
    const url = amapNavigationUrl(currentPlace, transport.id)
    if (!url) return setToast('这个地点还没有可导航的坐标')
    window.open(url, '_blank', 'noopener,noreferrer')
    setToast('已打开高德核对路线，还没有标记为已出发')
  }

  function startNextDay() {
    const startIndex = activeTrip.currentDay || 1
    const nextIndex = activeTrip.dailyPlans.findIndex((day, index) => index >= startIndex && day.some(id => placeMap.has(id) && !visited.includes(id)))
    if (nextIndex < 0) {
      setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, status: '已完成', completedAt: new Date().toISOString() } : trip))
      setJourneyStage('tripComplete')
      setToast('这次旅行的计划地点已全部完成')
      return
    }
    const nextPlan = activeTrip.dailyPlans[nextIndex].filter(id => placeMap.has(id))
    setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, currentDay: nextIndex + 1 } : trip))
    setDayPlan(nextPlan)
    setLocked(nextPlan.filter(id => placeMap.get(id)?.fixed))
    setCondition('')
    setConditionRequest('')
    setEnergy('normal')
    setJourneyStage('dayPreview')
    setJourneyProgress({})
    setToast(`已打开第 ${nextIndex + 1} 天预览，时间按当天计划计算`)
  }

  function beginTrip(targetTrip, tripUpdates = {}, message = '') {
    const calendarDayIndex = tripDayIndexForDate(targetTrip)
    const firstDayIndex = calendarDayIndex >= 0
      ? targetTrip.dailyPlans.findIndex((day, index) => index >= calendarDayIndex && day.some(id => placeMap.has(id)))
      : targetTrip.dailyPlans.findIndex(day => day.some(id => placeMap.has(id)))
    if (firstDayIndex < 0) {
      setToast('先添加路线地点，再开始旅行')
      return false
    }
    const firstDayPlan = targetTrip.dailyPlans[firstDayIndex].filter(id => placeMap.has(id))
    const firstDate = tripDateAtOffset(targetTrip.startDate, firstDayIndex)
    const firstStay = stayForTripDate(targetTrip.stays, firstDate)
    setDayPlan(firstDayPlan)
    setVisited([])
    setCondition('')
    setConditionRequest('')
    setEnergy('normal')
    setJourneyStage('ready')
    setJourneyProgress({})
    setTrips(items => items.map(trip => {
      if (trip.id === activeTripId) return {
        ...trip,
        ...tripUpdates,
        status: '旅行中',
        startedAt: new Date().toISOString(),
        currentDay: firstDayIndex + 1,
        location: firstStay?.area || trip.city
      }
      return trip.status === '旅行中' ? { ...trip, status: '已暂停' } : trip
    }))
    setToast(message || `旅程已开始，第 ${firstDayIndex + 1} 天的下一站已准备好`)
    return true
  }

  function startTripNow() {
    if (activeTrip.status === '已完成') {
      setToast('这趟旅行已完成，不能重新出发')
      return
    }
    if (activeTrip.startDate && localDateKey() < activeTrip.startDate) {
      setToast(`这趟行程 ${shortStayDate(activeTrip.startDate)} 开始；如需提前，请先确认日期与预约影响`)
      return
    }
    if (activeTrip.endDate && localDateKey() > activeTrip.endDate) {
      setToast('这趟行程日期已经结束，请先修改日期')
      return
    }
    beginTrip(activeTrip)
  }

  function startTripEarly() {
    const today = localDateKey()
    if (!activeTrip.startDate || today >= activeTrip.startDate) {
      startTripNow()
      return
    }
    const offset = dateKeyOffset(activeTrip.startDate, today)
    const newEndDate = activeTrip.endDate
      ? tripDateAtOffset(activeTrip.endDate, offset)
      : tripDateAtOffset(today, Math.max(0, (activeTrip.days || activeTrip.dailyPlans.length || 1) - 1))
    const shiftedStays = activeTrip.stays.map(stay => ({
      ...stay,
      checkIn: stay.checkIn ? tripDateAtOffset(stay.checkIn, offset) : stay.checkIn,
      checkOut: stay.checkOut ? tripDateAtOffset(stay.checkOut, offset) : stay.checkOut
    }))
    const shiftedTrip = {
      ...activeTrip,
      startDate: today,
      endDate: newEndDate,
      dates: formatTripDateRange(today, newEndDate),
      stays: shiftedStays
    }
    const changedAt = new Date().toISOString()
    setBookingByTrip(all => {
      const currentTasks = all[activeTripId] || bookingTasksForTrip(shiftedTrip, places)
      return {
        ...all,
        [activeTripId]: currentTasks.map(task => task.status === 'not_needed' ? task : {
          ...task,
          status: 'todo',
          confirmedAt: null,
          needsReview: true,
          affectedByReplanAt: changedAt
        })
      }
    })
    const started = beginTrip(shiftedTrip, {
      startDate: today,
      endDate: newEndDate,
      dates: shiftedTrip.dates,
      stays: shiftedStays,
      rescheduledAt: changedAt,
      originalStartDate: activeTrip.originalStartDate || activeTrip.startDate,
      originalEndDate: activeTrip.originalEndDate || activeTrip.endDate
    }, '已改为今天出发；路线不变，住宿与预约需要重新确认')
    if (started) setProductSignals(value => ({ ...value, replans: (value.replans || 0) + 1 }))
  }

  function clearTravelData() {
    if (!window.confirm('确定清除这台设备上的全部旅行吗？路线、地点、住宿、完成进度和未完成的规划草稿都会删除，且无法恢复。')) return
    localStorage.removeItem('next-stop-state-v3')
    localStorage.removeItem('next-stop-create-draft-v1')
    setPlacesByTrip({})
    setVisitedByTrip({})
    setPlansByTrip({})
    setLockedByTrip({})
    setConditionByTrip({})
    setConditionRequestByTrip({})
    setEnergyByTrip({})
    setJourneyStageByTrip({})
    setJourneyProgressByTrip({})
    setPackingByTrip({})
    setBookingByTrip({})
    setRouteVersionsByTrip({})
    setAdviceFeedbackByTrip({})
    setProductSignals({ routeComparisons: 0, evidenceViews: 0, replans: 0, bookingConfirmed: 0, helpful: 0, unhelpful: 0 })
    setTrips([])
    setActiveTripId(null)
    setLastRouteChange(null)
    setRouteEditUndo(null)
    setSearchPreview(null)
    setScreen('main')
    setTab('today')
    setToast('已清除这台设备上的全部旅行')
  }

  function deleteTrip(tripId) {
    const target = trips.find(trip => trip.id === tripId)
    if (!target || tripId === activeTripId) {
      setToast('当前旅行不能在这里删除')
      return
    }
    const removeKey = record => {
      const next = { ...record }
      delete next[tripId]
      return next
    }
    setTrips(items => items.filter(trip => trip.id !== tripId))
    setPlacesByTrip(removeKey)
    setVisitedByTrip(removeKey)
    setPlansByTrip(removeKey)
    setLockedByTrip(removeKey)
    setConditionByTrip(removeKey)
    setConditionRequestByTrip(removeKey)
    setEnergyByTrip(removeKey)
    setJourneyStageByTrip(removeKey)
    setJourneyProgressByTrip(removeKey)
    setPackingByTrip(removeKey)
    setBookingByTrip(removeKey)
    setRouteVersionsByTrip(removeKey)
    setAdviceFeedbackByTrip(removeKey)
    if (lastRouteChange?.tripId === tripId) setLastRouteChange(null)
    if (routeEditUndo?.tripId === tripId) setRouteEditUndo(null)
    setToast(`已删除「${target.title}」`)
  }

  function renderScreen() {
    if (screen === 'create') return <CreateTripScreen onBack={() => setScreen('main')} onSignal={key => setProductSignals(value => ({ ...value, [key]: (value[key] || 0) + 1 }))} onDone={({ trip, selectedPlaces, firstDayPlan, lockedIds, bookingTasks: createdBookingTasks }) => {
      setTrips(items => [trip, ...items]); setPlacesByTrip(all => ({ ...all, [trip.id]: selectedPlaces })); setVisitedByTrip(all => ({ ...all, [trip.id]: [] })); setPlansByTrip(all => ({ ...all, [trip.id]: firstDayPlan })); setLockedByTrip(all => ({ ...all, [trip.id]: lockedIds })); setConditionByTrip(all => ({ ...all, [trip.id]: '' })); setConditionRequestByTrip(all => ({ ...all, [trip.id]: '' })); setEnergyByTrip(all => ({ ...all, [trip.id]: 'normal' })); setJourneyStageByTrip(all => ({ ...all, [trip.id]: 'ready' })); setBookingByTrip(all => ({ ...all, [trip.id]: createdBookingTasks || bookingTasksForTrip(trip, selectedPlaces) })); setRouteVersionsByTrip(all => ({ ...all, [trip.id]: [{ id: `version-${Date.now()}`, label: '初始路线', at: new Date().toISOString(), dailyPlans: trip.dailyPlans.map(day => [...day]), places: selectedPlaces.map(place => ({ ...place })), visited: [], locked: [...lockedIds] }] })); setActiveTripId(trip.id); setTab('today'); setScreen('main'); setToast(`${trip.city}路线已创建`)
    }} />
    if (!activeTrip) return <>
      <main className="page-shell"><NoTripsScreen tab={tab} onCreate={() => setScreen('create')}/></main>
      <BottomNav tab={tab} setTab={next => { setTab(next); setScreen('main') }}/>
    </>
    if (screen === 'trip-route-view') return <TripOverviewScreen
      journeyView trip={activeTrip} places={places} visited={visited}
      packingChecked={packingChecked} onTogglePacking={togglePackingItem}
      onBack={() => setScreen('main')} onSelectHotel={() => openHotel('trip-route-view')}
      onMap={() => { setScreen('main'); setTab('map') }} onEditRoute={() => openRouteEditor('trip-route-view')}
      bookingTasks={bookingTasks} onBookings={() => setScreen('booking')}
      routeVersions={routeVersions} onRestoreVersion={restoreTripVersion}
      onDetails={id => openDetails(id, 'trip-route-view')} onStartNow={startTripNow} onStartEarly={startTripEarly} onSwitch={() => setTab('me')}
    />
    if (screen === 'booking') return <BookingScreen
      trip={activeTrip} places={placeMap} tasks={bookingTasks} onBack={() => setScreen('main')}
      onUpdate={updateBookingTask} onHotel={() => openHotel('booking')}
    />
    if (screen === 'recommend') return <RecommendScreen
      place={currentPlace} origin={currentRouteOrigin} city={activeTrip.city} transportMode={tripTransportMode(activeTrip)} condition={condition} conditionLabel={conditionRequest} energy={energy} stage={journeyStage}
      onBack={() => setScreen('main')} onChange={() => openConditions('recommend')}
      onAdvance={advanceJourney} onNavigate={launchNavigation}
      onCheckRoute={previewNavigation} onVerify={beginOpeningVerification}
      verificationPending={journeyProgress.verificationPendingPlaceId === currentPlace?.id}
      onConfirmOpen={() => finishOpeningVerification(true)} onConfirmClosed={() => finishOpeningVerification(false)}
      canUndo={lastRouteChange?.tripId === activeTripId} onUndo={undoConditionChange}
      location={deviceLocation}
    />
    if (screen === 'conditions') return <ConditionScreen
      trip={activeTrip} city={activeTrip.city} active={condition} activeLabel={conditionRequest}
      current={currentPlace} plan={dayPlan} places={places} visited={visited} locked={locked}
      bookingTasks={bookingTasks}
      clock={journeyStage === 'dayPreview' ? (activeTrip.dayStartTime || '09:30') : clock}
      condition={condition} energy={energy}
      onBack={() => setScreen(conditionReturn)} onChoose={chooseCondition} onChooseTrip={chooseTripCondition} onUndo={undoConditionChange}
    />
    if (screen === 'edit') return <EditPlanScreen
      trip={activeTrip} places={places} plan={dayPlan} visited={visited} locked={locked}
      clock={journeyStage === 'dayPreview' ? (activeTrip.dayStartTime || '09:30') : clock}
      previewDay={journeyStage === 'dayPreview'} condition={condition} energy={energy}
      onBack={() => setScreen('main')} onMove={moveStop}
      onToggleLock={id => setLocked(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id])}
      onRemove={id => setDayPlan(plan => plan.filter(item => item !== id))}
      onAdd={id => setDayPlan(plan => plan.includes(id) ? plan : [...plan, id])}
      onApplyToday={({ nextPlan, removedIds }) => {
        const editingLabel = journeyStage === 'dayPreview' ? `第 ${activeTrip.currentDay || 1} 天` : '今天'
        recordTripVersion(removedIds.length ? `精简${editingLabel}路线前` : `重排${editingLabel}路线前`)
        setDayPlan(nextPlan)
        setLocked(items => items.filter(id => nextPlan.includes(id)))
        setProductSignals(value => ({ ...value, replans: (value.replans || 0) + 1 }))
        setToast(removedIds.length ? `已移出${editingLabel} ${removedIds.length} 个地点，未自动安排到其他日期` : `${editingLabel}路线已按可行时间重排`)
      }}
      onEditWholeTrip={() => openRouteEditor('edit')} onDetails={id => openDetails(id, 'edit')}
    />
    if (screen === 'trip-route-edit') return <TripRouteEditorScreen
      trip={activeTrip} places={places} onBack={() => setScreen(routeEditReturn)}
      onMoveDay={(id, offset) => moveTripStop(id, offset)} onMoveOrder={(id, offset) => moveTripStop(id, 0, offset)}
      onRemove={id => {
        updateTripRoute(plans => plans.map(day => day.filter(placeId => placeId !== id)), '移除地点')
        setPlaces(items => items.filter(place => place.id !== id))
        setVisited(items => items.filter(placeId => placeId !== id))
        setLocked(items => items.filter(placeId => placeId !== id))
      }}
      onToggleMust={id => {
        rememberRouteEdit('更改必去状态')
        setPlaces(items => items.map(place => place.id === id ? { ...place, priority: place.priority === 'must' ? 'want' : 'must' } : place))
      }}
      onAddDay={openRoutePlacePicker} onReplan={() => { setConditionReturn('trip-route-edit'); setScreen('conditions') }}
      onStartTimeChange={value => setTrips(items => items.map(trip => trip.id === activeTripId ? { ...trip, dayStartTime: value || '09:30' } : trip))}
      canUndo={routeEditUndo?.tripId === activeTripId} undoLabel={routeEditUndo?.label} onUndo={undoRouteEdit}
      versions={routeVersions} onRestoreVersion={restoreTripVersion}
    />
    if (screen === 'trip-route-add') return <AddPlaceScreen
      title={`添加到第 ${routeAddDay + 1} 天`} search={search} setSearch={setSearch} city={activeTrip.city}
      places={places} catalog={placesByTripSeed[activeTripId] || []} addedIds={activeTrip.dailyPlans.flat()}
      onBack={() => setScreen('trip-route-edit')} onDetails={place => openSearchDetails(place, 'trip-route-add')}
      onAdd={place => {
        setPlaces(items => items.some(item => item.id === place.id) ? items : [...items, { ...place, priority: place.priority || 'want' }])
        updateTripRoute(plans => plans.map((day, dayIndex) => dayIndex === routeAddDay && !day.includes(place.id) ? [...day, place.id] : day), '添加地点')
        setScreen('trip-route-edit')
        setToast(`已添加到第 ${routeAddDay + 1} 天`)
      }}
    />
    if (screen === 'detail' && (places.length || searchPreview)) {
      const detailPlace = searchPreview?.id === selectedPlaceId ? searchPreview : (placeMap.get(selectedPlaceId) || places[0])
      const editingFullRoute = detailReturn === 'trip-route-add'
      const fullRouteIds = activeTrip.dailyPlans.flat()
      return <PlaceDetailScreen
        place={detailPlace}
        intent={activeTrip.planningIntent}
        readOnly={activeTrip.status === '已完成'}
        inPlan={editingFullRoute ? fullRouteIds.includes(selectedPlaceId) : dayPlan.includes(selectedPlaceId)}
        planLabel={editingFullRoute ? `第 ${routeAddDay + 1} 天路线` : journeyStage === 'dayPreview' ? `第 ${activeTrip.currentDay || 1} 天路线` : '今天路线'}
        onBack={() => setScreen(detailReturn)}
        onTogglePlan={() => {
          setPlaces(items => items.some(item => item.id === detailPlace.id) ? items : [...items, detailPlace])
          if (editingFullRoute) updateTripRoute(plans => {
            const alreadyAdded = plans.some(day => day.includes(selectedPlaceId))
            const next = plans.map(day => day.filter(id => id !== selectedPlaceId))
            if (!alreadyAdded) next[routeAddDay].push(selectedPlaceId)
            return next
          })
          else setDayPlan(plan => plan.includes(selectedPlaceId) ? plan.filter(id => id !== selectedPlaceId) : [...plan, selectedPlaceId])
        }}
        onToggleSaved={() => {
          const savedPlace = placeMap.get(selectedPlaceId)
          const nextPriority = (savedPlace || detailPlace).priority === 'must' ? 'want' : 'must'
          setPlaces(items => items.some(item => item.id === selectedPlaceId)
            ? items.map(place => place.id === selectedPlaceId ? { ...place, priority: nextPriority } : place)
            : [...items, { ...detailPlace, priority: nextPriority }])
          if (searchPreview?.id === selectedPlaceId) setSearchPreview(place => ({ ...place, priority: nextPriority }))
        }}
      />
    }
    if (screen === 'add') return <AddPlaceScreen search={search} setSearch={setSearch} city={activeTrip.city} places={places} catalog={placesByTripSeed[activeTripId] || []} onBack={() => setScreen('main')} onDetails={openSearchDetails} onAdd={place => {
      setPlaces(items => items.some(item => item.id === place.id) ? items : [...items, place])
      setToast(`已添加到${activeTrip.city}行程`)
    }} />
    if (screen === 'hotel') return <SelectHotelScreen trip={activeTrip} places={places} stays={activeTrip.stays} onBack={() => setScreen(hotelReturn)} onSelect={selectHotel} onUpdate={updateStay} onRemove={removeStay} />
    return <>
      <main className={tab === 'map' && places.length ? 'page-shell map-page-shell' : 'page-shell'}>
        {tab === 'today' && (activeTrip.status === '旅行中' || journeyStage === 'tripComplete' ? <TodayScreen
          trip={activeTrip}
          places={placeMap} plan={dayPlan} visited={visited} locked={locked}
          current={currentPlace} condition={condition} conditionLabel={conditionRequest} energy={energy} setEnergy={setEnergy}
          stage={journeyStage} progress={journeyProgress} onCurrent={openCurrent} onNavigate={launchNavigation} onAdvance={advanceJourney}
          onCheckRoute={previewNavigation}
          onSnoozeArrival={() => setJourneyProgress(value => ({ ...value, arrivalSnoozeUntil: Date.now() + 5 * 60000 }))}
          onStayLonger={() => { setJourneyProgress(value => ({ ...value, remindAt: Date.now() + 20 * 60000 })); setToast('好，20 分钟后再提醒你') }}
          onChange={() => openConditions('main')} onEdit={() => setScreen('edit')}
          onDetails={id => openDetails(id, 'main')} onFullRoute={() => setScreen('trip-route-view')}
          onNextDay={startNextDay} onVerifyRisk={() => {
            if (!currentPlace) return
            setJourneyProgress(value => ({ ...value, verificationPendingPlaceId: currentPlace.id }))
            setScreen('recommend')
          }} clock={clock} location={deviceLocation}
          bookingTasks={bookingTasks} onBookings={() => setScreen('booking')}
          feedback={adviceFeedback} onFeedback={setAdviceFeedback}
        /> : <TripOverviewScreen trip={activeTrip} places={places} visited={visited} packingChecked={packingChecked} onTogglePacking={togglePackingItem} onSelectHotel={() => openHotel('main')} onMap={() => setTab('map')} onEditRoute={() => openRouteEditor('main')} onDetails={id => openDetails(id, 'main')} onStartNow={startTripNow} onStartEarly={startTripEarly} onSwitch={() => setTab('me')} bookingTasks={bookingTasks} onBookings={() => setScreen('booking')} routeVersions={routeVersions} onRestoreVersion={restoreTripVersion} />)}
        {tab === 'map' && (places.length ? <MapScreen trip={activeTrip} cityCode={activeTrip.cityCode} places={places} plan={dayPlan} visited={visited} dayLabel={journeyStage === 'dayPreview' ? `第 ${activeTrip.currentDay || 1} 天` : '今天'} userPosition={deviceLocation.coords} onLocate={deviceLocation.requestLocation} readOnly={activeTrip.status === '已完成'} onAdd={() => setScreen('add')} onDetails={id => openDetails(id, 'main')} /> : <TripPlacesEmpty trip={activeTrip} kind="地图" onAdd={() => setScreen('add')} />)}
        {tab === 'me' && <MeScreen energy={energy} trips={tripsWithCounts} visitedByTrip={visitedByTrip} activeTripId={activeTripId} bookingTasks={bookingTasks} productSignals={productSignals} onBookings={() => setScreen('booking')} onSwitch={id => { setActiveTripId(id); setTab('today'); setToast(`已切换到 ${trips.find(trip => trip.id === id)?.title}`) }} onDelete={deleteTrip} onCreate={() => setScreen('create')} onHotel={() => openHotel('main')} onToday={() => setTab('today')} onReset={clearTravelData} />}
      </main>
      <BottomNav tab={tab} setTab={next => { setTab(next); setScreen('main') }} />
    </>
  }

  return <div className={`app-frame ${screen === 'main' ? 'has-bottom-nav' : 'standalone-flow'}`}>
    <div className="grain" />
    {!online && <div className="offline-banner" role="status"><WifiOff/><span>{networkStatusLabel(online)}</span></div>}
    {renderScreen()}
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={17}/>{toast}</div>}
  </div>
}

function NoTripsScreen({ tab, onCreate }) {
  const content = {
    today: { title: '此刻去哪', heading: '下一段旅行，\n从这里开始。', detail: '选好目的地和日期，一起安排每天去哪、怎么走。', icon: Compass },
    map: { title: '行程地图', heading: '还没有旅行路线', detail: '创建旅行后，地点和每天的路线会出现在这里。', icon: MapIcon },
    me: { title: '我的旅行', heading: '你的旅行，还未开始', detail: '计划中的旅程和走过的地方，都会收在这里。', icon: Bookmark }
  }[tab]
  const Icon = content.icon
  return <div className={`screen no-trips-screen no-trips-${tab} enter`}>
    <header className="topbar"><div><h1>{content.title}</h1></div>{tab === 'me' && <span className="avatar" aria-label="用户 W">W</span>}</header>
    <section className="no-trips-content" aria-labelledby="no-trips-heading">
      <div className="no-trips-mark" aria-hidden="true"><Icon strokeWidth={1.4}/></div>
      <h2 id="no-trips-heading">{content.heading}</h2>
      <p>{content.detail}</p>
      <button className="form-next" onClick={onCreate}>创建旅行</button>
    </section>
    <p className="no-trips-note">{tab === 'me' ? '旅行保存在当前设备，随时回来继续规划。' : '还没做攻略也没关系，先从想去的城市开始。'}</p>
  </div>
}

function TodayScreen({ trip, places, plan, visited, locked, current, condition, conditionLabel, energy, setEnergy, stage, progress, onCurrent, onNavigate, onCheckRoute, onAdvance, onSnoozeArrival, onStayLonger, onChange, onEdit, onDetails, onFullRoute, onNextDay, onVerifyRisk, clock, location, bookingTasks, onBookings, feedback, onFeedback }) {
  const isDayPreview = stage === 'dayPreview'
  const liveWeather = useAmapWeather(trip.city, !isDayPreview)
  const planningClock = isDayPreview ? (trip.dayStartTime || '09:30') : clock
  const transportMode = tripTransportMode(trip)
  const locationLabel = location.status === 'ready' ? '已使用当前位置' : location.status === 'loading' ? '定位中…' : location.status === 'error' ? location.error : '定位起点'
  const remainingDays = (trip.dailyPlans || []).slice(trip.currentDay || 1).filter(day => day.length).length
  const isTripComplete = trip.status === '已完成' || stage === 'tripComplete'
  const tripDate = tripDateAtOffset(trip.startDate, Math.max(0, (trip.currentDay || 1) - 1))
  const todayStay = stayForTripDate(trip.stays || [], tripDate)
  const stayPlace = todayStay?.placeId ? places.get(todayStay.placeId) : null
  const liveOrigin = !isDayPreview && Array.isArray(location.coords) ? { name: '当前位置', position: location.coords } : stayPlace
  const currentIndex = current ? plan.findIndex(id => id === current.id) : -1
  const previousCompletedPlace = currentIndex > 0 && visited.includes(plan[currentIndex - 1]) ? places.get(plan[currentIndex - 1]) : null
  const routeOrigin = liveOrigin?.position
    ? { ...liveOrigin, area: liveOrigin.area || previousCompletedPlace?.area, mode: liveOrigin.mode || previousCompletedPlace?.mode }
    : previousCompletedPlace
  const currentTransportMode = current ? legTransportMode(routeOrigin, current, transportMode) : transportMode
  const transport = current ? getTransport(current, condition, energy, currentTransportMode) : null
  const publicTransit = currentTransportMode === 'public'
  const liveTransit = useAmapTransitRoute(routeOrigin?.position, current?.position, trip.city, publicTransit && Boolean(routeOrigin?.position))
  const liveDriving = useAmapDrivingRoute(routeOrigin?.position, current?.position, currentTransportMode === 'drive' && Boolean(routeOrigin?.position))
  const liveRouteState = publicTransit ? liveTransit : currentTransportMode === 'drive' ? liveDriving : null
  const liveRoute = liveRouteState?.status === 'complete' ? liveRouteState.route : null
  const legEstimate = routeOrigin?.position && current?.position ? transferReserveMinutes(routeOrigin, current, currentTransportMode) : null
  const travelMinutes = Number.isFinite(liveRoute?.minutes) ? liveRoute.minutes : legEstimate
  const readiness = departureReadiness({
    place: current,
    clock: planningClock,
    travelMinutes,
    hasOrigin: Boolean(routeOrigin?.position),
    routeStatus: liveRouteState?.status || (Number.isFinite(legEstimate) ? 'complete' : 'idle'),
    previewDay: isDayPreview && tripDate !== localDateKey()
  })
  const primaryAction = stage === 'enroute' ? { label: '手动确认到达', onClick: onAdvance }
    : stage === 'arrived' ? { label: '完成这一站', onClick: onAdvance }
      : readiness.status === 'locate' ? { label: readiness.label, onClick: location.requestLocation }
        : readiness.status === 'verify' ? { label: readiness.label, onClick: onCurrent }
          : readiness.status === 'blocked' ? { label: readiness.label, onClick: onChange }
            : readiness.status === 'verify-route' ? { label: readiness.label, onClick: onCheckRoute }
              : { label: readiness.label, onClick: onAdvance, disabled: ['loading', 'preview', 'empty'].includes(readiness.status) }
  const transportSummary = !transport ? ''
    : Number.isFinite(liveRoute?.minutes) ? `${transport.recommended.label}约 ${formatTravelTime(liveRoute.minutes)}`
      : liveRouteState?.status === 'loading' ? `${transport.recommended.label}路线计算中`
        : Number.isFinite(legEstimate) ? `${transport.recommended.label}暂估 ${formatTravelTime(legEstimate)}`
          : `${transport.recommended.label} · 出发时计算时间`
  const usesConditionReason = condition === 'rain' || condition === 'tired' || condition === 'hungry' || energy === 'low'
  const transportReason = usesConditionReason ? transport?.reason
    : Number.isFinite(liveRoute?.minutes) ? '高德当前路线'
      : Number.isFinite(legEstimate) ? `按${routeOrigin?.name === '当前位置' ? '当前位置' : '上一站'}到下一站距离暂估，出发时以导航为准`
        : '出发时确认实时路线'
  const risks = executionRisks({ trip, current, plan, places, visited, clock: planningClock, bookingTasks, condition, energy, transportMode })
  const resolveRisk = risk => {
    if (risk.id === 'rest') return onChange()
    if (risk.id === 'hours') return onVerifyRisk()
    if (risk.id === 'downstream') return onFullRoute()
    if (risk.id === 'late' && risk.action === '查看路线') return onCheckRoute()
    return onBookings()
  }
  const currentProgress = progress?.placeId === current?.id ? progress : {}
  const currentDistanceKm = current?.position && Array.isArray(location.coords) ? placeDistance({ position: location.coords }, current) : Number.POSITIVE_INFINITY
  const arrivalRangeKm = Math.min(.5, Math.max(.25, Number.isFinite(location.accuracy) ? location.accuracy / 1000 * 2 : .3))
  const nearDestination = stage === 'enroute' && Number.isFinite(currentDistanceKm) && currentDistanceKm <= arrivalRangeKm && (!currentProgress.arrivalSnoozeUntil || currentProgress.arrivalSnoozeUntil <= Date.now())
  const distanceLabel = Number.isFinite(currentDistanceKm) ? currentDistanceKm < 1 ? `约 ${Math.max(20, Math.round(currentDistanceKm * 100) * 10)} 米` : `约 ${currentDistanceKm.toFixed(1)} 公里` : ''
  const stayMinutesLeft = currentProgress.remindAt ? Math.max(0, Math.ceil((currentProgress.remindAt - Date.now()) / 60000)) : durationToMinutes(current?.duration)
  const stayReminderDue = stage === 'arrived' && Boolean(currentProgress.remindAt) && stayMinutesLeft === 0
  const journeyKicker = stage === 'enroute'
    ? location.status === 'error' || location.status === 'unsupported' ? '定位未开启 · 可手动确认到达' : location.status === 'ready' ? `位置更新中${distanceLabel ? ` · 距目的地${distanceLabel}` : ''}` : '正在获取位置…'
    : stage === 'arrived' ? `停留计时中 · ${stayReminderDue ? '现在可以准备离开' : `约 ${stayMinutesLeft} 分钟后提醒`}`
      : isDayPreview ? `下一天预览 · 按 ${planningClock} 规划`
        : condition ? `已按「${conditionLabel || conditionMeta[condition]?.label || '自定义要求'}」调整` : `行程建议 · ${clock} 更新`
  const weatherValue = liveWeather.weather || { temperature: trip.temperature || '--', label: trip.weather || (liveWeather.status === 'loading' ? '天气更新中…' : '天气待接入') }
  return <div className="screen today-screen enter">
    <header className="topbar">
      <div><div className="eyebrow">{isTripComplete ? `${trip.cityCode} · 旅行记录` : `${trip.cityCode} · DAY ${trip.currentDay || 1}`}</div><h1>{isTripComplete ? trip.title : isDayPreview ? `第 ${trip.currentDay || 1} 天预览` : '今天去哪'}</h1></div>
      <span className="avatar" aria-label="用户 W">W</span>
    </header>
    {!isTripComplete && <section className="weather-strip">
      <div className="weather-icon"><CloudSun size={25}/></div>
      <div><strong>{isDayPreview ? '--' : weatherValue.temperature}</strong><span>{isDayPreview ? '当天预报待确认' : weatherValue.label}</span></div><i />
      {isDayPreview ? <span className="location preview-origin"><Home size={15}/>{stayPlace ? `从${stayPlace.name}出发` : '起点当天确认'}</span> : <button className={`location ${location.status}`} onClick={location.requestLocation}><LocateFixed size={15}/><span>{locationLabel}</span></button>}
    </section>}

    {!isTripComplete && risks.length > 0 && <section className={`execution-risk ${risks[0].level === 'high' ? 'high' : ''}`} aria-label="行程提醒">
      {risks[0].id === 'rest' ? <Sparkles/> : <AlertTriangle/>}<div><small>{risks[0].label || '出发前风险'}{risks.length > 1 ? ` · 另有 ${risks.length - 1} 条` : ''}</small><strong>{risks[0].title}</strong></div>{risks[0].action && <button onClick={() => resolveRisk(risks[0])}>{risks[0].action}<ArrowRight/></button>}
    </section>}

    {current && !isTripComplete ? <section
      className={`hero-card route-ready ${current.photos?.[0] ? 'has-place-image' : ''}`}
      style={current.photos?.[0] ? { backgroundImage: `linear-gradient(90deg, rgba(10, 47, 36, .96) 0%, rgba(10, 47, 36, .84) 55%, rgba(10, 47, 36, .68) 100%), url("${current.photos[0]}")` } : undefined}
    >
      <div className="stamp">{stage === 'enroute' ? 'ON THE WAY' : stage === 'arrived' ? 'ARRIVED' : isDayPreview ? `DAY ${trip.currentDay || 1}` : clock}</div>
      <div className="hero-kicker">{stage === 'enroute' ? <LocateFixed size={14}/> : stage === 'arrived' ? <Clock3 size={14}/> : <Sparkles size={14}/>} {journeyKicker}</div>
      <h2><span className="hero-journey-label">{stage === 'enroute' ? '正在前往' : stage === 'arrived' ? '已经到达' : '下一站'}</span>{current.name}</h2>
      <p>{stage === 'ready' || isDayPreview ? <>{readiness.status === 'ready' ? `${transportSummary} · ${transportReason}` : readiness.detail}<br/></> : <>{transportSummary} · {transportReason}<br/></>}{placeClosingSentence(current)}，预计停留 {current.duration.replace('约 ', '')}</p>
      <button className="hero-detail-link" onClick={onCurrent}>查看地点与路线 <ArrowRight/></button>
      <div className="hero-action-row"><button className={`primary-cta ${readiness.status !== 'ready' && stage === 'ready' ? 'requires-check' : ''} ${readiness.status === 'locate' ? 'locate-cta' : ''}`} onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{stage === 'enroute' ? <MapPin/> : stage === 'arrived' ? <Check/> : readiness.status === 'locate' ? <LocateFixed/> : readiness.status === 'blocked' ? <AlertTriangle/> : null}{primaryAction.label}</button><button className="hero-change-cta" onClick={onChange}><Sparkles/>情况变了</button></div>
    </section> : <section className="hero-card route-ready day-complete-card"><div className="stamp">{clock}</div><div className="hero-kicker"><Check size={14}/>{isTripComplete ? '全程完成' : '今日完成'}</div><h2>{isTripComplete ? '这趟旅行，\n完成啦。' : '今天走完了，\n辛苦啦。'}</h2><p>{isTripComplete ? '计划地点已经全部完成，剩下的时间留给偶遇。' : remainingDays ? `后面还有 ${remainingDays} 天有安排，先看看下一天。` : '后面的日期留给休息，也可以从地图里再加地点。'}</p><button className="primary-cta" onClick={isTripComplete ? onFullRoute : onNextDay}>{isTripComplete ? '查看全程记录' : remainingDays ? '准备下一天' : '完成这次旅行'}<ArrowRight size={20}/></button></section>}

    {nearDestination && <section className="journey-assist arrival" role="status"><LocateFixed/><div><strong>看起来你已到达{current.name}</strong><span>{distanceLabel}，确认后才会开始记录停留时间。</span></div><div className="journey-assist-actions"><button onClick={onSnoozeArrival}>还没到</button><button className="primary" onClick={onAdvance}>确认到达</button></div></section>}
    {stage === 'arrived' && <section className={`journey-assist stay ${stayReminderDue ? 'due' : ''}`} role="status"><Clock3/><div><strong>{stayReminderDue ? '建议停留时间已到' : '停留计时中'}</strong><span>{stayReminderDue ? '可以完成这一站，也可以再待一会。' : `约 ${stayMinutesLeft} 分钟后提醒。`}</span></div>{stayReminderDue && <div className="journey-assist-actions"><button onClick={onStayLonger}>再待 20 分钟</button><button className="primary" onClick={onAdvance}>完成这一站</button></div>}</section>}

    <section className="section-block today-route-section">
      <div className="section-head"><div><h3>{isTripComplete ? '已完成的路线' : isDayPreview ? `第 ${trip.currentDay || 1} 天路线` : '今天的路线'}</h3><p className="section-lead">{isTripComplete ? '行程已结束，这里保留当天的地点与完成状态。' : `共 ${plan.length} 站 · 预约会锁定，其余地点可随${isDayPreview ? '当天计划' : '当前状态'}调整。`}</p></div>{!isTripComplete && <button onClick={onEdit}>编辑路线</button>}</div>
      <TodayRouteTimeline trip={trip} places={places} plan={plan} visited={visited} locked={locked} current={current} condition={condition} energy={energy} stage={stage} clock={planningClock} liveOrigin={routeOrigin} onDetails={onDetails}/>
      <button className="full-route-link" onClick={onFullRoute}><MapIcon/><strong>查看全部行程</strong><ArrowRight/></button>
    </section>

    {!isTripComplete && !isDayPreview && <section className="section-block energy-block">
      <div className="section-head"><div><h3>现在状态</h3></div><button onClick={onChange}>情况变了 <ArrowRight size={16}/></button></div>
      <div className="segmented">
        {[['high','⚡','还有劲'],['normal','🙂','一般'],['low','🫠','累了']].map(([id, emoji, label]) => <button key={id} className={energy === id ? 'active' : ''} onClick={() => setEnergy(id)}><span>{emoji}</span>{label}</button>)}
      </div>
    </section>}

    {!isTripComplete && !isDayPreview && <section className="advice-feedback" aria-label="建议反馈"><div><strong>这条下一站建议有帮助吗？</strong><span>你的反馈只用于改进路线判断。</span></div><div><button aria-label="有帮助" aria-pressed={feedback === 'helpful'} className={feedback === 'helpful' ? 'active' : ''} onClick={() => onFeedback('helpful')}><ThumbsUp/></button><button aria-label="没帮助" aria-pressed={feedback === 'unhelpful'} className={feedback === 'unhelpful' ? 'active' : ''} onClick={() => onFeedback('unhelpful')}><ThumbsDown/></button></div></section>}
  </div>
}

function TodayRouteTimeline({ trip, places, plan, visited, locked, current, condition, energy, stage, clock, liveOrigin, onDetails }) {
  const dayPlaces = plan.map(id => places.get(id)).filter(Boolean)
  const routeKey = dayPlaces.map(place => `${place.id}:${place.position?.join(',') || ''}`).join('|')
  const baseTransportMode = tripTransportMode(trip)
  const [routes, setRoutes] = useState([])

  useEffect(() => {
    let cancelled = false
    if (!dayPlaces.length) {
      setRoutes([])
      return undefined
    }
    const activeIndex = Math.max(0, dayPlaces.findIndex(place => place.id === current?.id))
    const requests = dayPlaces.map((place, index) => {
      const origin = index === activeIndex && liveOrigin?.position ? liveOrigin : index > 0 ? dayPlaces[index - 1] : liveOrigin
      if (!origin?.position || !place.position || visited.includes(place.id)) return Promise.resolve(null)
      const mode = legTransportMode(origin, place, baseTransportMode)
      if (mode === 'public') return searchAmapTransitRoute(origin.position, place.position, trip.city).catch(() => null)
      if (mode === 'drive') return searchAmapDrivingRoute(origin.position, place.position).catch(() => null)
      return Promise.resolve(null)
    })
    Promise.all(requests).then(result => { if (!cancelled) setRoutes(result) })
    return () => { cancelled = true }
  }, [routeKey, baseTransportMode, trip.city, current?.id, liveOrigin?.position?.join(','), visited.join(',')])

  const firstPendingIndex = dayPlaces.findIndex(place => !visited.includes(place.id))
  const previousCompletedPlace = firstPendingIndex > 0 ? dayPlaces[firstPendingIndex - 1] : null
  const hasKnownFirstOrigin = Boolean(liveOrigin?.position || previousCompletedPlace?.position)
  let cursor = clockToMinutes(clock) + (stage === 'ready' ? 5 : 0)
  let dayOverflow = false
  let scheduleBlocked = false
  return <div className="route-list">
    {dayPlaces.map((place, index) => {
      const done = visited.includes(place.id)
      const active = current?.id === place.id && !done
      const route = routes[index]
      const legOrigin = index === firstPendingIndex && liveOrigin?.position ? liveOrigin : index > 0 ? dayPlaces[index - 1] : liveOrigin
      const mode = legTransportMode(legOrigin, place, baseTransportMode)
      const publicTransit = mode === 'public'
      const estimatedTravel = getTransport(place, condition, energy, mode).recommended.minutes
      const routedEstimate = legOrigin?.position && place.position ? transferReserveMinutes(legOrigin, place, mode) : null
      const liveTravelMinutes = route?.minutes
      const travelMinutes = Number.isFinite(liveTravelMinutes) ? liveTravelMinutes : Number.isFinite(routedEstimate) ? routedEstimate : legOrigin?.position && Number.isFinite(estimatedTravel) ? estimatedTravel : null
      const blockedByUnknown = scheduleBlocked
      const scheduleUnavailable = !done && index >= firstPendingIndex && !blockedByUnknown && !Number.isFinite(travelMinutes)
      const scheduleEstimated = !done && Number.isFinite(travelMinutes) && !Number.isFinite(liveTravelMinutes)
      const blockedByPrevious = dayOverflow
      const timing = done || index < firstPendingIndex || blockedByPrevious || blockedByUnknown || scheduleUnavailable ? null : scheduleRuntimeStop(cursor, travelMinutes, place)
      const departure = timing?.departure ?? null
      const arrival = timing?.arrival ?? null
      const visitStart = timing?.visitStart ?? null
      const leave = timing?.leave ?? null
      const appointment = timing?.appointment ?? null
      const runtimeIssue = arrival === null ? null : runtimeStopIssue(place, { arrival, leave, now: clockToMinutes(clock) })
      if (scheduleUnavailable) scheduleBlocked = true
      if (runtimeIssue) dayOverflow = true
      else if (leave !== null) cursor = leave
      const schedule = scheduleUnavailable
        ? <span className="today-time-plan muted"><Clock3/><span><b>暂时没有建议时间</b><em>确认交通方式后补充</em></span></span>
        : blockedByUnknown
        ? <span className="today-time-plan muted"><Clock3/><span><b>前序时间待确认</b><em>先确认上一段交通与到达时间</em></span></span>
        : blockedByPrevious
        ? <span className="today-time-plan warning"><Clock3/><span><b>当天时间不足</b><em>前序安排已超出当天</em></span></span>
        : runtimeIssue
        ? <span className="today-time-plan warning"><Clock3/><span><b>{runtimeIssue.title}</b><em>{runtimeIssue.detail}</em></span></span>
        : arrival === null ? null : <span className={`today-time-plan ${scheduleEstimated ? 'estimated' : ''}`}><Clock3/><span><b>{formatClockMinutes(departure)} 出发 · {formatClockMinutes(arrival)} 到达{scheduleEstimated ? ' · 暂估' : ''}</b><em>{appointment !== null && visitStart === appointment ? `${formatClockMinutes(appointment)} 入场 · ` : ''}游览至 {formatClockMinutes(leave)}</em></span></span>
      let transitDetail = null
      if (publicTransit && !done && !dayOverflow && !blockedByUnknown) {
        const originName = index === firstPendingIndex && liveOrigin?.name ? liveOrigin.name : index > 0 ? dayPlaces[index - 1]?.name : '起点'
        const originMissing = index === firstPendingIndex && !hasKnownFirstOrigin
        transitDetail = route ? <span className="today-transit-detail"><TrainFront/><span><b>{originName}出发 · 公交约 {formatTravelTime(route.minutes)}</b><em>{route.steps.slice(0, 3).join(' → ')}</em></span></span> : originMissing ? <span className="today-transit-detail muted"><LocateFixed/><span><b>定位后查看首段公交</b><em>包括上车站、线路、换乘和下车站</em></span></span> : <span className="today-transit-detail loading"><span className="search-loader"/><span><b>{routes.length ? '暂未找到公交线路' : '正在查找公交路线'}</b><em>{routes.length ? '稍后再试，或出发时打开导航' : '请稍候…'}</em></span></span>
      }
      const detail = done ? `${place.category} · ${place.area}` : place.fixed ? '已预约 · 请提前 20 分钟到' : `${place.category} · ${place.area}`
      return <RouteRow key={place.id} time={done ? '已去' : place.fixed || (active ? '接下来' : `第 ${index + 1} 站`)} title={place.name} detail={detail} schedule={schedule} transitDetail={transitDetail} done={done} active={active} fixed={locked.includes(place.id)} onClick={() => onDetails(place.id)}/>
    })}
  </div>
}

function RouteRow({ time, title, detail, schedule, transitDetail, done, active, fixed, onClick }) {
  return <button className={`route-row ${done ? 'done' : ''} ${active ? 'active' : ''} ${schedule || transitDetail ? 'has-route-detail' : ''}`} onClick={onClick}>
    <div className="route-time">{time}</div>
    <div className="route-marker">{done ? <Check size={12}/> : fixed ? <TicketCheck size={13}/> : <span/>}</div>
    <div className="route-copy"><strong>{title}</strong><small>{detail}</small>{schedule}{transitDetail}</div>
    <ArrowRight size={16} className={`route-arrow ${active ? 'active' : ''}`}/>
  </button>
}

function recommendationReasons(place, condition, origin, readiness) {
  let first = place.priority === 'must' ? '这是你的必去地点，优先保留' : origin?.position ? `已按${origin.name || '当前起点'}与后续顺序计算` : '定位后再判断这一站是否顺路'
  if (condition === 'hungry') first = '你饿了，先吃点东西更舒服'
  if (condition === 'tired') first = '少走路，把体力留给目的地'
  if (condition === 'rain') first = place.indoor ? '室内为主，现在下雨也适合' : '这是保留地点，出发前先确认降雨和开放状态'
  const timeReason = place.closes === '待确认' ? '营业时间待确认，暂不判定现在可以前往' : readiness?.status === 'ready' ? `${placeClosingSentence(place)}，按当前路线计算可完成` : readiness?.detail || `${placeClosingSentence(place)}，出发前仍需核对`
  return [first, timeReason, place.nearby ? `结束后附近还有 ${place.nearby} 个行程地点` : '加入路线后会继续寻找顺路停靠点']
}

function RecommendScreen({ place, origin, city, transportMode, condition, conditionLabel, energy, stage, onBack, onChange, onAdvance, onNavigate, onCheckRoute, onVerify, verificationPending, onConfirmOpen, onConfirmClosed, canUndo, onUndo, location }) {
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const currentTransportMode = legTransportMode(origin, place, transportMode)
  const transport = getTransport(place, condition, energy, currentTransportMode)
  const hasPhotos = place.photos.length > 0
  const hasRating = Number.isFinite(place.rating)
  const liveTransit = useAmapTransitRoute(origin?.position, place.position, city, transport.recommended.id === 'transit' && Boolean(origin))
  const liveDriving = useAmapDrivingRoute(origin?.position, place.position, transport.recommended.id === 'drive' && Boolean(origin))
  const liveState = transport.recommended.id === 'transit' ? liveTransit : transport.recommended.id === 'drive' ? liveDriving : null
  const liveRoute = liveState?.status === 'complete' ? liveState.route : null
  const fallbackMinutes = origin?.position && place.position ? transferReserveMinutes(origin, place, transport.recommended.id) : null
  const readiness = departureReadiness({ place, clock: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()), travelMinutes: liveRoute?.minutes ?? fallbackMinutes, hasOrigin: Boolean(origin?.position), routeStatus: liveState?.status || (Number.isFinite(fallbackMinutes) ? 'complete' : 'idle') })
  const reasons = recommendationReasons(place, condition, origin, readiness)
  const verificationDayLabel = stage === 'dayPreview' ? '计划当天' : '今天'
  const action = stage === 'enroute' ? '我已到达' : stage === 'arrived' ? '完成这一站' : readiness.label
  const actionHandler = stage !== 'ready' ? onAdvance
    : readiness.status === 'locate' ? location.requestLocation
      : readiness.status === 'verify' ? onVerify
        : readiness.status === 'blocked' ? onChange
          : readiness.status === 'verify-route' ? onCheckRoute : onAdvance
  const actionDisabled = stage === 'ready' && ['loading', 'preview', 'empty'].includes(readiness.status)
  return <div className="screen recommendation-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>{stage === 'enroute' ? '正在前往' : stage === 'arrived' ? '已经到达' : '前往下一站'}</span><button className="text-btn" onClick={onChange}>情况变了</button></header>
    <div className={`place-visual tone-${place.tone}`}>
      {hasPhotos ? <img src={place.photos[photoIndex]} alt={`${place.name} 地点图片`}/> : <span className="visual-empty"><Images/>暂无地点图片</span>}<div className="visual-shade"/><span className="visual-word">{place.category}</span>
      <div className="place-number">NEXT / 01</div><div className="photo-hint"><Images size={16}/>{hasPhotos ? `图片 ${photoIndex + 1} / ${place.photos.length}` : '暂无图片'}</div>
      {place.photos.length > 1 && <div className="recommend-photo-dots">{place.photos.map((_, index) => <button key={index} aria-label={`查看第 ${index + 1} 张图片`} className={photoIndex === index ? 'active' : ''} onClick={() => setPhotoIndex(index)}/>)}</div>}
    </div>
    <section className="recommend-copy">
      <div className="result-label"><span/>{stage === 'enroute' ? '路线进行中' : stage === 'arrived' ? '到达地点' : '下一站'}</div>
      <h1>先去<br/>{place.name}</h1>
      <div className="place-sub detail-link">{place.sub}{hasRating && <> · {place.rating} <Star size={13} fill="currentColor"/></>}</div>
      {condition && <div className="condition-change-note"><span className="condition-chip">{conditionLabel || conditionMeta[condition]?.label || '自定义要求'} · 路线已更新</span>{canUndo && <button onClick={onUndo}><Undo2/>撤销</button>}</div>}
      <div className="reason-box"><h3>为什么现在去</h3>{reasons.map((reason, index) => <div className="reason" key={reason}><b>0{index + 1}</b><span>{reason}</span></div>)}</div>
      {verificationPending && place.closes === '待确认' && !place.openingVerifiedAt && <div className="opening-verification" role="status"><div><Clock3/><span><strong>先核对营业状态</strong><small>打开高德查看计划日期信息，返回后再确认结果。</small></span></div><button className="opening-check-link" onClick={onVerify}><ExternalLink/>打开高德核对</button><div><button onClick={onConfirmOpen}>{verificationDayLabel}开放</button><button onClick={onConfirmClosed}>{verificationDayLabel}不开放</button></div></div>}
      <TransportPanel transport={transport} liveTransit={liveTransit} liveDriving={liveDriving} origin={origin} destination={place} onLocate={location.requestLocation} open={showAlternatives} onToggle={() => setShowAlternatives(value => !value)} />
      <button className={`depart-btn ${readiness.status !== 'ready' && stage === 'ready' ? 'requires-check' : ''}`} onClick={actionHandler} disabled={actionDisabled}>{stage === 'arrived' ? <Check size={20}/> : readiness.status === 'locate' ? <LocateFixed size={20}/> : readiness.status === 'blocked' ? <AlertTriangle size={20}/> : null} {action}{stage !== 'ready' && <span>· 站内继续</span>}</button>
      {stage !== 'arrived' && <button className="reopen-navigation" onClick={stage === 'enroute' ? onNavigate : onCheckRoute}><Navigation/>{stage === 'enroute' ? '在高德中继续导航' : '只在高德中核对路线'}</button>}
      <section className="recommend-place-details">
        <div className="detail-section-head"><div><MapPin/><h2>地点详情</h2></div><span>{place.area}</span></div>
        <p className="place-summary">{place.summary}</p>
        <div className="detail-facts"><div><Clock3/><span><small>建议停留</small><strong>{place.duration}</strong></span></div><div><MapPin/><span><small>所在区域</small><strong>{place.area}</strong></span></div></div>
        <section className="review-section"><div className="detail-section-head"><div><MessageCircle/><h2>{place.source === 'amap' ? '网友评价' : '示例评价'}</h2></div><span>{hasRating ? `${place.rating} / 5.0` : '暂无'}</span></div>{place.source !== 'amap' && <p className="demo-data-note">以下内容仅用于演示版式，不代表真实平台评价。</p>}{place.reviews.length ? place.reviews.map(review => <article className="review-card" key={review.name}><div><strong>{review.name}</strong><span>{review.tag}</span></div><div className="review-stars">★★★★★</div><p>{review.text}</p></article>) : <div className="review-empty">暂无可展示的真实评价。</div>}</section>
        <section className="source-section" aria-label="信息来源"><h2>信息来源</h2>{place.source === 'amap' && <div><Check/><span><strong>高德地图</strong><small>{`名称、地址、坐标${hasRating ? '和公开评分' : ''}${hasPhotos ? '、地点图片' : ''}`}</small></span></div>}<div className="pending"><Clock3/><span><strong>出发前仍需核对</strong><small>营业时间、临时闭馆、票务与实时交通</small></span></div></section>
      </section>
    </section>
  </div>
}

function TransportPanel({ transport, liveTransit, liveDriving, origin, destination, onLocate, open, onToggle }) {
  const isTransit = transport.recommended.id === 'transit'
  const isDriving = transport.recommended.id === 'drive'
  const liveState = isTransit ? liveTransit : isDriving ? liveDriving : null
  const liveRoute = liveState?.status === 'complete' ? liveState.route : null
  const alternatives = transport.alternatives || []
  const hasOrigin = Array.isArray(origin?.position)
  const fallbackMinutes = hasOrigin && Array.isArray(destination?.position) ? transferReserveMinutes(origin, destination, transport.recommended.id) : null
  const transportHeadline = Number.isFinite(liveRoute?.minutes) ? `${transport.recommended.label}约 ${formatTravelTime(liveRoute.minutes)}`
    : liveState?.status === 'loading' ? `${transport.recommended.label} · 路线计算中`
      : Number.isFinite(fallbackMinutes) ? `${transport.recommended.label}暂估 ${formatTravelTime(fallbackMinutes)}`
        : `${transport.recommended.label} · ${hasOrigin ? '出发时计算' : '等待定位'}`
  const costLabel = isTransit && liveRoute?.cost !== null && liveRoute?.cost !== undefined ? `¥${liveRoute.cost}`
    : isDriving ? '待导航' : hasOrigin ? transport.recommended.cost : '待计算'
  return <div className="transport-panel">
    <div className="transport-card recommended-mode">
      <div className="transport-icon"><TransportModeIcon id={transport.recommended.id}/></div>
      <div><small>推荐交通</small><strong>{transportHeadline}</strong><p>{hasOrigin ? `${origin.name} → ${destination.name}` : `起点待定 → ${destination.name}`}</p></div>
      <div className="transport-side"><small>费用</small><strong>{costLabel}</strong></div>
    </div>
    {isTransit && liveRoute ? <div className="live-transit-detail"><strong>公共交通路线</strong><span>{liveRoute.steps.slice(0, 5).join(' → ')}</span><small>全程约 {formatTravelTime(liveRoute.minutes)}{liveRoute.walkMeters ? ` · 步行 ${liveRoute.walkMeters} 米` : ''} · 高德方案</small></div>
      : isDriving && liveRoute ? <div className="live-transit-detail"><strong>高德驾车路线</strong><span>{origin.name} → {destination.name}</span><small>全程约 {formatTravelTime(liveRoute.minutes)}{Number.isFinite(liveRoute.distanceKm) ? ` · ${liveRoute.distanceKm} 公里` : ''}</small></div>
        : (isTransit || isDriving) && !hasOrigin ? <div className="transit-origin-required"><strong>定位后查看{isTransit ? '公交' : '驾车'}路线</strong><span>当前位置 → {destination.name}</span><small>{isTransit ? '包括上车站、线路、换乘和下车站。' : '按当前位置计算实时车程和距离。'}</small><button onClick={onLocate}><LocateFixed/>定位并查看路线</button></div>
          : isTransit || isDriving ? <div className="route-detail">{liveState?.status === 'loading' ? `正在计算${isTransit ? '公交' : '驾车'}路线…` : `暂未获得${isTransit ? '公交' : '驾车'}路线，出发时以高德导航为准。`}</div>
            : <div className="route-detail">景区接驳以现场班次和管制为准，出发前再确认一次。</div>}
    {alternatives.length > 0 && <><button className="alternatives-toggle" onClick={onToggle}>其他方式 <ChevronDown className={open ? 'open' : ''}/></button>
    {open && <div className="transport-alternatives">{alternatives.map(item => <div key={item.id}><span><TransportModeIcon id={item.id}/></span><strong>{item.label} · {formatTravelTime(item.minutes)}</strong><small>{item.cost}</small></div>)}</div>}</>}
  </div>
}

function TransportModeIcon({ id }) {
  if (id === 'walk') return <Footprints/>
  if (id === 'drive' || id === 'charter' || id === 'taxi') return <CarFront/>
  if (id === 'shuttle') return <BusFront/>
  return <TrainFront/>
}

function ConditionScreen({ trip, city, active, activeLabel, current, plan, places, visited, locked, bookingTasks = [], clock, condition, energy, onBack, onChoose, onChooseTrip, onUndo }) {
  const [scope, setScope] = useState('today')
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  const [requestText, setRequestText] = useState('')
  const [feedbackState, setFeedbackState] = useState('idle')
  const [aiPreview, setAiPreview] = useState(null)
  const [fallbackReason, setFallbackReason] = useState('')
  const [history, setHistory] = useState([])
  const activeDayIndex = Math.max(0, (trip?.currentDay || 1) - 1)
  const tripScope = aiPreview?.scope === 'trip' || (scope === 'trip' && !aiPreview)
  const selectedMeta = selected ? conditionMeta[selected] || { label: '自定义调整', hint: '按你的说明重新安排', preview: '根据你的要求重排后续路线' } : null
  const preview = aiPreview || (selectedMeta && scope === 'today' ? previewConditionChange({ ids: plan, places, condition: selected, lockedIds: locked, visitedIds: visited, currentId: current?.id }) : null)
  const nextPlace = preview?.nextId ? places.find(place => place.id === preview.nextId) : null
  const pendingCount = plan.filter(id => !visited.includes(id)).length
  const remainingDayCount = Math.max(1, (trip?.dailyPlans?.length || trip?.days || 1) - activeDayIndex)
  const protectedCount = locked.filter(id => (tripScope ? trip.dailyPlans.slice(activeDayIndex).flat() : plan).includes(id) && !visited.includes(id)).length
  const responseTitle = aiPreview?.title || {
    rain: '可以，今天尽量避雨', tired: '可以，今天改轻松一点', hungry: '可以，先解决吃饭',
    late: '可以，压缩今天的安排', skip: '可以，先跳过这一站', closed: '收到，我会绕开关闭地点',
    custom: '我按你的要求整理了一版'
  }[selected] || selectedMeta?.preview
  useEffect(() => {
    if (!requestText && !history.length) return
    const frame = window.requestAnimationFrame(() => {
      const chat = document.querySelector('.condition-chat')
      chat?.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [requestText, selected, feedbackState, history.length])

  const buildTripPreview = async (text, fallbackKey) => {
    const sourcePlans = (trip.dailyPlans || []).map((day, index) => index === activeDayIndex ? [...plan] : [...day])
    const removedIds = explicitlyRemovedPlaceIds(text, places, current?.id, fallbackKey)
    const removedSet = new Set(removedIds)
    const remainingDays = Math.max(1, sourcePlans.length - activeDayIndex)
    const routeIds = [...new Set(sourcePlans.slice(activeDayIndex).flat())].filter(id => !visited.includes(id) && !removedSet.has(id))
    const routeCandidates = routeIds.map(id => places.find(place => place.id === id)).filter(Boolean)
    const routePlaces = uniqueRoutePlaces(routeCandidates, { semantic: true, city })
    const keptRouteIds = new Set(routePlaces.map(place => place.id))
    routeCandidates.filter(place => !keptRouteIds.has(place.id)).forEach(place => {
      if (!removedIds.includes(place.id)) removedIds.push(place.id)
    })
    const hotelPlaces = (trip.stays || []).map(stay => {
      const place = places.find(item => item.id === stay.placeId)
      return place ? { ...place, checkIn: stay.checkIn, checkOut: stay.checkOut } : null
    }).filter(Boolean)
    let groups = []
    let explanation = '已按你的要求重新检查后续每天的节奏、闭馆时间和预约。'
    let localFallback = ''
    if (routePlaces.length) {
      try {
        const result = await requestAiPlan({
          city,
          days: remainingDays,
          pace: trip.pace || 'normal',
          transport: trip.transportPreference || 'public',
          dayStartTime: trip.dayStartTime || '09:30',
          preferences: [trip.preferenceNote, text, `从第 ${activeDayIndex + 1} 天起调整；已完成地点不动；预约和锁定地点优先保留。`].filter(Boolean).join('；'),
          places: routePlaces,
          stays: trip.stays || [],
          intent: 'replan'
        })
        const routeMap = new Map(routePlaces.map(place => [String(place.id), place]))
        groups = result.days.map(day => day.placeIds.map(id => routeMap.get(String(id))).filter(Boolean))
        explanation = result.explanation || explanation

        if (tripTransportMode(trip) === 'drive') {
          const sourceGroups = sourcePlans.slice(activeDayIndex).map(day => day
            .filter(id => !visited.includes(id) && !removedSet.has(id))
            .map(id => places.find(place => place.id === id))
            .filter(Boolean))
          const sourceRoute = sourceGroups.flat()
          const suggestedRoute = groups.flat()
          const samePlaces = sourceRoute.length === suggestedRoute.length
            && sourceRoute.every(place => suggestedRoute.some(item => item.id === place.id))
          const sourceDistance = routeDistance(sourceRoute)
          const suggestedDistance = routeDistance(suggestedRoute)
          if (samePlaces && sourceDistance > 0 && suggestedDistance > sourceDistance * 1.08) {
            groups = sourceGroups
            explanation = '当前自驾顺序已经更连贯。为了避免额外折返，先保留原顺序；若还要更轻松，需要删除地点、增加天数或缩短停留。'
          }
        }
      } catch (error) {
        groups = buildFlexiblePlan(routePlaces, remainingDays, trip.pace || 'normal', hotelPlaces, tripDateAtOffset(trip.startDate, activeDayIndex))
        localFallback = error.message || 'AI 暂时不可用'
      }
    }
    const remainingPlans = Array.from({ length: remainingDays }, (_, index) => (groups[index] || []).map(place => place.id))
    const completedToday = plan.filter(id => visited.includes(id) && !removedSet.has(id))
    const dailyPlans = [...sourcePlans.slice(0, activeDayIndex), ...remainingPlans]
    dailyPlans[activeDayIndex] = [...completedToday, ...(dailyPlans[activeDayIndex] || []).filter(id => !completedToday.includes(id))]
    const balancedPlans = balanceDailyMealStops(dailyPlans, places, activeDayIndex)
    dailyPlans.splice(0, dailyPlans.length, ...balancedPlans)

    const unscheduledIds = []
    for (let dayIndex = activeDayIndex; dayIndex < dailyPlans.length; dayIndex += 1) {
      const proposal = buildTodayFeasibilityProposal({
        ids: dailyPlans[dayIndex] || [], places,
        visitedIds: dayIndex === activeDayIndex ? visited : [],
        lockedIds: locked,
        clock: dayIndex === activeDayIndex ? clock : (trip.dayStartTime || '09:30'),
        condition: fallbackKey || condition,
        energy: dayIndex === activeDayIndex ? energy : 'normal',
        transportMode: tripTransportMode(trip)
      })
      dailyPlans[dayIndex] = proposal.nextPlan
      if (!proposal.overflow.length) continue
      const overflowIds = proposal.overflow.map(item => item.id)
      if (dailyPlans[dayIndex + 1]) dailyPlans[dayIndex + 1] = [...overflowIds, ...dailyPlans[dayIndex + 1].filter(id => !overflowIds.includes(id))]
      else unscheduledIds.push(...overflowIds)
    }
    const changedDayCount = dailyPlans.reduce((count, day, index) => count + (JSON.stringify(day) === JSON.stringify(sourcePlans[index] || []) ? 0 : 1), 0)
    const originalDayById = new Map(sourcePlans.flatMap((ids, dayIndex) => ids.map(id => [id, dayIndex])))
    const nextDayById = new Map(dailyPlans.flatMap((ids, dayIndex) => ids.map(id => [id, dayIndex])))
    const movedPlaces = [...new Set([...originalDayById.keys(), ...nextDayById.keys()])].map(id => {
      const fromDay = originalDayById.get(id)
      const toDay = nextDayById.get(id)
      if (fromDay === toDay) return null
      return { id, name: places.find(place => place.id === id)?.name || '未知地点', fromDay, toDay }
    }).filter(Boolean)
    const lodgingImpacts = sourcePlans.slice(activeDayIndex, -1).map((_, offset) => {
      const nightIndex = activeDayIndex + offset
      const originalEnd = sourcePlans[nightIndex]?.at(-1)
      const originalNext = sourcePlans[nightIndex + 1]?.[0]
      const nextEnd = dailyPlans[nightIndex]?.at(-1)
      const nextStart = dailyPlans[nightIndex + 1]?.[0]
      if (originalEnd === nextEnd && originalNext === nextStart) return null
      return {
        nightIndex,
        title: `第 ${nightIndex + 1} 晚住宿区域需重新核对`,
        detail: `当晚末站与次日首站已变化，现有住宿先保留。`
      }
    }).filter(Boolean)
    const affectedIds = new Set([...movedPlaces.map(item => item.id), ...removedIds])
    const bookingImpacts = bookingTasks.filter(task => task.status !== 'not_needed' && task.placeId && affectedIds.has(task.placeId)).map(task => ({ placeId: task.placeId, title: task.title }))
    const movedFromCurrentDay = movedPlaces.filter(item => item.fromDay === activeDayIndex && Number.isFinite(item.toDay) && item.toDay > activeDayIndex)
    const changes = [
      `从第 ${activeDayIndex + 1} 天起重新检查 ${remainingDays} 天`,
      changedDayCount ? `共有 ${changedDayCount} 天的地点或顺序会改变` : '后续顺序无需改变',
      removedIds.length ? `移除指定或同品牌重复地点：${removedIds.map(id => places.find(place => place.id === id)?.name).filter(Boolean).join('、')}` : '没有删除地点',
      changedDayCount && movedFromCurrentDay.length ? `当前这一天有 ${movedFromCurrentDay.length} 个地点移到后续日期` : changedDayCount ? '当前这一天没有地点移到后续日期' : '当前这一天保持原安排',
      unscheduledIds.length ? `最后仍有 ${unscheduledIds.length} 个地点放不下，必须删减或增加天数` : '所有地点都能落在可用日期内'
    ]
    return {
      scope: 'trip', dailyPlans, changedDayCount, removedIds, unscheduledIds, changes, movedPlaces, lodgingImpacts, bookingImpacts,
      provider: localFallback ? 'local' : 'deepseek', fallbackReason: localFallback,
      title: changedDayCount ? `我整理了后续 ${remainingDays} 天` : '后续安排暂时不用改', explanation
    }
  }

  const requestAdjustment = async (text, fallbackKey, forcedScope = null) => {
    if (!text || feedbackState === 'thinking') return
    const targetScope = forcedScope || inferReplanScope(text) || scope
    const earlierRequests = history.filter(message => message.role === 'user').map(message => message.text)
    const combinedRequest = [...earlierRequests, text].join('；')
    setScope(targetScope)
    setRequestText(text)
    setSelected(fallbackKey)
    setAiPreview(null)
    setFallbackReason('')
    setFeedbackState('thinking')
    setDraft('')
    try {
      if (targetScope === 'trip') {
        const result = await buildTripPreview(combinedRequest, fallbackKey)
        setAiPreview(result)
        setFallbackReason(result.fallbackReason || '')
        setFeedbackState('ready')
        return
      }
      const result = await requestAiReplan({
        city, request: combinedRequest, currentId: current?.id, planIds: plan, visitedIds: visited, lockedIds: locked,
        places: plan.map(id => places.find(place => place.id === id)).filter(Boolean)
      })
      const originalIds = new Map(plan.map(id => [String(id), id]))
      const nextPlan = result.nextPlan.map(id => originalIds.get(String(id))).filter(id => id !== undefined)
      const nextId = result.nextId === null ? null : originalIds.get(String(result.nextId))
      setSelected(result.conditionKey || fallbackKey)
      setAiPreview({ ...result, nextPlan, nextId })
      setFeedbackState('ready')
    } catch (error) {
      const localPreview = previewConditionChange({ ids: plan, places, condition: fallbackKey, lockedIds: locked, visitedIds: visited, currentId: current?.id })
      setAiPreview({ ...localPreview, provider: 'local', title: '先按本地规则整理了一版', explanation: conditionMeta[fallbackKey]?.hint || '优先保留预约和锁定地点，并减少折返。' })
      setFallbackReason(error.message || 'DeepSeek 暂时不可用')
      setFeedbackState('ready')
    }
  }
  const chooseQuick = key => requestAdjustment(conditionMeta[key].label, key)
  const submitRequest = event => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    requestAdjustment(text, inferConditionRequest(text))
  }
  const restartRequest = () => {
    if (requestText && feedbackState === 'ready') {
      setHistory(items => [...items, { role: 'user', text: requestText }, { role: 'assistant', text: responseTitle }])
    }
    setSelected('')
    setRequestText('')
    setAiPreview(null)
    setFallbackReason('')
    setFeedbackState('idle')
    window.requestAnimationFrame(() => document.querySelector('.condition-composer input')?.focus())
  }
  const applyRequest = () => {
    if (preview?.scope === 'trip') onChooseTrip(selected, requestText, preview)
    else onChoose(selected, requestText, preview)
    setFeedbackState('applied')
  }
  const undoAppliedRequest = () => {
    onUndo()
    restartRequest()
  }
  const chooseScope = nextScope => {
    if (nextScope === scope || feedbackState === 'thinking') return
    if (requestText && feedbackState === 'ready') {
      setHistory(items => [...items, { role: 'user', text: requestText }, { role: 'assistant', text: responseTitle }])
    }
    setScope(nextScope)
    setSelected('')
    setRequestText('')
    setAiPreview(null)
    setFallbackReason('')
    setFeedbackState('idle')
  }
  return <div className="screen condition-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>情况变了</span><i/></header>
    <section className="condition-chat" aria-label="AI 行程调整对话">
      <div className="condition-message assistant"><span className="condition-avatar"><Sparkles/></span><div><strong>现在发生了什么？</strong><p>可以只改今天，也可以调整后续行程。我会先给你看完整结果，确认后才会修改；预约和锁定地点默认保留，冲突会单独标出。</p>{active && <small>当前已按「{activeLabel || conditionMeta[active]?.label || '自定义要求'}」调整</small>}</div></div>
      <div className="condition-scope" aria-label="调整范围"><span>这次想调整</span><div><button className={scope === 'today' ? 'active' : ''} onClick={() => chooseScope('today')}>今天</button><button className={scope === 'trip' ? 'active' : ''} onClick={() => chooseScope('trip')}>后续行程</button></div></div>
      <div className="condition-quick-replies"><span>你可以直接选</span><div>{Object.entries(conditionMeta).map(([key, meta]) => <button key={key} disabled={feedbackState === 'thinking'} className={selected === key ? 'active' : ''} onClick={() => chooseQuick(key)}>{meta.label}</button>)}<button disabled={feedbackState === 'thinking'} onClick={() => requestAdjustment('后面几天想轻松一点', 'tired', 'trip')}>后面几天轻松一点</button></div></div>
      {history.map((message, index) => message.role === 'user' ? <div className="condition-message user history" key={`${message.role}-${index}`}><p>{message.text}</p></div> : <div className="condition-message assistant history" key={`${message.role}-${index}`}><span className="condition-avatar"><Sparkles/></span><div><p>{message.text}</p></div></div>)}
      {requestText && <div className="condition-message user"><p>{requestText}</p></div>}
      {feedbackState === 'thinking' && <div className="condition-message assistant thinking" role="status"><span className="condition-avatar"><Sparkles/></span><div><span className="condition-thinking-dots"><i/><i/><i/></span><strong>{scope === 'trip' ? `正在检查后续 ${remainingDayCount} 天` : `正在调整剩余 ${pendingCount} 站`}</strong><p>确认前不会修改路线。</p></div></div>}
      {selectedMeta && preview && feedbackState === 'ready' && <div className={`condition-message assistant response ${preview.scope === 'trip' ? 'trip-response' : ''}`}><span className="condition-avatar"><Sparkles/></span><div><strong>{responseTitle}</strong><p>{aiPreview?.explanation || (selected === 'custom' ? '我会优先保留必去与预约，再减少折返。' : selectedMeta.hint)}</p><div className="condition-result-facts">{preview.scope === 'trip' ? <><span><small>调整范围</small><b>第 {activeDayIndex + 1} 天起</b></span><span><small>变化</small><b>{preview.changedDayCount ? `${preview.changedDayCount} 天会调整` : '暂时不用改'}</b></span></> : <><span><small>调整后下一站</small><b>{nextPlace?.name || '今天不再安排地点'}</b></span><span><small>预约与锁定</small><b>{protectedCount ? `保留 ${protectedCount} 个` : '没有受影响'}</b></span></>}</div>
        {preview.scope === 'trip' && <div className="condition-trip-preview" aria-label="后续行程预览">{preview.dailyPlans.slice(activeDayIndex).map((ids, offset) => {
          const dayPlaces = ids.map(id => places.find(place => place.id === id)).filter(Boolean)
          const firstTravelMinutes = dayPlaces[0] ? getTransport(dayPlaces[0], '', 'normal', tripTransportMode(trip)).recommended.minutes : null
          const startTime = offset === 0 ? clock : (trip.dayStartTime || '09:30')
          const daySchedule = buildSuggestedDaySchedule(dayPlaces, { startTime, transport: tripTransportMode(trip), firstTravelMinutes })
          const warnings = daySchedule.filter(item => item.warning).length
          return <div key={activeDayIndex + offset}><span><small>第 {activeDayIndex + offset + 1} 天</small><b>{formatTripDate(trip.startDate, activeDayIndex + offset)}</b></span><p>{dayPlaces.length ? dayPlaces.map(place => place.name).join(' → ') : '留给休息 / 暂无安排'}{dayPlaces.length > 0 && <em>{startTime} 出发 · {formatClockMinutes(daySchedule.at(-1)?.end)} 结束{warnings ? ` · ${warnings} 处时间需确认` : ''}</em>}</p></div>
        })}</div>}
        {preview.scope === 'trip' && (preview.movedPlaces?.length || preview.lodgingImpacts?.length || preview.bookingImpacts?.length) > 0 && <div className="condition-impact-preview" aria-label="连带影响">
          <strong>需要一起确认</strong>
          {preview.movedPlaces?.slice(0, 4).map(item => <span key={item.id}><MapPin/><b>{item.name}</b><small>{item.fromDay === undefined ? '新加入' : `第 ${item.fromDay + 1} 天`} → {item.toDay === undefined ? '移出行程' : `第 ${item.toDay + 1} 天`}</small></span>)}
          {preview.lodgingImpacts?.length > 0 && <span><Home/><b>{preview.lodgingImpacts.length} 晚住宿</b><small>现有住宿不会被自动替换，将标记为待重新确认</small></span>}
          {preview.bookingImpacts?.length > 0 && <span><TicketCheck/><b>{preview.bookingImpacts.length} 项预约</b><small>{preview.bookingImpacts.map(item => item.title).join('、')} 将恢复为待确认</small></span>}
        </div>}
        {preview.scope === 'trip' && preview.unscheduledIds?.length > 0 && <div className="condition-hard-stop" role="alert"><AlertTriangle/><span><strong>这版还不能确认</strong><small>有 {preview.unscheduledIds.length} 个地点在现有日期内放不下。请继续说明删减哪些地点，或修改日期。</small></span></div>}
        <ul>{(preview.changes || []).map(change => <li key={change}>{change}</li>)}</ul>{fallbackReason && <small className="condition-source-note fallback">AI 暂时没有返回结果，已用本地时间与距离规则生成可预览方案。</small>}<div className="condition-response-actions">{preview.scope === 'trip' && (!preview.changedDayCount || preview.unscheduledIds?.length) ? <button className="condition-apply" onClick={restartRequest}>继续说明怎么删减<ArrowRight/></button> : <><button className="condition-apply" onClick={applyRequest}>{preview.scope === 'trip' ? '确认更新后续行程' : '按这个调整'}<ArrowRight/></button><button className="condition-revise" onClick={restartRequest}>继续补充</button></>}</div><button className="condition-defer" onClick={onBack}>{preview.scope === 'trip' && !preview.changedDayCount ? '保持原安排' : '先不改'}</button></div></div>}
      {feedbackState === 'applied' && <div className="condition-message assistant response success" role="status"><span className="condition-avatar"><Check/></span><div><strong>{tripScope ? '已更新后续行程' : '已更新今天路线'}</strong><p>{tripScope ? '新的逐日安排已保存；你仍可以撤销这次修改。' : nextPlace ? `下一站是「${nextPlace.name}」。` : '今天后续地点已调整完成。'}</p><div className="condition-response-actions"><button className="condition-apply" onClick={onBack}>{tripScope ? '查看新行程' : '查看新路线'}<ArrowRight/></button><button className="condition-revise" onClick={undoAppliedRequest}><Undo2/>撤销</button></div></div></div>}
    </section>
    <form className="condition-composer" onSubmit={submitRequest}><input value={draft} onChange={event => setDraft(event.target.value)} aria-label="告诉 AI 你的情况" placeholder="告诉我你的要求…"/><button type="submit" aria-label="发送要求" disabled={!draft.trim() || feedbackState === 'thinking'}><ArrowUp/></button></form>
  </div>
}

function EditPlanScreen({ trip, places, plan, visited, locked, clock, previewDay, condition, energy, onBack, onMove, onToggleLock, onRemove, onAdd, onApplyToday, onEditWholeTrip, onDetails }) {
  const [proposalOpen, setProposalOpen] = useState(false)
  const transportMode = tripTransportMode(trip)
  const currentDayIndex = Math.max(0, (trip.currentDay || 1) - 1)
  const otherDayIds = new Set((trip.dailyPlans || []).flatMap((day, index) => index === currentDayIndex ? [] : day))
  const available = places.filter(place => !plan.includes(place.id) && !otherDayIds.has(place.id))
  const scheduledElsewhereCount = places.filter(place => otherDayIds.has(place.id)).length
  const runtimeStatus = useMemo(() => buildRuntimeDayStatus({ ids: plan, places, visitedIds: visited, clock, condition, energy, transportMode }), [plan, places, visited, clock, condition, energy, transportMode])
  const statusById = useMemo(() => new Map(runtimeStatus.map(status => [status.id, status])), [runtimeStatus])
  const conflicts = runtimeStatus.filter(status => status.issue)
  const proposal = useMemo(() => buildTodayFeasibilityProposal({ ids: plan, places, visitedIds: visited, lockedIds: locked, clock, condition, energy, transportMode }), [plan, places, visited, locked, clock, condition, energy, transportMode])
  const hasNextDay = (trip.currentDay || 1) < (trip.dailyPlans?.length || trip.days || 1)
  useEffect(() => setProposalOpen(false), [plan.join(','), locked.join(',')])
  const applyToday = () => {
    onApplyToday({ nextPlan: proposal.nextPlan, removedIds: proposal.overflow.map(item => item.id) })
    setProposalOpen(false)
  }
  return <div className="screen edit-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>{previewDay ? `编辑第 ${trip.currentDay || 1} 天` : '编辑今天'}</span><button className="text-btn" onClick={onBack}>完成</button></header>
    <section className="edit-intro"><div className="eyebrow">FLEXIBLE DAY PLAN</div><h1>先看{previewDay ? '这一天' : '今天'}，<br/>还能做什么。</h1><p>{previewDay ? `这是第 ${trip.currentDay || 1} 天预览，按 ${clock} 开始规划。` : '这里只调整今天。'}如果要把地点移到下一天，需要进入整段行程确认后续变化。</p>
      {conflicts.length > 0 && <div className="edit-feasibility" role="status"><AlertTriangle/><span><strong>{previewDay ? `按 ${clock} 开始规划` : '按当前时间'}，{conflicts.length} 个地点{previewDay ? '这一天' : '今天'}放不下</strong><small>下方已标出原因；AI 不会直接改到下一天。</small></span></div>}
      <button className="ai-replan" onClick={() => setProposalOpen(true)}><Sparkles/>{conflicts.length ? '查看 AI 调整建议' : `让 AI 检查${previewDay ? '这一天' : '今天'}路线`}</button>
    </section>
    {proposalOpen && <section className="edit-ai-proposal" aria-label="AI 调整预览">
      <header><span><Sparkles/></span><div><small>调整预览</small><strong>{proposal.overflow.length ? `${previewDay ? '这一天' : '今天'}建议保留 ${proposal.accepted.length} 个地点` : `${previewDay ? '这一天' : '今天'}的时间可行`}</strong></div><button aria-label="关闭调整预览" onClick={() => setProposalOpen(false)}><X/></button></header>
      {proposal.overflow.length > 0 ? <>
        <p>建议先把下列地点移出{previewDay ? '这一天' : '今天'}：</p>
        <ul>{proposal.overflow.map(item => <li key={item.id}><span><strong>{item.place?.name}</strong><small>{item.issue.title}</small></span></li>)}</ul>
        <div className="edit-proposal-impact"><CalendarDays/><span><strong>移到下一天会改动后续行程</strong><small>{hasNextDay ? '这里不会自动执行，需要另行确认整段路线。' : '当前已是最后一天，需要重新调整整段路线。'}</small></span></div>
      </> : <p>当前顺序可以在{previewDay ? '这一天' : '今天'}完成，确认后只会重排未完成的地点。</p>}
      <div className="edit-proposal-actions"><button className="primary" onClick={applyToday}>{proposal.overflow.length ? `只精简${previewDay ? '这一天' : '今天'}` : `确认${previewDay ? '这一天' : '今天'}顺序`}</button>{proposal.overflow.length > 0 && <button onClick={onEditWholeTrip}>调整整段行程</button>}<button className="text" onClick={() => setProposalOpen(false)}>先不改</button></div>
      {proposal.overflow.length > 0 && <small className="edit-proposal-footnote">“只精简{previewDay ? '这一天' : '今天'}”会把地点保留为未安排，不会自动放到其他日期。</small>}
    </section>}
    <div className="plan-editor">{plan.map((id, index) => {
      const place = places.find(item => item.id === id)
      if (!place) return null
      const isLocked = locked.includes(id)
      const isVisited = visited.includes(id)
      const runtime = statusById.get(id)
      return <article className={`plan-edit-row ${isVisited ? 'visited' : ''} ${runtime?.issue ? 'has-conflict' : ''}`} key={id}>
        <button className={`edit-thumb tone-${place.tone}`} onClick={() => onDetails(id)}><span>{String(index + 1).padStart(2, '0')}</span><CategoryIcon category={place.category}/></button>
        <button className="edit-copy" onClick={() => onDetails(id)}><small>{place.fixed ? `${place.fixed} 预约` : `${place.area} · ${place.category}`}</small><strong>{place.name}</strong><span>{isVisited ? '已完成' : isLocked ? '已锁定，不参与重排' : place.duration}</span>{runtime?.issue && <em className="edit-time-warning"><Clock3/>{runtime.issue.title}</em>}</button>
        <div className="route-edit-actions">
          <div className="route-order-actions" aria-label="调整当天顺序">
            <button aria-label="上移" disabled={isLocked || index === 0} onClick={() => onMove(id, -1)}><ArrowUp/></button>
            <button aria-label="下移" disabled={isLocked || index === plan.length - 1} onClick={() => onMove(id, 1)}><ArrowDown/></button>
          </div>
          <details className="route-edit-more">
            <summary aria-label={`更多操作：${place.name}`}><MoreHorizontal/></summary>
            <div className="route-edit-menu">
              <button aria-pressed={isLocked} className={isLocked ? 'active' : ''} onClick={event => { onToggleLock(id); event.currentTarget.closest('details')?.removeAttribute('open') }}>{isLocked ? <Unlock/> : <Lock/>}{isLocked ? '解除锁定' : '锁定位置'}</button>
              <button className="danger" disabled={isLocked || isVisited} onClick={event => { onRemove(id); event.currentTarget.closest('details')?.removeAttribute('open') }}><X/>从今天移除</button>
            </div>
          </details>
        </div>
      </article>
    })}</div>
    {scheduledElsewhereCount > 0 && <button className="edit-whole-route-entry" onClick={onEditWholeTrip}><CalendarDays/><span><strong>从后续日期移动地点</strong><small>会影响整段行程，进入全程路线后再调整。</small></span><ArrowRight/></button>}
    {available.length > 0 && <section className="add-to-plan"><h3>从行程地点添加</h3>{available.map(place => <button key={place.id} onClick={() => onAdd(place.id)}><span><strong>{place.name}</strong><small>{place.area} · {place.category}</small></span><Plus/></button>)}</section>}
  </div>
}

function PlaceDetailScreen({ place, intent, readOnly = false, previewOnly = false, inPlan, planLabel = '今天路线', onBack, onTogglePlan, onToggleSaved }) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const photoSwipeStart = React.useRef(null)
  const hasRating = Number.isFinite(place.rating)
  const photos = place.photos || []
  const reviews = place.reviews || []
  const hasPhotos = photos.length > 0
  const ratingSource = place.reviewCount > 0 ? `${place.reviewCount.toLocaleString()} 条公开评价` : place.source === 'amap' ? '高德公开评分' : '参考评分'
  const intentText = `${intent?.note || ''} ${(intent?.styles || []).join(' ')} ${intent?.travelConstraint || ''}`
  const fitReasons = [
    place.priority === 'must' ? '这是你明确标记的必去地点' : intent?.styles?.length ? `与你选择的“${intent.styles.slice(0, 2).join('、')}”偏好相符` : '它与同一天地点的区域衔接更顺',
    /少走|长辈|老人/.test(intentText) ? '路线会为步行和换乘留出更大缓冲' : `建议停留 ${place.duration}，已计入当天时间表`,
    Number.isFinite(place.rating) ? `${place.rating} 分公开评分可用于交叉判断` : '暂无公开评分，已明确保留为未知'
  ]
  const movePhoto = direction => setPhotoIndex(index => Math.max(0, Math.min(photos.length - 1, index + direction)))
  const handlePhotoPointerDown = event => {
    if (photos.length < 2 || event.target.closest('button')) return
    photoSwipeStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const handlePhotoPointerUp = event => {
    const start = photoSwipeStart.current
    photoSwipeStart.current = null
    if (!start || start.pointerId !== event.pointerId) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return
    movePhoto(deltaX < 0 ? 1 : -1)
  }
  const checkedAt = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  return <div className="detail-screen enter">
    <section className={`detail-hero ${hasPhotos ? '' : 'no-photo'}`} role={hasPhotos && photos.length > 1 ? 'region' : undefined} aria-label={hasPhotos && photos.length > 1 ? `地点图片 ${photoIndex + 1} / ${photos.length}，左右滑动切换` : undefined} tabIndex={hasPhotos && photos.length > 1 ? 0 : undefined} onPointerDown={handlePhotoPointerDown} onPointerUp={handlePhotoPointerUp} onPointerCancel={() => { photoSwipeStart.current = null }} onKeyDown={event => { if (event.key === 'ArrowLeft') movePhoto(-1); if (event.key === 'ArrowRight') movePhoto(1) }}>
      {hasPhotos ? <img src={photos[photoIndex]} alt={`${place.name} 地点图片`} draggable="false"/> : <div className="detail-photo-empty"><Images/><span>高德暂未提供地点图片</span></div>}
      <div className="detail-overlay"/>
      <header className="detail-head"><button className="icon-btn light" aria-label="返回" onClick={onBack}><ArrowLeft/></button>{!readOnly && !previewOnly && <button className="icon-btn light" aria-label="切换必去" onClick={onToggleSaved}><Heart fill={place.priority === 'must' ? 'currentColor' : 'none'}/></button>}</header>
      {hasPhotos && <div className="detail-photo-meta"><span>{photoIndex + 1} / {photos.length}</span></div>}
    </section>
    <main className="detail-body">
      <div className="eyebrow">{place.area} · {place.category}</div>
      <h1>{place.name}</h1>
      <div className="rating-line">{hasRating ? <><Star fill="currentColor"/><strong>{place.rating}</strong><span>{ratingSource}</span></> : <span>暂无公开评分</span>}<i/><span>{place.closes === '待确认' ? '营业时间待确认' : `营业至 ${place.closes}`}</span></div>
      <p className="place-summary">{place.summary}</p>
      <section className="fit-reason-section"><div className="detail-section-head"><div><Sparkles/><h2>为什么适合你</h2></div><span>路线依据</span></div><ol>{fitReasons.map(reason => <li key={reason}>{reason}</li>)}</ol></section>
      <div className="detail-facts"><div><Clock3/><span><small>建议停留</small><strong>{place.duration}</strong></span></div><div><MapPin/><span><small>所在区域</small><strong>{place.area}</strong></span></div></div>
      {previewOnly ? <div className="plan-toggle preview-only"><Check/>候选路线中的真实地点 · 返回继续规划</div> : readOnly ? <div className="plan-toggle readonly"><Lock/>已完成行程 · 仅查看</div> : <button className={`plan-toggle ${inPlan ? 'in-plan' : ''}`} onClick={onTogglePlan}>{inPlan ? <Check/> : <Plus/>}{inPlan ? `已在${planLabel}中` : `加入${planLabel}`}</button>}
      <section className="review-section"><div className="detail-section-head"><div><MessageCircle/><h2>网友评价</h2></div><span>{hasRating ? `${place.rating} / 5.0` : '暂无'}</span></div>{reviews.length ? reviews.map(review => <article className="review-card" key={review.name}><div><strong>{review.name}</strong><span>{review.tag}</span></div><div className="review-stars">★★★★★</div><p>{review.text}</p></article>) : <div className="review-empty">暂无可展示的真实评价。</div>}</section>
      <section className="source-section" aria-label="信息来源"><h2>信息来源</h2>{place.source === 'amap' && <div><Check/><span><strong>高德地图</strong><small>{`查询于 ${checkedAt} · 名称、地址、坐标${hasRating ? '、公开评分' : ''}${hasPhotos ? '与地点图片' : ''}`}</small></span></div>}<div className="pending"><Clock3/><span><strong>出发前仍需核对</strong><small>营业时间、临时闭馆、票务与实时交通</small></span></div>{place.source === 'amap' && <button className="source-external" onClick={() => window.open(amapPlaceUrl(place), '_blank', 'noopener,noreferrer')}>在高德查看<ExternalLink/></button>}</section>
    </main>
  </div>
}

const mapCenters = {
  XINJIANG: [85.95, 44.35],
  DALI: [100.19, 25.69],
  CHENGDU: [104.07, 30.67],
  TOKYO: [139.7077, 35.6674],
  KYOTO: [135.7681, 35.0116],
  SEOUL: [126.986, 37.5665]
}

function placePosition(place, cityCode) {
  if (Array.isArray(place.position) && place.position.length === 2) return place.position
  const [centerLng, centerLat] = mapCenters[cityCode] || [116.3974, 39.9092]
  return [centerLng + ((place.x || 50) - 50) * 0.001, centerLat - ((place.y || 50) - 50) * 0.00072]
}

function AMapCanvas({ city, cityCode, transportMode, places, routeIds, visited, selectedId, userPosition, onSelect, onStatusChange, onRouteStatusChange }) {
  const containerRef = React.useRef(null)
  const mapRef = React.useRef(null)
  const markersRef = React.useRef(new Map())
  const onSelectRef = React.useRef(onSelect)
  const onStatusChangeRef = React.useRef(onStatusChange)
  const onRouteStatusChangeRef = React.useRef(onRouteStatusChange)
  const [status, setStatus] = useState('loading')

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])
  useEffect(() => { onRouteStatusChangeRef.current = onRouteStatusChange }, [onRouteStatusChange])

  useEffect(() => {
    let key
    try {
      key = configureAMap()
    } catch {
      setStatus('missing')
      onStatusChangeRef.current?.('missing')
      onRouteStatusChangeRef.current?.('fallback')
      return undefined
    }

    let cancelled = false
    let resizeObserver
    setStatus('loading')
    onStatusChangeRef.current?.('loading')

    AMapLoader.load({ key, version: '2.0', plugins: ['AMap.Transfer', 'AMap.Driving'] })
      .then(AMap => {
        if (cancelled || !containerRef.current) return
        const selected = places.find(place => place.id === selectedId) || places[0]
        const map = new AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 12,
          center: selected ? placePosition(selected, cityCode) : mapCenters[cityCode],
          mapStyle: 'amap://styles/normal',
          showOversea: true,
          resizeEnable: true
        })
        mapRef.current = map

        const markerEntries = places.map((place, index) => {
          const isDone = visited.includes(place.id)
          const markerButton = document.createElement('button')
          markerButton.type = 'button'
          markerButton.className = `amap-place-marker${place.priority === 'must' ? ' must' : ''}${isDone ? ' done' : ''}${selectedId === place.id ? ' selected' : ''}`
          markerButton.setAttribute('aria-label', `查看${isDone ? '已去地点' : ''} ${place.name}`)
          markerButton.innerHTML = `<span class="amap-marker-shape"><span>${index + 1}</span></span>${isDone ? '<span class="amap-marker-done" aria-hidden="true">✓</span>' : ''}`
          markerButton.addEventListener('click', event => {
            event.stopPropagation()
            onSelectRef.current(place)
          })
          const marker = new AMap.Marker({
            position: placePosition(place, cityCode),
            content: markerButton,
            anchor: 'bottom-center',
            zIndex: selectedId === place.id ? 120 : 100,
            title: place.name
          })
          marker.setMap(map)
          markersRef.current.set(place.id, { marker, node: markerButton })
          return marker
        })

        let currentMarker = null
        const fitCompleteRoute = () => {
          if (cancelled) return
          const container = containerRef.current
          const screen = container?.closest('.map-screen')
          if (!container || !screen) return
          const bounds = container.getBoundingClientRect()
          const topPanel = screen.querySelector('.map-top-panel')?.getBoundingClientRect()
          const bottomPanel = screen.querySelector('.map-bottom-panel')?.getBoundingClientRect()
          const placeCard = screen.querySelector('.map-place-card, .map-empty-scope')?.getBoundingClientRect()
          if (placeCard) screen.style.setProperty('--map-attribution-bottom', `${bounds.bottom - placeCard.top + 6}px`)
          const topPadding = Math.ceil((topPanel?.bottom ?? bounds.top) - bounds.top + 56)
          const bottomPadding = Math.ceil(bounds.bottom - (bottomPanel?.top ?? bounds.bottom) + 16)
          const routeOverlays = typeof map.getAllOverlays === 'function'
            ? (map.getAllOverlays('polyline') || [])
            : []
          const overlays = [...markerEntries, ...(currentMarker ? [currentMarker] : []), ...routeOverlays]
          // AMap uses top, bottom, left, right (not CSS shorthand order).
          if (overlays.length) map.setFitView(overlays, false, [topPadding, bottomPadding, 32, 32], 14)
        }
        const scheduleRouteFit = () => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(fitCompleteRoute))
        }
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(scheduleRouteFit)
          const screen = containerRef.current.closest('.map-screen')
          const observedPanels = [containerRef.current, screen?.querySelector('.map-top-panel'), screen?.querySelector('.map-bottom-panel')]
          observedPanels.filter(Boolean).forEach(node => resizeObserver.observe(node))
        }

        const spreadOverlappingMarkers = () => {
          if (cancelled) return
          const entries = places.map(place => {
            const pixel = map.lngLatToContainer(new AMap.LngLat(...placePosition(place, cityCode)))
            return { id: place.id, x: pixel?.x ?? pixel?.getX?.(), y: pixel?.y ?? pixel?.getY?.() }
          }).filter(item => Number.isFinite(item.x) && Number.isFinite(item.y))
          markersRef.current.forEach(({ node }) => { node.style.transform = '' })
          const clusters = []
          entries.forEach(entry => {
            const cluster = clusters.find(items => items.some(item => Math.abs(item.x - entry.x) < 48 && Math.abs(item.y - entry.y) < 48))
            if (cluster) cluster.push(entry)
            else clusters.push([entry])
          })
          clusters.filter(items => items.length > 1).forEach(items => {
            const mapWidth = containerRef.current?.clientWidth || 390
            const markerMargin = 30
            const arranged = items.sort((a, b) => a.x - b.x || a.y - b.y).map((item, index) => ({
              ...item,
              offsetX: (index - (items.length - 1) / 2) * 48
            }))
            const leftEdge = Math.min(...arranged.map(item => item.x + item.offsetX))
            const rightEdge = Math.max(...arranged.map(item => item.x + item.offsetX))
            const groupShift = leftEdge < markerMargin
              ? markerMargin - leftEdge
              : rightEdge > mapWidth - markerMargin
                ? mapWidth - markerMargin - rightEdge
                : 0
            arranged.forEach(item => {
              const markerNode = markersRef.current.get(item.id)?.node
              if (markerNode) markerNode.style.transform = `translateX(${item.offsetX + groupShift}px)`
            })
          })
        }
        map.on('complete', spreadOverlappingMarkers)
        map.on('moveend', spreadOverlappingMarkers)
        map.on('zoomend', spreadOverlappingMarkers)

        const pendingRoutePlaces = (routeIds || []).map(id => places.find(place => place.id === id)).filter(place => place && !visited.includes(place.id))
        const routePlaces = Array.isArray(userPosition) && pendingRoutePlaces.length
          ? [{ id: 'current-position', name: '当前位置', position: userPosition }, ...pendingRoutePlaces]
          : pendingRoutePlaces
        if (routePlaces.length > 1) {
          let pendingLegs = routePlaces.length - 1
          let hasFallbackLeg = false
          onRouteStatusChangeRef.current?.('loading')
          const drawFallbackLeg = (origin, destination) => map.add(new AMap.Polyline({
            path: [placePosition(origin, cityCode), placePosition(destination, cityCode)],
            strokeColor: '#f26835', strokeOpacity: 0.55, strokeWeight: 3, strokeStyle: 'dashed', showDir: true, zIndex: 60
          }))
          const routePathsFromResult = (isDriving, result) => {
            // WALK, BUS and SUBWAY segments each contain their own transit.path.
            // Preserve separate paths so an unknown segment is never bridged
            // by a solid line between two known segments.
            const parts = isDriving ? result?.routes?.[0]?.steps : result?.plans?.[0]?.segments
            return (parts || []).map(part => isDriving ? part.path : part.transit?.path)
          }
          routePlaces.slice(1).forEach((destination, index) => {
            const origin = routePlaces[index]
            const isDriving = transportMode === 'drive'
            // Draw results only after the lifetime check below. Giving the
            // service a map lets late responses render into a destroyed map.
            const planner = isDriving
              ? new AMap.Driving({ policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0, showTraffic: false })
              : new AMap.Transfer({ city: city === '新疆' ? '650000' : city, policy: AMap.TransferPolicy?.LEAST_TIME ?? 0, nightflag: true, extensions: 'all' })
            planner.search(new AMap.LngLat(...placePosition(origin, cityCode)), new AMap.LngLat(...placePosition(destination, cityCode)), (routeStatus, routeResult) => {
              if (cancelled) return
              if (routeStatus !== 'complete') {
                hasFallbackLeg = true
                drawFallbackLeg(origin, destination)
              } else {
                const routePaths = routePathsFromResult(isDriving, routeResult)
                const knownPaths = routePaths.filter(path => Array.isArray(path) && path.length > 1)
                if (knownPaths.length) {
                  knownPaths.forEach(path => map.add(new AMap.Polyline({
                    path,
                    strokeColor: '#1683e8',
                    strokeOpacity: 0.94,
                    strokeWeight: 5,
                    strokeStyle: 'solid',
                    lineJoin: 'round',
                    lineCap: 'round',
                    showDir: true,
                    zIndex: 72
                  })))
                  if (knownPaths.length !== routePaths.length) hasFallbackLeg = true
                } else {
                  hasFallbackLeg = true
                  drawFallbackLeg(origin, destination)
                }
              }
              pendingLegs -= 1
              if (pendingLegs === 0) {
                onRouteStatusChangeRef.current?.(hasFallbackLeg ? 'partial' : 'ready')
                scheduleRouteFit()
              }
            })
          })
        } else onRouteStatusChangeRef.current?.('none')

        if (Array.isArray(userPosition)) {
          AMap.convertFrom(userPosition, 'gps', (convertStatus, result) => {
            if (cancelled || convertStatus !== 'complete' || !result.locations?.[0]) return
            currentMarker = new AMap.Marker({
              position: result.locations[0],
              content: '<span class="amap-current-position"><span></span></span>',
              anchor: 'center',
              zIndex: 130,
              title: '当前位置'
            })
            currentMarker.setMap(map)
            scheduleRouteFit()
          })
        } else if (markerEntries.length > 1) scheduleRouteFit()
        window.requestAnimationFrame(() => window.requestAnimationFrame(spreadOverlappingMarkers))
        setStatus('ready')
        onStatusChangeRef.current?.('ready')
      })
      .catch(error => {
        console.error('高德地图加载失败', error)
        if (!cancelled) {
          setStatus('error')
          onStatusChangeRef.current?.('error')
          onRouteStatusChangeRef.current?.('fallback')
        }
      })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      markersRef.current.clear()
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [city, cityCode, transportMode, places, routeIds, visited, userPosition?.join(',')])

  useEffect(() => {
    markersRef.current.forEach(({ marker, node }, id) => {
      const active = id === selectedId
      node.classList.toggle('selected', active)
      marker.setzIndex(active ? 120 : 100)
    })
  }, [selectedId])

  return <>
    <div ref={containerRef} className={`amap-host ${status}`} aria-label="高德地图" />
    {status === 'loading' && <div className="map-load-state">地图加载中</div>}
    {status === 'missing' && <div className="map-load-state">地图暂不可用</div>}
    {status === 'error' && <div className="map-load-state error">地图暂不可用，已显示地点位置</div>}
  </>
}

function MapScreen({ trip, cityCode, places, plan, visited, dayLabel = '今天', userPosition, readOnly = false, onLocate, onAdd, onDetails }) {
  const [scope, setScope] = useState('today')
  const [selectedId, setSelectedId] = useState(null)
  const routeIds = useMemo(() => {
    const ids = scope === 'today' ? plan : (trip.dailyPlans || []).flat()
    return [...new Set(ids)]
  }, [scope, plan, trip.dailyPlans])
  const scopedPlaces = useMemo(() => {
    if (!routeIds.length) return scope === 'full' ? places : []
    const placeMap = new Map(places.map(place => [place.id, place]))
    return routeIds.map(id => placeMap.get(id)).filter(Boolean)
  }, [scope, places, routeIds])
  const selected = scopedPlaces.find(place => place.id === selectedId) || scopedPlaces[0] || null
  const transportMode = tripTransportMode(trip)
  useEffect(() => { setSelectedId(null) }, [cityCode, scope])
  const usesDomesticMap = !['TOKYO', 'KYOTO', 'SEOUL'].includes(cityCode)
  const [amapStatus, setAmapStatus] = useState(usesDomesticMap ? 'loading' : 'fallback')
  const [routeStatus, setRouteStatus] = useState('loading')
  useEffect(() => { setAmapStatus(usesDomesticMap ? 'loading' : 'fallback') }, [cityCode, usesDomesticMap])
  useEffect(() => { setRouteStatus(routeIds.length > 1 ? 'loading' : 'none') }, [cityCode, scope, routeIds.join('|')])
  const fallbackActive = !usesDomesticMap || amapStatus !== 'ready'
  const routeSummary = routeStatus === 'loading' ? '正在生成路线'
    : routeStatus === 'ready' ? `高德路线 · ${userPosition ? '当前位置 → ' : ''}${scopedPlaces.filter(place => !visited.includes(place.id)).map(place => place.name).join(' → ')}`
      : routeStatus === 'partial' ? '部分路段暂未取得导航路线，虚线只表示地点顺序'
        : '选择两个以上地点后显示路线'
  const districts = { XINJIANG: ['URUMQI', 'ALTAY', 'ILI'], DALI: ['CANGSHAN', 'ERHAI', 'XIZHOU'], CHENGDU: ['QINGYANG', 'JINJIANG', 'CHENGHUA'], TOKYO: ['HARAJUKU', 'SHIBUYA', 'AOYAMA'], KYOTO: ['ARASHIYAMA', 'NAKAGYO', 'HIGASHIYAMA'], SEOUL: ['JONGNO', 'SEONGSU', 'JUNG-GU'] }[cityCode] || [cityCode, 'CITY CENTER', 'OLD TOWN']
  return <div className="map-screen enter">
    <div className="map-top-panel">
      <header className="floating-map-head"><div><h1>{trip.city}行程地图</h1><span className="eyebrow">{scope === 'today' ? `${dayLabel}路线` : '全程路线'} · {scopedPlaces.length} 个地点</span></div>{readOnly ? <span className="map-readonly-label"><Lock/>只读</span> : <button className="round-add" aria-label="添加地点" onClick={onAdd}><Plus/></button>}</header>
      <div className="map-scope" aria-label="地图范围"><button className={scope === 'today' ? 'active' : ''} onClick={() => setScope('today')}>{dayLabel}</button><button className={scope === 'full' ? 'active' : ''} onClick={() => setScope('full')}>全程</button><button className={userPosition ? 'located' : ''} onClick={onLocate} aria-label="定位当前位置"><LocateFixed/></button></div>
      <div className={`map-route-state ${routeStatus}`} role="status"><Navigation/><span title={routeSummary}>{routeSummary}</span></div>
    </div>
    <div className="map-canvas">
      <div className="map-fallback" aria-hidden={!fallbackActive} inert={!fallbackActive}><div className="map-roads road-a"/><div className="map-roads road-b"/><div className="map-roads road-c"/><div className="map-water"/><span className="district d1">{districts[0]}</span><span className="district d2">{districts[1]}</span><span className="district d3">{districts[2]}</span>{scopedPlaces.map((place, index) => {
        const isDone = visited.includes(place.id)
        return <button key={place.id} aria-label={`查看${isDone ? '已去地点' : ''} ${place.name}`} onClick={() => setSelectedId(place.id)} className={`map-pin ${selected?.id === place.id ? 'selected' : ''} ${place.priority === 'must' ? 'must' : ''} ${isDone ? 'done' : ''}`} style={{ left: `${place.x}%`, top: `${place.y}%` }}><span className="map-pin-shape"><span>{index + 1}</span></span>{isDone && <span className="map-pin-done" aria-hidden="true"><Check/></span>}</button>
      })}<span className="current-dot"><span/></span></div>
      {usesDomesticMap
        ? <AMapCanvas city={trip.city} cityCode={cityCode} transportMode={transportMode} places={scopedPlaces} routeIds={routeIds} visited={visited} selectedId={selected?.id} userPosition={userPosition} onSelect={place => setSelectedId(place.id)} onStatusChange={setAmapStatus} onRouteStatusChange={setRouteStatus}/>
        : <div className="map-load-state">该目的地暂不支持路线地图</div>}
    </div>
    <div className="map-bottom-panel">
      <div className="map-legend"><span><i className="must"/>必去</span><span><i/>想去</span><span><i className="done"/>已去</span></div>
      {selected ? <div className="map-place-card"><button aria-label={`查看 ${selected.name}`} className={`mini-art tone-${selected.tone}`} onClick={() => onDetails(selected.id)}><MapPin/></button><button className="map-card-copy" onClick={() => onDetails(selected.id)}><small>{selected.category} · {placeOpenLabel(selected)}</small><strong>{selected.name}</strong></button><button aria-label={`查看 ${selected.name}`} onClick={() => onDetails(selected.id)}><ArrowRight size={18}/></button></div> : <div className="map-empty-scope">{scope === 'today' ? `${dayLabel}还没有安排地点` : '全程还没有安排地点'}</div>}
    </div>
  </div>
}

function TripPlacesEmpty({ trip, kind, onAdd }) {
  return <div className="screen trip-empty-screen enter"><header className="topbar"><div><div className="eyebrow">{trip.cityCode} · {kind.toUpperCase()}</div><h1>{trip.city}{kind}</h1></div><button className="round-add" aria-label="添加地点" onClick={onAdd}><Plus/></button></header><section><MapIcon/><div className="eyebrow">BUILD YOUR TRIP MAP</div><h2>这段旅行还没有地点。</h2><p>先加入想去的地方，就能查看每天的路线。</p><button className="form-next" onClick={onAdd}>添加第一个地点</button></section></div>
}

function CategoryIcon({ category }) {
  const Icon = ['餐厅', '美食'].includes(category) ? UtensilsCrossed : category === '咖啡' ? Coffee : category === '购物' ? ShoppingBag : category === '艺术' ? Sparkles : category === '住宿' ? Home : MapPin
  return <Icon/>
}

function AddPlaceScreen({ title = '添加地点', search, setSearch, city, places, catalog, addedIds, onBack, onAdd, onDetails }) {
  const { query, results: remoteResults, status: searchStatus, error: searchError } = useAmapPlaceSearch(search, city)
  const localPool = useMemo(() => {
    const seen = new Set()
    return [...catalog, ...places.filter(place => place.source === 'amap')].filter(place => {
      if (seen.has(place.id)) return false
      seen.add(place.id)
      return true
    })
  }, [catalog, places])
  const localResults = localPool.filter(place => !query || (place.name + place.sub + place.category + place.area).toLowerCase().includes(query.toLowerCase()))

  const remoteUnique = remoteResults.filter(remote => !localResults.some(local => local.id === remote.id || (local.name === remote.name && local.area === remote.area)))
  const results = query ? [...localResults, ...remoteUnique] : catalog
  const resultCount = searchStatus === 'loading' ? '正在搜索' : `${results.length} 个地点`
  return <div className="screen add-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>{title}</span><i/></header>
    <div className="search-hero"><div className="eyebrow">FIND A REAL PLACE</div><h1>想去哪里？</h1><div className="searchbox"><Search/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={`搜索${city}的名称、类型或区域`}/>{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X/></button>}</div></div>
    <div className="search-results"><div className="result-title"><span>{search ? '搜索结果' : '你可能会喜欢'}</span><small>{resultCount}</small></div>
      {searchStatus === 'loading' && <div className="search-feedback loading" aria-live="polite"><span className="search-loader"/>正在高德地图中查找“{query}”</div>}
      {searchStatus === 'short' && <div className="search-feedback">再输入一个字，开始搜索真实地点。</div>}
      {searchStatus === 'error' && <div className="search-feedback error">{searchError}</div>}
      {searchStatus === 'complete' && results.length === 0 && <div className="search-empty"><MapPin/><strong>没有找到匹配地点</strong><span>试试地点全名，或加上城市、区县。</span></div>}
      {results.map(place => {
        const added = addedIds ? addedIds.some(id => String(id) === String(place.id)) : places.some(item => item.id === place.id || (place.amapId && item.amapId === place.amapId))
        return <div className={`search-row ${place.source === 'amap' ? 'live-result' : ''}`} key={place.id}><button aria-label={`查看 ${place.name}`} className={`search-thumb tone-${place.tone}`} onClick={() => onDetails(place)}><CategoryIcon category={place.category}/></button><button className="search-copy" onClick={() => onDetails(place)}><strong>{place.name}</strong><small>{place.source === 'amap' ? `高德地图 · ${place.area}` : `${place.sub} · ${place.rating} 分`}</small></button><button aria-label={added ? `已加入 ${place.name}` : `加入行程 ${place.name}`} onClick={() => onAdd(place)} disabled={added}>{added ? <Check/> : <Plus/>}</button></div>
      })}
    </div>
  </div>
}

function TripRouteEditorScreen({ trip, places, onBack, onMoveDay, onMoveOrder, onRemove, onToggleMust, onAddDay, onReplan, onStartTimeChange, canUndo, undoLabel, onUndo, versions = [], onRestoreVersion }) {
  const [replanConfirmOpen, setReplanConfirmOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState(null)
  const placeMap = new Map(places.map(place => [place.id, place]))
  const movePreview = useMemo(() => {
    if (!pendingMove) return null
    const sourceDay = trip.dailyPlans.findIndex(day => day.includes(pendingMove.placeId))
    const targetDay = sourceDay + pendingMove.offset
    const place = placeMap.get(pendingMove.placeId)
    if (!place || sourceDay < 0 || targetDay < 0 || targetDay >= trip.dailyPlans.length) return null
    const targetIds = [...trip.dailyPlans[targetDay].filter(id => id !== place.id), place.id]
    const targetPlaces = targetIds.map(id => placeMap.get(id)).filter(Boolean)
    const schedule = buildSuggestedDaySchedule(targetPlaces, { startTime: tripDayStartTime(trip, pendingMove.targetDay), transport: tripTransportMode(trip) })
    const conflicts = schedule.filter(item => item.warning).map(item => ({ place: placeMap.get(item.placeId), warning: item.warning }))
    const sourceDate = tripDateAtOffset(trip.startDate, sourceDay)
    const targetDate = tripDateAtOffset(trip.startDate, targetDay)
    return {
      place, sourceDay, targetDay, conflicts,
      sourceStay: stayForTripDate(trip.stays || [], sourceDate),
      targetStay: stayForTripDate(trip.stays || [], targetDate)
    }
  }, [pendingMove, trip.dailyPlans, trip.dayStartTime, trip.startDate, trip.stays, places])
  return <div className="screen full-route-editor enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>编辑整段路线</span><button className="text-btn" onClick={onBack}>完成</button></header>
    <section className="route-editor-intro"><h1>调整路线</h1><p>上下调整当天顺序；跨天、必去和删除在“更多”里。</p>{canUndo && <button className="route-editor-undo" onClick={onUndo}><Undo2/>撤销{undoLabel ? `：${undoLabel}` : '上一步'}</button>}</section>
    <label className="route-editor-start"><span><Clock3/><strong>每天建议开始</strong></span><input type="time" value={trip.dayStartTime || '09:30'} onChange={event => onStartTimeChange(event.target.value)}/></label>
    <div className="full-route-days">{trip.dailyPlans.map((day, dayIndex) => <section key={dayIndex}><header><strong>第 {dayIndex + 1} 天</strong><span>{day.length} 个地点</span></header>{day.length ? day.map((id, placeIndex) => { const place = placeMap.get(id); if (!place) return null; return <article key={id}><span className="route-edit-number">{placeIndex + 1}</span><div><strong>{place.name}</strong><small>{place.area} · {place.category}</small></div><div className="route-edit-actions"><div className="route-order-actions" aria-label="调整当天顺序"><button aria-label="上移" disabled={placeIndex === 0} onClick={() => onMoveOrder(id, -1)}><ArrowUp/></button><button aria-label="下移" disabled={placeIndex === day.length - 1} onClick={() => onMoveOrder(id, 1)}><ArrowDown/></button></div><details className="route-edit-more"><summary aria-label={`更多操作：${place.name}`}><MoreHorizontal/></summary><div className="route-edit-menu"><button disabled={dayIndex === 0} onClick={event => { setPendingMove({ placeId: id, offset: -1 }); event.currentTarget.closest('details')?.removeAttribute('open') }}><ArrowLeft/>移到前一天</button><button disabled={dayIndex === trip.dailyPlans.length - 1} onClick={event => { setPendingMove({ placeId: id, offset: 1 }); event.currentTarget.closest('details')?.removeAttribute('open') }}><ArrowRight/>移到后一天</button><button aria-pressed={place.priority === 'must'} className={place.priority === 'must' ? 'active' : ''} onClick={event => { onToggleMust(id); event.currentTarget.closest('details')?.removeAttribute('open') }}><Heart fill={place.priority === 'must' ? 'currentColor' : 'none'}/>{place.priority === 'must' ? '取消必去' : '设为必去'}</button><button className="danger" onClick={event => { onRemove(id); event.currentTarget.closest('details')?.removeAttribute('open') }}><X/>从路线移除</button></div></details></div></article> }) : <p>这一天暂不安排。</p>}<button className="route-day-add" aria-label={`添加地点到第 ${dayIndex + 1} 天`} onClick={() => onAddDay(dayIndex)}><Plus/>添加地点</button></section>)}</div>
    {movePreview && <section className="cross-day-confirm" role="alertdialog" aria-label="确认跨天移动">
      <header><CalendarDays/><span><small>跨天调整预览</small><strong>{movePreview.place.name}：第 {movePreview.sourceDay + 1} 天 → 第 {movePreview.targetDay + 1} 天</strong></span><button aria-label="关闭" onClick={() => setPendingMove(null)}><X/></button></header>
      <ul><li>目标日将重新计算顺序、交通和闭馆时间。</li><li>{movePreview.targetStay ? `目标日住宿仍保留为「${movePreview.targetStay.name}」，但需重新核对通勤。` : '目标日尚未设置住宿，移动后需补充。'}</li>{movePreview.place.fixed && <li>{movePreview.place.fixed} 预约会恢复为待确认。</li>}</ul>
      {movePreview.conflicts.length > 0 && <div className="cross-day-conflict"><AlertTriangle/><span><strong>目标日暂时放不下</strong><small>{movePreview.conflicts.map(item => `${item.place?.name || '地点'}：${item.warning}`).join('；')}</small></span></div>}
      <div><button onClick={() => setPendingMove(null)}>取消</button>{movePreview.conflicts.length ? <button className="primary" onClick={() => { setPendingMove(null); setReplanConfirmOpen(true) }}>改用整段重排</button> : <button className="primary" onClick={() => { onMoveDay(movePreview.place.id, movePreview.targetDay - movePreview.sourceDay); setPendingMove(null) }}>确认移动</button>}</div>
    </section>}
    {versions.length > 0 && <details className="route-version-history"><summary><span><GitCompareArrows/>最近变更</span><small>{versions.length} 个可恢复版本</small><ChevronDown/></summary><div>{versions.slice(0, 5).map(version => <article key={version.id}><span><strong>{version.label}</strong><small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(version.at))}</small><em>{describePlanDiff(version.dailyPlans, trip.dailyPlans, placeMap)}</em></span><button onClick={() => onRestoreVersion(version)}>恢复</button></article>)}</div></details>}
    {replanConfirmOpen && <section className="route-replan-confirm" role="alertdialog" aria-label="进入整段行程调整"><Sparkles/><div><strong>要调整整段行程吗？</strong><p>先和 AI 说明需求，再预览每天路线、住宿和预约影响；确认前不会修改。</p><div><button className="primary" onClick={() => { setReplanConfirmOpen(false); onReplan() }}>进入调整</button><button onClick={() => setReplanConfirmOpen(false)}>取消</button></div></div></section>}
    <button className="replan-route-button editor-replan" onClick={() => setReplanConfirmOpen(true)}><Sparkles/>预览并调整整段路线</button>
  </div>
}

function stayAreaRecommendations(trip, placeMap) {
  const routeDays = trip.dailyPlans || []
  const nights = routeDays.slice(0, -1).map((day, nightIndex) => {
    const lastPlace = [...day].reverse().map(id => placeMap.get(id)).find(Boolean)
    const nextPlace = (routeDays[nightIndex + 1] || []).map(id => placeMap.get(id)).find(Boolean)
    const anchor = lastPlace || nextPlace
    if (!anchor?.area) return null
    const sameArea = lastPlace?.area && lastPlace.area === nextPlace?.area
    return {
      nightIndex,
      area: anchor.area,
      anchorName: anchor.name,
      position: anchor.position,
      endAnchor: lastPlace ? { name: lastPlace.name, position: lastPlace.position } : null,
      nextAnchor: nextPlace ? { name: nextPlace.name, position: nextPlace.position } : null,
      anchors: [lastPlace ? { name: lastPlace.name, position: lastPlace.position } : null, nextPlace ? { name: nextPlace.name, position: nextPlace.position } : null].filter(item => item?.position),
      reason: sameArea ? `兼顾${lastPlace.name}和次日${nextPlace.name}` : lastPlace && nextPlace ? `同时比较当晚${lastPlace.name}与次日${nextPlace.name}的通勤` : lastPlace ? `靠近第 ${nightIndex + 1} 天最后一站` : `靠近第 ${nightIndex + 2} 天第一站`
    }
  }).filter(Boolean)
  const groups = []
  nights.forEach(night => {
    const previous = groups.at(-1)
    if (previous && previous.area === night.area && previous.endNight + 1 === night.nightIndex) {
      previous.endNight = night.nightIndex
      previous.anchors.push(...night.anchors)
      previous.endAnchor = night.endAnchor || previous.endAnchor
      previous.nextAnchor = night.nextAnchor || previous.nextAnchor
      return
    }
    groups.push({ area: night.area, anchorName: night.anchorName, position: night.position, endAnchor: night.endAnchor, nextAnchor: night.nextAnchor, anchors: [...night.anchors], startNight: night.nightIndex, endNight: night.nightIndex, reason: night.reason })
  })
  return groups.map(group => ({
    ...group,
    id: `${group.area}-${group.startNight}`,
    label: group.startNight === group.endNight ? `第 ${group.startNight + 1} 晚` : `第 ${group.startNight + 1}–${group.endNight + 1} 晚`,
    checkIn: tripDateAtOffset(trip.startDate, group.startNight),
    checkOut: tripDateAtOffset(trip.startDate, group.endNight + 1)
  }))
}

function SelectHotelScreen({ trip, places, stays, onBack, onSelect, onUpdate, onRemove }) {
  const placeMap = new Map(places.map(place => [place.id, place]))
  const recommendations = stayAreaRecommendations(trip, placeMap)
  const [activeRecommendationId, setActiveRecommendationId] = useState(recommendations[0]?.id || '')
  const activeRecommendation = recommendations.find(item => item.id === activeRecommendationId) || recommendations[0] || null
  const [search, setSearch] = useState(activeRecommendation ? `${activeRecommendation.area} 酒店` : '')
  const { query, results, status, error } = useAmapPlaceSearch(search, trip.city, '住宿服务')
  const hotelRouteScore = place => {
    const distances = (activeRecommendation?.anchors || []).map(anchor => placeDistance(anchor, place)).filter(Number.isFinite)
    if (!distances.length) return Number.POSITIVE_INFINITY
    return distances.reduce((sum, value) => sum + value, 0) + Math.max(...distances) * 0.35
  }
  const rankedResults = useMemo(() => [...results].sort((a, b) => {
    const aDistance = hotelRouteScore(a)
    const bDistance = hotelRouteScore(b)
    if (Number.isFinite(aDistance) && Number.isFinite(bDistance) && aDistance !== bDistance) return aDistance - bDistance
    return (Number(b.rating) || 0) - (Number(a.rating) || 0)
  }), [results, activeRecommendation?.id])
  const hotelResultsPanel = <div className="hotel-inline-results">
    <div className="hotel-search-title"><h2>{activeRecommendation ? `${activeRecommendation.label} · ${activeRecommendation.area}酒店` : '搜索真实酒店'}</h2><p>{activeRecommendation ? '排序同时考虑当晚末站和次日首站；房价与房态待预订平台确认。' : '从高德地图搜索真实酒店或民宿。'}</p></div>
    <div className="searchbox"><Search/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`搜索${trip.city}的酒店或民宿`}/>{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X/></button>}</div>
    {status === 'loading' && <div className="search-feedback loading"><span className="search-loader"/>正在高德地图中查找“{query}”</div>}
    {status === 'short' && <div className="search-feedback">再输入一个字开始搜索。</div>}
    {status === 'error' && <div className="search-feedback error">{error}</div>}
    {status === 'complete' && results.length === 0 && <div className="search-feedback">没有找到匹配住宿，试试完整名称或所在区县。</div>}
    {rankedResults.length > 0 && <div className="hotel-search-results">{rankedResults.map(place => {
      const distances = (activeRecommendation?.anchors || []).map(anchor => placeDistance(anchor, place)).filter(Number.isFinite)
      const totalDistance = distances.reduce((sum, value) => sum + value, 0)
      const routeLabel = distances.length ? `直线距离参考：两端合计 ${totalDistance < 1 ? `${Math.max(100, Math.round(totalDistance * 10) * 100)} 米` : `${totalDistance.toFixed(1)} 公里`}` : '路线距离待确认'
      const ratingLabel = Number.isFinite(place.rating) ? `${place.rating} 分` : '评分待确认'
      return <button key={place.id} onClick={() => onSelect(place, activeRecommendation ? { checkIn: activeRecommendation.checkIn, checkOut: activeRecommendation.checkOut } : {})}><span className={`search-thumb tone-${place.tone}`}><Home/></span><span><strong>{place.name}</strong><small>{place.area} · {ratingLabel}</small><em>{routeLabel}</em></span><Plus/></button>
    })}</div>}
  </div>
  return <div className="screen hotel-picker-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>住宿推荐</span><button className="text-btn" onClick={onBack}>完成</button></header>
    <section className="hotel-picker-intro"><div className="eyebrow">STAY PLAN</div><h1>住得顺路，<br/>少一点折返。</h1><p>先按每天的结束地点和次日起点推荐住宿区域，再从高德真实酒店中选择。</p></section>
    {stays.length > 0 && <section className="stay-schedule"><header><h2>已选住宿</h2><span>{stays.length} 处</span></header>{stays.map(stay => {
      const coveredAreas = [...new Set((trip.dailyPlans || []).flatMap((day, dayIndex) => {
        const date = tripDateAtOffset(trip.startDate, dayIndex)
        const covered = (!stay.checkIn || stay.checkIn <= date) && (!stay.checkOut || date < stay.checkOut)
        return covered ? day.map(id => placeMap.get(id)?.area).filter(Boolean) : []
      }))]
      return <article key={stay.id}><div className="stay-title"><Home/><span><strong>{stay.name}</strong><small>{stay.area}</small></span><button aria-label={`移除 ${stay.name}`} onClick={() => onRemove(stay.id)}><X/></button></div><div className="stay-dates"><label>入住<input type="date" min={trip.startDate} max={trip.endDate} value={stay.checkIn || ''} onChange={event => onUpdate(stay.id, { checkIn: event.target.value })}/></label><label>退房<input type="date" min={stay.checkIn || trip.startDate} max={trip.endDate} value={stay.checkOut || ''} onChange={event => onUpdate(stay.id, { checkOut: event.target.value })}/></label></div>{coveredAreas.length >= 3 && <div className="stay-route-warning" role="status"><AlertTriangle/><span><strong>这段住宿覆盖 {coveredAreas.length} 个路线区域</strong><small>{coveredAreas.slice(0, 4).join('、')}{coveredAreas.length > 4 ? '等' : ''}，建议按移动路线拆成多段住宿。</small></span></div>}</article>
    })}</section>}
    {recommendations.length > 0 ? <section className="hotel-route-recommendations"><header><h2>按路线推荐</h2><span>{recommendations.length} 段住宿</span></header><div>{recommendations.map(item => {
      const active = item.id === activeRecommendation?.id
      return <div className={`hotel-route-group ${active ? 'active' : ''}`} key={item.id}><button type="button" aria-expanded={active} onClick={() => { setActiveRecommendationId(item.id); setSearch(`${item.area} 酒店`) }}><MapPin/><span><strong>{item.label} · 住在{item.area}</strong><small>{item.reason}</small></span><ChevronDown/></button>{active && hotelResultsPanel}</div>
    })}</div></section> : hotelResultsPanel}
  </div>
}

function OverviewLifeNote({ dayPlaces }) {
  const hasFood = dayPlaces.some(place => ['餐厅', '美食', '咖啡'].includes(place.category))
  if (hasFood) return null
  return <div className="overview-life-note"><UtensilsCrossed/><span><strong>途中用餐与休息</strong><small>在当天路线附近灵活安排，具体地点可从高德附近搜索。</small></span></div>
}

function OverviewTransitLeg({ origin, destination, city, enabled }) {
  const transit = useAmapTransitRoute(origin?.position, destination?.position, city, enabled && Boolean(origin))
  if (!enabled) return null
  if (!origin) return <span className="overview-transit-leg missing"><TrainFront/><span><strong>首段公交待计算</strong><small>设置住宿或定位后显示线路</small></span></span>
  if (transit.status === 'loading') return <span className="overview-transit-leg loading"><span className="search-loader"/><span><strong>正在查找公交方案</strong><small>{origin.name} → {destination.name}</small></span></span>
  if (transit.status !== 'complete') return <span className="overview-transit-leg missing"><TrainFront/><span><strong>{origin.name} → {destination.name}</strong><small>暂未获取线路，出发时由高德确认</small></span></span>
  const route = transit.route
  return <span className="overview-transit-leg"><TrainFront/><span><strong>公共交通约 {formatTravelTime(route.minutes)}{route.cost !== null ? ` · ¥${route.cost}` : ''}</strong><small>{route.steps.slice(0, 4).join(' → ')}</small>{route.walkMeters > 0 && <em>全程步行约 {route.walkMeters} 米 · 高德公交方案</em>}</span></span>
}

function BookingScreen({ trip, places, tasks, onBack, onUpdate, onHotel }) {
  const confirmed = tasks.filter(task => task.status === 'confirmed').length
  function openReference(task) {
    if (task.kind === 'stay') return onHotel()
    if (task.placeId && places.get(task.placeId)) return window.open(amapPlaceUrl(places.get(task.placeId)), '_blank', 'noopener,noreferrer')
    if (task.kind === 'transport') return window.open('https://www.12306.cn/index/', '_blank', 'noopener,noreferrer')
    return undefined
  }
  return <div className="screen booking-screen enter">
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>出发准备</span><small>{confirmed} / {tasks.length}</small></header>
    <section className="booking-intro"><div className="eyebrow">BOOKING READINESS</div><h1>该订的订，<br/>不知道的说清楚。</h1><p>这里管理车票、住宿与地点预约。价格、余票和临时规则请在预订前确认。</p><div><span style={{ width: `${tasks.length ? confirmed / tasks.length * 100 : 0}%` }}/></div></section>
    <div className="booking-task-list">{tasks.map(task => {
      const Icon = task.kind === 'transport' ? TrainFront : task.kind === 'stay' ? Home : TicketCheck
      const done = task.status === 'confirmed'
      const skipped = task.status === 'not_needed'
      const timingLabel = bookingTimingLabel(task, trip)
      return <article key={task.id} className={`${done ? 'confirmed' : ''} ${skipped ? 'skipped' : ''}`}>
        <button className="booking-check" aria-label={done ? `将 ${task.title} 标为待确认` : `将 ${task.title} 标为已确认`} aria-pressed={done} onClick={() => onUpdate(task.id, done ? 'todo' : 'confirmed')}><span>{done && <Check/>}</span></button>
        <div className="booking-task-copy"><small><Icon/>{task.kind === 'transport' ? '城际交通' : task.kind === 'stay' ? '住宿' : '地点预约'}</small><strong>{task.title}</strong><p>{task.detail}</p><em className={task.needsReview ? 'needs-review' : ''}><Clock3/>{timingLabel}</em></div>
        <div className="booking-task-actions"><button onClick={() => openReference(task)}>{task.kind === 'stay' ? '查看住宿推荐' : '核对来源'}{task.kind === 'stay' ? <ArrowRight/> : <ExternalLink/>}</button><button className="skip" onClick={() => onUpdate(task.id, skipped ? 'todo' : 'not_needed')}>{skipped ? '恢复待办' : '无需预订'}</button></div>
      </article>
    })}</div>
    {!tasks.length && <div className="booking-empty"><ShieldCheck/><strong>暂未发现必须预订的项目</strong><span>仍建议在出发前核对营业、交通和临时闭馆。</span></div>}
  </div>
}

function TripOverviewScreen({ journeyView = false, trip, places, visited, packingChecked, onTogglePacking, onBack, onSelectHotel, onMap, onEditRoute, onDetails, onStartNow, onStartEarly, onSwitch, bookingTasks = [], onBookings, routeVersions = [], onRestoreVersion }) {
  const [showAllDays, setShowAllDays] = useState(journeyView)
  const [showEarlyDeparture, setShowEarlyDeparture] = useState(false)
  const placeMap = new Map(places.map(place => [place.id, place]))
  const dailyPlans = trip.dailyPlans || []
  const routeDays = dailyPlans.map((day, dayIndex) => {
    const date = tripDateAtOffset(trip.startDate, dayIndex)
    return {
      dayIndex,
      date,
      places: day.map(id => placeMap.get(id)).filter(Boolean),
      stay: stayForTripDate(trip.stays, date)
    }
  })
  const hasRoute = routeDays.some(day => day.places.length)
  const appointmentCount = places.filter(place => place.fixed).length
  const pendingBookingTasks = bookingTasks.filter(task => !['confirmed', 'not_needed'].includes(task.status))
  const packingItems = packingItemsForTrip(trip)
  const visibleDays = showAllDays ? routeDays : routeDays.slice(0, 3)
  const readOnly = trip.status === '已完成'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = trip.startDate ? new Date(`${trip.startDate}T00:00:00`) : null
  const end = trip.endDate ? new Date(`${trip.endDate}T23:59:59`) : null
  const daysUntilStart = start && !Number.isNaN(start.getTime()) ? Math.ceil((start - today) / 86400000) : null
  const earlyStartDate = localDateKey(today)
  const earlyStartOffset = trip.startDate ? dateKeyOffset(trip.startDate, earlyStartDate) : 0
  const earlyEndDate = trip.endDate
    ? tripDateAtOffset(trip.endDate, earlyStartOffset)
    : tripDateAtOffset(earlyStartDate, Math.max(0, (trip.days || dailyPlans.length || 1) - 1))
  const earlyDateRange = formatTripDateRange(earlyStartDate, earlyEndDate)
  const earlyStayCount = (trip.stays || []).filter(stay => stay.checkIn || stay.checkOut).length
  const earlyReviewCount = bookingTasks.filter(task => task.status !== 'not_needed').length
  const canStartNow = !readOnly && (daysUntilStart === null || daysUntilStart <= 0) && (!end || new Date() <= end)
  const routeQualityIssues = routeDays.flatMap(({ dayIndex, places: dayPlaces }) => {
    const mealStops = dayPlaces.filter(place => /美食|餐厅|小吃|咖啡|市集/.test(place.category || ''))
    const categoryCounts = dayPlaces.reduce((all, place) => ({ ...all, [place.category]: (all[place.category] || 0) + 1 }), {})
    const repeatedCategory = Object.entries(categoryCounts).find(([, count]) => count >= 3)
    if (mealStops.length > 2) return [{ dayIndex, text: `第 ${dayIndex + 1} 天有 ${mealStops.length} 个餐饮地点，建议分散到其他日期` }]
    if (repeatedCategory) return [{ dayIndex, text: `第 ${dayIndex + 1} 天的「${repeatedCategory[0]}」类地点过于集中` }]
    return []
  })
  const departureLabel = readOnly ? '已完成'
    : daysUntilStart === null ? trip.status
    : daysUntilStart > 0 ? `${daysUntilStart} 天后出发`
      : daysUntilStart === 0 ? '今天出发'
        : end && today <= end ? '旅行进行中' : '行程已结束'

  useEffect(() => setShowEarlyDeparture(false), [trip.id])

  return <div className={`screen upcoming-screen enter ${journeyView ? 'journey-route-screen' : ''}`}>
    {journeyView ? <header className="simple-head journey-route-head"><button className="icon-btn" aria-label="返回" onClick={onBack}><ArrowLeft/></button><span>全程路线</span><small>{trip.days} 天</small></header> : <>
      <header className="topbar overview-head"><div><div className="eyebrow">{trip.cityCode} · 行程概览</div><h1>{trip.title}</h1></div><span className="avatar" aria-label="用户 W">W</span></header>
      {pendingBookingTasks.length > 0 && <button className="overview-confirmations" aria-label={`查看 ${pendingBookingTasks.length} 项待确认`} onClick={onBookings}><span><ListChecks/></span><span><small>出发准备</small><strong>{pendingBookingTasks.length} 项待确认</strong></span><ArrowRight/></button>}
      <section className={`trip-overview-brief tone-${trip.tone}`}>
        <div className="departure-label"><Clock3/>{departureLabel}</div>
        <p>{trip.dates}</p>
        <div className="trip-overview-stats"><span><strong>{trip.days}</strong>天</span><span><strong>{trip.people}</strong>人</span><span><strong>{trip.saved}</strong>个地点</span></div>
        <div className="trip-overview-footer">
          {(trip.styles || []).length > 0 && <div className="overview-styles">{trip.styles.map(style => <span key={style}>{style}</span>)}</div>}
          {hasRoute && canStartNow && <button className="trip-start-now" onClick={onStartNow}><Navigation/>开始今天行程</button>}
          {hasRoute && !readOnly && daysUntilStart > 0 && <button className="trip-start-now early" aria-expanded={showEarlyDeparture} onClick={() => setShowEarlyDeparture(value => !value)}><Navigation/>提前出发</button>}
          {readOnly && <span className="trip-complete-label"><Check/>行程已完成</span>}
        </div>
      </section>
    </>}

    {!journeyView && showEarlyDeparture && daysUntilStart > 0 && <section className="early-departure-confirm" role="region" aria-label="提前出发确认">
      <header><span><Clock3/></span><div><small>提前出发确认</small><h2>改为今天出发？</h2></div><button aria-label="关闭提前出发确认" onClick={() => setShowEarlyDeparture(false)}><X/></button></header>
      <div className="early-departure-dates"><span><small>原计划</small><del>{trip.dates}</del></span><ArrowRight/><span><small>调整后</small><strong>{earlyDateRange}</strong></span></div>
      <ul>
        <li>每天的路线和停留顺序不变</li>
        {earlyStayCount > 0 && <li>{earlyStayCount} 段住宿日期同步提前</li>}
        {earlyReviewCount > 0 && <li>{earlyReviewCount} 项出发准备恢复为待确认</li>}
      </ul>
      <footer><button onClick={() => setShowEarlyDeparture(false)}>取消</button><button className="primary" onClick={onStartEarly}>确认今天出发</button></footer>
    </section>}

    {routeQualityIssues.length > 0 && !readOnly && <section className="route-quality-alert" role="status"><AlertTriangle/><span><strong>这条旧路线有同类地点过度集中</strong><small>{routeQualityIssues.slice(0, 2).map(item => item.text).join('；')}</small></span><button onClick={onEditRoute}>去整理</button></section>}

    {!journeyView && !hasRoute && !readOnly && <section className="trip-route-empty">
      <div className="trip-ready-label"><Bookmark/><span>还没有路线</span></div>
      <h2>先加入几个想去地点。</h2>
      <p>添加地点后，就能查看每天的路线。</p>
      <button className="overview-primary" onClick={onMap}>去添加地点<ArrowRight/></button>
    </section>}

    {!journeyView && !readOnly && <section className="packing-checklist">
      <header><div><h3>要带的东西</h3><p>点一下表示已经装进行李。</p></div><span>{packingChecked.length} / {packingItems.length}</span></header>
      <div>{packingItems.map(item => { const checked = packingChecked.includes(item.id); return <button key={item.id} aria-pressed={checked} className={checked ? 'checked' : ''} onClick={() => onTogglePacking(item.id)}><i>{checked && <Check/>}</i><span>{item.label}</span></button> })}</div>
    </section>}

    {!journeyView && !readOnly && appointmentCount > 0 && <div className="appointment-note"><TicketCheck/><span>已记录 {appointmentCount} 个预约时间，调整路线时会优先保留。</span></div>}

    {!readOnly && routeVersions.length > 1 && <details className="route-version-overview"><summary><span><GitCompareArrows/>路线有 {routeVersions.length} 个可恢复版本</span><ChevronDown/></summary><div>{routeVersions.slice(0, 3).map(version => <button key={version.id} onClick={() => onRestoreVersion(version)}><span><strong>{version.label}</strong><small>{describePlanDiff(version.dailyPlans, trip.dailyPlans, placeMap)}</small></span><em>恢复</em></button>)}</div></details>}

    {hasRoute && <section className="trip-route-overview clear-route-overview">
      <header><div><h3>{journeyView ? trip.title : '详细旅行路线'}</h3><p>{readOnly ? '行程已完成；点击地点查看详情与完成状态。' : journeyView ? `正在进行第 ${trip.currentDay || 1} 天；点击地点查看详情和完成状态。` : '点击地点查看图片和评价；路线与住宿都可以修改。'}</p></div>{readOnly ? <span className="route-readonly-label"><Lock/>只读记录</span> : <button className="edit-full-route" onClick={onEditRoute}>编辑路线</button>}</header>
      <div className="overview-day-list">{visibleDays.map(({ dayIndex, date, places: dayPlaces, stay }) => {
        const dayOrigin = stay ? placeMap.get(stay.placeId) : null
        const firstTravelMinutes = dayPlaces[0] ? getTransport(dayPlaces[0], '', 'normal', tripTransportMode(trip)).recommended.minutes : null
        const suggestedSchedule = buildSuggestedDaySchedule(dayPlaces, { startTime: tripDayStartTime(trip, dayIndex), transport: tripTransportMode(trip), origin: dayOrigin, firstTravelMinutes })
        return <div className={`overview-day-row ${dayPlaces.length ? 'has-places' : ''}`} key={dayIndex}>
        <div className="overview-day-key"><strong>第 {dayIndex + 1} 天</strong><small>{formatTripDate(trip.startDate, dayIndex)}</small><em>{dayPlaces.length ? `${formatClockMinutes(suggestedSchedule[0]?.departPrevious ?? suggestedSchedule[0]?.start)}–${formatClockMinutes(suggestedSchedule.at(-1)?.end)}` : '留给休息'}</em></div>
        <div className="overview-day-places">{dayPlaces.length ? dayPlaces.map((place, placeIndex) => {
            const done = visited.includes(place.id)
            const fixed = !done && Boolean(place.fixed)
            const transport = getTransport(place, '', 'normal', tripTransportMode(trip)).recommended
            const status = done ? '已完成' : fixed ? `${place.fixed} 预约` : null
            const publicTransit = tripTransportMode(trip) === 'public'
            const travelTime = publicTransit ? null : Number.isFinite(transport.minutes) ? `预计 ${formatTravelTime(transport.minutes)}` : '出发时确认'
            const schedule = suggestedSchedule[placeIndex]
            const meta = [`第 ${placeIndex + 1} 站`, status, place.category, publicTransit ? '公共交通' : transport.label, travelTime, `建议停留 ${place.duration}`].filter(Boolean).join(' · ')
            const origin = placeIndex > 0 ? dayPlaces[placeIndex - 1] : stay ? placeMap.get(stay.placeId) : null
            return <button key={place.id} className={`overview-place-stop ${done ? 'done' : fixed ? 'fixed' : 'pending'} ${schedule.warning ? 'has-warning' : ''}`} onClick={() => onDetails(place.id)}><i>{done ? <Check/> : fixed ? <TicketCheck/> : <span/>}</i><span><span className="overview-stop-head"><strong>{place.name}</strong><span className="overview-stop-time"><Clock3/>{formatClockMinutes(schedule.start)}–{formatClockMinutes(schedule.end)}</span></span>{schedule.warning && <em className="overview-stop-warning">{schedule.warning}</em>}<small>{meta}</small>{schedule.departPrevious !== null && <small className="overview-departure">建议 {formatClockMinutes(schedule.departPrevious)} {placeIndex === 0 ? '出发' : '离开上一站'} · 预留 {schedule.transferMinutes} 分钟{transportReserveLabel(tripTransportMode(trip))}</small>}<OverviewTransitLeg origin={origin} destination={place} city={trip.city} enabled={publicTransit}/></span><ArrowRight/></button>
          }) : <em>暂不安排</em>}
          {dayPlaces.length > 0 && <OverviewLifeNote dayPlaces={dayPlaces}/>} 
          {stay ? readOnly ? <div className="overview-stay-note readonly"><Home/><span>{stay.checkIn === date ? '入住' : '住宿'} · {stay.name}</span></div> : <button className="overview-stay-note" aria-label={`编辑住宿 ${stay.name}`} onClick={onSelectHotel}><Home/><span>{stay.checkIn === date ? '入住' : '住宿'} · {stay.name}</span><Pencil className="stay-edit-icon"/></button> : dayIndex < routeDays.length - 1 ? readOnly ? <div className="overview-stay-note readonly missing"><Home/><span>住宿未记录</span></div> : <button className="overview-stay-note missing" aria-label="添加住宿" onClick={onSelectHotel}><Home/><span>住宿未设置</span><Plus/></button> : <div className="overview-stay-note checkout"><Home/><span>返程日 · 无需新增住宿</span></div>}
        </div>
      </div>})}</div>
      {!journeyView && routeDays.length > 3 && <button className="show-all-days" onClick={() => setShowAllDays(value => !value)}>{showAllDays ? '收起后面的日期' : `查看全部 ${routeDays.length} 天`}<ChevronDown className={showAllDays ? 'open' : ''}/></button>}
    </section>}
    {!journeyView && <button className="switch-trip-link" onClick={onSwitch}>切换其他旅行 <ArrowRight/></button>}
  </div>
}

function MeScreen({ energy, trips, visitedByTrip, activeTripId, bookingTasks = [], productSignals = {}, onBookings, onSwitch, onDelete, onCreate, onHotel, onToday, onReset }) {
  const [managingTrips, setManagingTrips] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const active = trips.find(trip => trip.id === activeTripId) || trips[0]
  const others = trips.filter(trip => trip.id !== activeTripId)
  const activeStatus = displayedTripStatus(active)
  const activeProgress = activeStatus === '已完成' ? active.days : activeStatus === '旅行中' ? Math.max(1, active.currentDay || 1) : 0
  const activeCompleted = activeStatus === '已完成'
  const activeProgressLabel = activeCompleted ? `已完成 · ${active.days} 天` : activeStatus === '旅行中' ? `第 ${activeProgress} / ${active.days} 天` : `${active.days} 天`
  const plannedPlaces = new Set((active.dailyPlans || []).flat()).size
  const completedPlaces = (visitedByTrip[active.id] || []).filter(id => (active.dailyPlans || []).some(day => day.includes(id))).length
  const activeDateCopy = active.status === '旅行中' && active.rescheduledAt
    ? `提前至 ${active.dates} · 原计划 ${shortStayDate(active.originalStartDate)}`
    : active.status === '旅行中' && active.startedAt ? `${formatStartedDate(active.startedAt)} · 原计划 ${active.dates}` : active.dates
  return <div className="screen me-screen enter">
    <header className="topbar"><div><div className="eyebrow">TRAVEL PROFILE</div><h1>我的旅行</h1></div><span className="avatar" aria-label="用户 W">W</span></header>
    <section className={`trip-ticket trip-tone-${active.tone}`}><div className="ticket-top"><span>当前旅行 · {activeStatus}</span><strong>{activeProgressLabel}</strong></div><h2>{active.title}</h2><p>{activeDateCopy} · {active.people} 人</p><div className="ticket-stats"><div><strong>{active.days}</strong><span>天</span></div><div><strong>{active.must}</strong><span>必去</span></div><div><strong>{active.saved}</strong><span>地点</span></div></div></section>
    {activeCompleted ? <section className="settings-list readonly"><h3>旅行记录</h3><div className="settings-row"><span><MapPin/>住宿记录</span><small>{active.stays?.length ? `${active.stays.length} 处` : '未记录'}</small><Lock/></div><div className="settings-row"><span><Check/>完成进度</span><small>{completedPlaces} / {plannedPlaces} 个地点</small><Lock/></div><div className="settings-row"><span><Clock3/>旅行状态</span><small>已完成</small><Lock/></div></section> : <section className="settings-list"><h3>当前旅行设置</h3><button onClick={onBookings}><span><ListChecks/>出发准备</span><small>{bookingTasks.filter(task => task.status === 'confirmed').length} / {bookingTasks.length} 已确认</small><ArrowRight/></button><button onClick={onHotel}><span><MapPin/>住宿安排</span><small>{active.stays?.length ? `${active.stays.length} 处` : '未设置'}</small><ArrowRight/></button><button onClick={onToday}><span><Zap/>体力状态</span><small>{energy === 'high' ? '还有劲' : energy === 'low' ? '累了' : '一般'}</small><ArrowRight/></button></section>}
    <button className="new-trip-cta" onClick={onCreate}><Plus/><span><strong>创建新旅行</strong><small>添加新的目的地与日期</small></span><ArrowRight/></button>
    {others.length > 0 && <section className={`trip-library ${managingTrips ? 'is-managing' : ''}`}><div className="trip-library-head"><h3>其他旅行计划</h3><div className="trip-library-tools"><button aria-pressed={managingTrips} onClick={() => { setManagingTrips(value => !value); setPendingDeleteId(null) }}>{managingTrips ? '完成' : '管理'}</button></div></div>{others.map((trip, index) => {
      const done = (visitedByTrip[trip.id] || []).length
      const pending = pendingDeleteId === trip.id
      const tripStatus = displayedTripStatus(trip)
      return <article className={`trip-plan-item tone-${trip.tone} ${pending ? 'pending-delete' : ''}`} key={trip.id}>
        <button className="trip-plan-row" onClick={() => onSwitch(trip.id)}><span className="trip-plan-number">{String(index + 1).padStart(2, '0')}</span><span className="trip-plan-copy"><small>{trip.cityCode} · {tripStatus}</small><strong>{trip.title}</strong><span>{trip.dates} · 已完成 {done} 个地点</span></span>{!managingTrips && <span className="trip-plan-arrow"><ArrowRight/></span>}</button>
        {managingTrips && <button className="trip-plan-delete" aria-label={`删除 ${trip.title}，${trip.dates}`} onClick={() => setPendingDeleteId(trip.id)}><Trash2/><span>删除</span></button>}
        {pending && <div className="trip-delete-confirm" role="alertdialog" aria-label={`确认删除 ${trip.title}`}><div><strong>删除「{trip.title}」？</strong><span>{trip.dates} 的路线、地点和进度会一起删除。</span></div><div><button onClick={() => setPendingDeleteId(null)}>取消</button><button className="danger" onClick={() => { onDelete(trip.id); setPendingDeleteId(null); if (others.length === 1) setManagingTrips(false) }}>确认删除</button></div></div>}
      </article>
    })}</section>}
    <button className="reset-demo" onClick={onReset}><Trash2/>清除本机全部旅行</button><p className="brand-foot">此刻去哪 · AI 负责想，你负责玩</p>
  </div>
}

function guidedSearchQueries(preferenceNote, styles, city) {
  const text = `${preferenceNote} ${styles.join(' ')}`
  const landmarkQueries = classicLandmarks(city)
  if (/新疆/.test(city)) {
    const regional = ['北疆热门景点', '南疆热门景点', '乌鲁木齐周边景点', '新疆特色美食']
    if (/自然|风景|山|湖|草原/.test(text)) regional.unshift('新疆自然风光')
    if (/文化|历史|人文|古城/.test(text)) regional.unshift('新疆人文景点')
    return [...new Set([...landmarkQueries.slice(0, 1), ...regional])].slice(0, 5)
  }
  const queries = []
  const rules = [
    [/吃|美食|餐厅|小吃/, '特色美食'],
    [/咖啡/, '咖啡馆'],
    [/逛|购物|街区/, '特色街区'],
    [/自然|风景|公园|山|湖/, '风景名胜'],
    [/艺术|文化|历史|博物馆/, '博物馆'],
    [/亲子|孩子|家庭/, '亲子景点']
  ]
  rules.forEach(([pattern, query]) => { if (pattern.test(text)) queries.push(query) })
  ;['热门景点', '特色美食', '特色街区'].forEach(query => {
    if (!queries.includes(query)) queries.push(query)
  })
  const landmarkLimit = /经典|地标|第一次|必去/.test(text) ? 2 : 1
  return [...new Set([...landmarkQueries.slice(0, landmarkLimit), ...queries])].slice(0, 4)
}

const travelConstraintMeta = {
  none: { label: '无特殊限制', pace: null, searchHint: '' },
  lessWalk: { label: '少走路', pace: 'slow', searchHint: '' },
  elder: { label: '带长辈', pace: 'slow', searchHint: '' },
  child: { label: '亲子同行', pace: 'slow', searchHint: '亲子' }
}

function CreateTripScreen({ onBack, onDone, onSignal }) {
  const createRef = React.useRef(null)
  React.useLayoutEffect(() => {
    // Native mobile inputs can pan the root viewport despite overflow:hidden.
    // Let the browser own scrolling during this form instead of nesting it
    // inside the fixed-height tab shell, especially around keyboard dismissal.
    document.documentElement.classList.add('document-form-flow')
    return () => document.documentElement.classList.remove('document-form-flow')
  }, [])
  const savedDraft = useMemo(() => { try { return JSON.parse(localStorage.getItem('next-stop-create-draft-v1')) || {} } catch { return {} } }, [])
  const [step, setStep] = useState(savedDraft.step || 1)
  const [flowMode, setFlowMode] = useState(savedDraft.flowMode || 'guided')
  const [city, setCity] = useState(savedDraft.city || '')
  const [origin, setOrigin] = useState(savedDraft.origin || '')
  const [styles, setStyles] = useState(savedDraft.styles || [])
  const [startDate, setStartDate] = useState(savedDraft.startDate || '')
  const [endDate, setEndDate] = useState(savedDraft.endDate || '')
  const [people, setPeople] = useState(savedDraft.people || 2)
  const [pace, setPace] = useState(savedDraft.pace || 'normal')
  const [transport, setTransport] = useState(savedDraft.transport || 'public')
  const [dayStartTime, setDayStartTime] = useState(savedDraft.dayStartTime || '09:30')
  const [arrivalTime, setArrivalTime] = useState(savedDraft.arrivalTime || '')
  const [departureTime, setDepartureTime] = useState(savedDraft.departureTime || '')
  const [preferenceNote, setPreferenceNote] = useState(savedDraft.preferenceNote || '')
  const [budget, setBudget] = useState(savedDraft.budget || 'unset')
  const [diet, setDiet] = useState(savedDraft.diet || '')
  const [lodgingPreference, setLodgingPreference] = useState(savedDraft.lodgingPreference || '')
  const [searchMode, setSearchMode] = useState('place')
  const [placeSearch, setPlaceSearch] = useState('')
  const [selectedPlaces, setSelectedPlaces] = useState(savedDraft.selectedPlaces || [])
  const [hotel, setHotel] = useState(savedDraft.hotel || null)
  const [routeDraft, setRouteDraft] = useState(savedDraft.routeDraft || [])
  const [routeOptions, setRouteOptions] = useState(savedDraft.routeOptions || [])
  const [selectedOptionId, setSelectedOptionId] = useState(savedDraft.selectedOptionId || '')
  const [reviewMode, setReviewMode] = useState(savedDraft.reviewMode || 'options')
  const [previewPlace, setPreviewPlace] = useState(null)
  const [flowError, setFlowError] = useState('')
  const [planningStatus, setPlanningStatus] = useState('idle')
  const [planningEngine, setPlanningEngine] = useState('local')
  const [planningPhase, setPlanningPhase] = useState('idle')
  const [planningFallback, setPlanningFallback] = useState(false)
  const [travelConstraint, setTravelConstraint] = useState(savedDraft.travelConstraint || 'none')
  const [draftVersions, setDraftVersions] = useState(savedDraft.draftVersions || [])
  const [lastDraftChange, setLastDraftChange] = useState('')
  const days = dateDays(startDate, endDate)
  const noteNeedsSlowPace = /长辈|老人|少走|轮椅|带娃|孩子|休息多/.test(preferenceNote)
  const effectivePace = travelConstraintMeta[travelConstraint]?.pace || (noteNeedsSlowPace ? 'slow' : pace)
  const effectiveStyles = [...new Set([...styles, travelConstraintMeta[travelConstraint]?.searchHint].filter(Boolean))]
  const totalSteps = flowMode === 'guided' ? 3 : 4
  const reviewStep = totalSteps
  const searchType = searchMode === 'hotel' ? '住宿服务' : ''
  const { query, results, status: searchStatus, error: searchError } = useAmapPlaceSearch(placeSearch, city, searchType)
  const intentSummary = useMemo(() => buildIntentSummary({ note: preferenceNote, styles, pace: effectivePace, transport, dayStartTime, travelConstraint, budget, diet, lodgingPreference, arrivalTime, departureTime }), [preferenceNote, styles, pace, effectivePace, transport, dayStartTime, travelConstraint, budget, diet, lodgingPreference, arrivalTime, departureTime])
  const cityGuide = useMemo(() => destinationGuide(city), [city])

  useEffect(() => {
    if (createRef.current) createRef.current.scrollTop = 0
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step, reviewMode, previewPlace?.id])

  useEffect(() => {
    const draft = { step, flowMode, city, origin, styles, startDate, endDate, people, pace, transport, dayStartTime, arrivalTime, departureTime, preferenceNote, budget, diet, lodgingPreference, selectedPlaces, hotel, routeDraft, routeOptions, selectedOptionId, reviewMode, travelConstraint, draftVersions }
    localStorage.setItem('next-stop-create-draft-v1', JSON.stringify(draft))
  }, [step, flowMode, city, origin, styles, startDate, endDate, people, pace, transport, dayStartTime, arrivalTime, departureTime, preferenceNote, budget, diet, lodgingPreference, selectedPlaces, hotel, routeDraft, routeOptions, selectedOptionId, reviewMode, travelConstraint, draftVersions])

  useEffect(() => {
    if (reviewMode !== 'detail' || !routeDraft.some(group => group.length) || draftVersions.length) return
    setDraftVersions([{ id: `draft-${Date.now()}`, label: '初始详细安排', at: new Date().toISOString(), groups: routeDraft.map(group => group.map(place => ({ ...place }))), selectedPlaces: selectedPlaces.map(place => ({ ...place })) }])
  }, [reviewMode])

  function goBack() {
    setFlowError('')
    if (previewPlace) setPreviewPlace(null)
    else if (step === reviewStep && reviewMode === 'detail') setReviewMode('options')
    else if (step === 1) onBack()
    else setStep(value => value - 1)
  }

  function finishBasics() {
    if (!city.trim()) return setFlowError('先填写这次旅行的目的地。')
    if (!days) return setFlowError('请选择有效的出发和返程日期。')
    setFlowError('')
    setStep(2)
  }

  function chooseFlowMode(mode) {
    if (flowMode === mode) return
    setFlowMode(mode)
    setSelectedPlaces([])
    setHotel(null)
    setRouteDraft([])
    setRouteOptions([])
    setSelectedOptionId('')
    setReviewMode('options')
    setPreviewPlace(null)
    setFlowError('')
  }

  function presentRouteOptions(options) {
    if (!options.length) throw new Error('暂时无法生成可用路线，请补充地点或增加旅行天数。')
    const first = options[0]
    setRouteOptions(options)
    setSelectedOptionId(first.id)
    setSelectedPlaces(first.places)
    setRouteDraft(first.groups)
    setPlanningEngine('local')
    setPlanningFallback(false)
    setReviewMode('options')
  }

  function chooseRouteOption(option) {
    setSelectedOptionId(option.id)
    setSelectedPlaces(option.places)
    setRouteDraft(option.groups)
    setPlanningEngine('local')
    onSignal?.('routeComparisons')
  }

  async function generateGuidedPlan() {
    setPlanningStatus('loading')
    setPlanningPhase('places')
    setFlowError('')
    try {
      const queries = guidedSearchQueries(preferenceNote, effectiveStyles, city)
      const landmarkQueries = new Set(classicLandmarks(city))
      const rawBatches = await Promise.all(queries.map(item => searchAmapPlaces(item, city, '', 8)))
      const batches = rawBatches.map((batch, batchIndex) => {
        const query = queries[batchIndex]
        if (!landmarkQueries.has(query)) return batch
        const exact = batch.find(place => normalizePlaceLabel(place.name) === normalizePlaceLabel(query))
        return exact ? [exact] : batch.slice(0, 1)
      })
      const mixed = []
      const seen = new Set()
      const longest = Math.max(...batches.map(batch => batch.length), 0)
      for (let index = 0; index < longest; index += 1) {
        batches.forEach(batch => {
          const place = batch[index]
          if (!place || place.category === '住宿' || seen.has(place.id)) return
          seen.add(place.id)
          mixed.push({ ...place, priority: 'want' })
        })
      }
      if (mixed.length < 2) throw new Error('暂时没找到足够的真实地点，请换个更具体的目的地或改用手动添加。')
      setPlanningPhase('options')
      presentRouteOptions(buildRouteOptions({ city, places: mixed, days, pace: effectivePace, hotel: null, styles: effectiveStyles, preferenceNote }))
      setPlanningStatus('complete')
      setPlanningPhase('idle')
      setStep(3)
    } catch (error) {
      console.error('自动生成路线失败', error)
      setPlanningStatus('error')
      setPlanningPhase('idle')
      setFlowError(error.message || '暂时无法生成路线，请稍后再试。')
    }
  }

  function finishPreferences() {
    if (flowMode === 'manual') {
      setFlowError('')
      setStep(3)
      return
    }
    generateGuidedPlan()
  }

  function selectSearchResult(place) {
    setFlowError('')
    if (searchMode === 'hotel') {
      setHotel({ ...place, isHotel: true, priority: 'optional' })
      return
    }
    setSelectedPlaces(items => items.some(item => item.id === place.id) ? items : [...items, { ...place, priority: 'want' }])
  }

  function updateSelectedPlace(id, patchValue) {
    if (reviewMode === 'detail') rememberDraft('更改必去状态')
    setSelectedPlaces(items => items.map(place => place.id === id ? { ...place, ...patchValue } : place))
    setRouteDraft(groups => groups.map(group => group.map(place => place.id === id ? { ...place, ...patchValue } : place)))
  }

  async function generatePlan() {
    if (selectedPlaces.length < 2) return setFlowError('至少添加 2 个真实地点，才能生成路线。')
    setFlowError('')
    setPlanningStatus('loading')
    setPlanningPhase('options')
    try {
      presentRouteOptions(buildRouteOptions({ city, places: selectedPlaces, days, pace: effectivePace, hotel, manual: true, styles: effectiveStyles, preferenceNote }))
      setPlanningStatus('complete')
      setPlanningPhase('idle')
      setStep(4)
    } catch (error) {
      setPlanningStatus('error')
      setPlanningPhase('idle')
      setFlowError(error.message || '暂时无法生成路线，请稍后重试。')
    }
  }

  async function openSelectedRoute() {
    const option = routeOptions.find(item => item.id === selectedOptionId)
    if (!option) return
    setPlanningStatus('loading')
    setPlanningPhase('schedule')
    setPlanningFallback(false)
    setFlowError('')
    try {
      const aiPlan = await requestAiPlan({ city, origin, days, pace: effectivePace, transport, dayStartTime, preferences: [travelConstraintMeta[travelConstraint].label, preferenceNote, budget !== 'unset' ? `预算 ${budget}` : '', diet ? `饮食 ${diet}` : '', lodgingPreference ? `住宿 ${lodgingPreference}` : '', arrivalTime ? `抵达 ${arrivalTime}` : '', departureTime ? `返程 ${departureTime}` : ''].filter(Boolean).join('；'), styles: effectiveStyles, places: option.places, stays: hotel ? [hotel] : [], intent: 'plan' })
      const placeMap = new Map(option.places.map(place => [String(place.id), place]))
      const groups = Array.from({ length: days }, (_, dayIndex) => (aiPlan.days[dayIndex]?.placeIds || []).map(id => placeMap.get(String(id))).filter(Boolean))
      if (!groups.some(group => group.length)) throw new Error('AI 没有返回可用路线')
      setRouteDraft(groups)
      setPlanningEngine('deepseek')
    } catch (aiError) {
      if (aiError.code !== 'AI_NOT_CONFIGURED') console.warn('AI 规划不可用，已回退本地规则', aiError)
      setRouteDraft(option.groups)
      setPlanningEngine('local')
      setPlanningFallback(true)
    } finally {
      setPlanningStatus('complete')
      setPlanningPhase('idle')
      setReviewMode('detail')
    }
  }

  function rememberDraft(label) {
    setDraftVersions(items => [{ id: `draft-${Date.now()}`, label, at: new Date().toISOString(), groups: routeDraft.map(group => group.map(place => ({ ...place }))), selectedPlaces: selectedPlaces.map(place => ({ ...place })) }, ...items].slice(0, 6))
    setLastDraftChange(label)
  }

  function restoreDraft(version) {
    if (!version) return
    rememberDraft('恢复版本前')
    setRouteDraft(version.groups.map(group => group.map(place => ({ ...place }))))
    setSelectedPlaces(version.selectedPlaces.map(place => ({ ...place })))
    setLastDraftChange(`已恢复：${version.label}`)
  }

  function shiftPlace(placeId, dayOffset) {
    rememberDraft('移动地点日期')
    setRouteDraft(groups => {
      const sourceDay = groups.findIndex(group => group.some(place => place.id === placeId))
      const targetDay = sourceDay + dayOffset
      if (sourceDay < 0 || targetDay < 0 || targetDay >= groups.length) return groups
      const next = groups.map(group => [...group])
      const placeIndex = next[sourceDay].findIndex(place => place.id === placeId)
      const [place] = next[sourceDay].splice(placeIndex, 1)
      next[targetDay].push(place)
      return next
    })
  }

  function removeDraftPlace(placeId) {
    rememberDraft('移除地点')
    setSelectedPlaces(items => items.filter(place => place.id !== placeId))
    setRouteDraft(groups => groups.map(group => group.filter(place => place.id !== placeId)))
  }

  function createTrip() {
    const cityCodes = { 新疆: 'XINJIANG', 乌鲁木齐: 'URUMQI', 上海: 'SHANGHAI', 北京: 'BEIJING', 成都: 'CHENGDU', 大理: 'DALI', 杭州: 'HANGZHOU', 广州: 'GUANGZHOU', 深圳: 'SHENZHEN' }
    const createdAt = Date.now()
    const dailyPlans = routeDraft.map(group => group.map(place => place.id))
    const allPlaces = hotel && !selectedPlaces.some(place => place.id === hotel.id) ? [...selectedPlaces, hotel] : selectedPlaces
    const toneSeed = [...city].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const trip = {
      id: `trip-${createdAt}`, city: city.trim(), cityCode: cityCodes[city.trim()] || city.trim().toUpperCase(),
      title: `${city.trim()}之旅`, dates: `${startDate.replaceAll('-', '.')} — ${endDate.slice(5).replace('-', '.')}`,
      startDate, endDate, days, currentDay: 1, must: selectedPlaces.filter(place => place.priority === 'must').length,
      saved: allPlaces.length, people, hotel: hotel?.name || '未设置', hotelPlaceId: hotel?.id || null,
      stays: hotel ? [{ id: `stay-${createdAt}`, placeId: hotel.id, name: hotel.name, area: hotel.area, checkIn: startDate, checkOut: endDate }] : [],
      status: '待出发', tone: ['sage', 'brick', 'violet'][toneSeed % 3], styles: effectiveStyles, pace: effectivePace,
      origin: origin.trim(), transportPreference: transport, dailyPlans, planner: planningEngine === 'deepseek' ? 'deepseek' : 'local-rules-v3', planningMode: flowMode,
      preferenceNote: '', travelConstraint, dayStartTime
    }
    trip.preferenceNote = preferenceNote
    trip.planningIntent = { note: preferenceNote, styles: effectiveStyles, budget, diet, lodgingPreference, arrivalTime, departureTime, pace: effectivePace, transport, dayStartTime, travelConstraint, understood: intentSummary.facts, unresolved: intentSummary.questions }
    trip.bookingTasks = bookingTasksForTrip(trip, allPlaces)
    localStorage.removeItem('next-stop-create-draft-v1')
    onDone({
      trip,
      selectedPlaces: allPlaces,
      firstDayPlan: dailyPlans.find(group => group.length) || [],
      lockedIds: selectedPlaces.filter(place => place.fixed).map(place => place.id),
      bookingTasks: trip.bookingTasks
    })
  }

  const selectedOption = routeOptions.find(option => option.id === selectedOptionId)
  const selectedRouteMetric = routeTransportMetric(transport, selectedOption?.maxDriveHours)
  const routeDraftSchedules = routeDraft.map((group, dayIndex) => {
    const firstTravelMinutes = group[0] ? getTransport(group[0], '', 'normal', transport).recommended.minutes : null
    const firstDayStart = dayIndex === 0 && arrivalTime
      ? formatClockMinutes(Math.max(clockToMinutes(dayStartTime), clockToMinutes(arrivalTime) + 60))
      : dayStartTime
    const schedule = buildSuggestedDaySchedule(group, { startTime: firstDayStart, transport, origin: hotel, firstTravelMinutes })
    if (dayIndex === routeDraft.length - 1 && departureTime && schedule.length && schedule.at(-1).end > clockToMinutes(departureTime) - 90) {
      schedule[schedule.length - 1] = { ...schedule.at(-1), warning: `需在 ${formatClockMinutes(clockToMinutes(departureTime) - 90)} 前结束前往返程点` }
    }
    return schedule
  })
  const routeScheduleWarnings = routeDraftSchedules.flat().filter(item => item.warning)
  const routeChoice = <section className="form-stage create-stage route-choice-stage">
    <h1>选一条，<br/>继续细化。</h1>
    <p className="route-choice-lead">先看路线差异，地点详情按需展开。</p>
    <div className="route-trust-intro">
      <div><Check/><span><strong>真实地点来自高德</strong><small>营业时间与实时交通会在出发前核对。</small></span></div>
    </div>
    <div className="route-option-list">{routeOptions.map(option => {
      const selected = option.id === selectedOptionId
      const travelMetric = routeTransportMetric(transport, option.maxDriveHours)
      const evidence = routeEvidence(option)
      const estimate = estimateRouteOption(option, days, transport)
      return <article className={`route-option ${selected ? 'active' : ''}`} key={option.id}>
        <button type="button" className="route-option-choice" aria-pressed={selected} onClick={() => chooseRouteOption(option)}>
          <span className="route-option-select">{selected ? <Check/> : <i/>}</span>
          <span className="route-option-copy"><span className="route-option-title"><strong>{option.title}</strong><em>{option.tag}</em></span><span className="route-option-path">{option.routeLabel || `${option.places.length} 个真实地点`}</span>{option.preferenceLabels?.length > 0 && <span className="route-option-match">匹配你的偏好 · {option.preferenceLabels.join(' / ')}</span>}<span className="route-option-metrics"><b>{days} 天</b><b>{option.places.length} 个地点</b><b>每天最多 {option.maxStops} 站</b><b>{travelMetric.compact}</b></span><span className="route-option-reason"><strong>推荐理由</strong>{option.reason}</span><span className="route-option-tradeoff">取舍：{option.tradeoff}</span><span className="route-option-operational"><b><WalletCards/>预算 {estimate.budget}</b>{estimate.booking && <b><AlertTriangle/>{estimate.booking}</b>}</span><small className="route-option-budget-note">{estimate.budgetNote}</small></span>
        </button>
        <details className="route-option-place-evidence">
          <summary><span>查看地点与依据</span><ChevronDown/></summary>
          <div className="route-option-place-list">{option.places.map(place => <button type="button" key={place.id} onClick={() => { onSignal?.('evidenceViews'); setPreviewPlace(place) }}><span><strong>{place.name}</strong><small>{place.area} · {Number.isFinite(place.rating) ? `${place.rating} 分` : '暂无评分'}</small><em>{placeSelectionReason(place, option)}</em></span><ArrowRight/></button>)}</div>
          <div className="route-option-evidence"><span><Check/>高德地点 {evidence.verified}/{evidence.count}</span><span><Star/>公开评分 {evidence.rated}/{evidence.count}</span><span><Images/>地点图片 {evidence.photographed}/{evidence.count}</span></div>
          <span className="route-option-pending"><Clock3/>{evidence.pending}</span>
        </details>
      </article>
    })}</div>
    {flowError && <div className="flow-error" role="alert">{flowError}</div>}
    {planningStatus === 'loading' && <div className="planning-progress" role="status"><span className="search-loader"/><div><strong>{planningPhase === 'schedule' ? '正在细排每天顺序' : '正在生成可比较方案'}</strong><small>不会删除你已选的地点；完成后仍可修改。</small></div></div>}
    <button className="form-next" disabled={!selectedOption || planningStatus === 'loading'} onClick={openSelectedRoute}>{planningStatus === 'loading' ? <><span className="search-loader"/>正在细化这条路线</> : '查看并编辑详细安排'}</button>
    <button className="route-back-link" onClick={() => setStep(flowMode === 'guided' ? 2 : 3)}>{flowMode === 'guided' ? '返回调整偏好' : '返回补充地点'}</button>
  </section>

  const routeReview = <section className="form-stage create-stage route-review-stage">
    <h1>{selectedOption?.title || '这条路线'}，<br/>可以继续改。</h1>
    {lastDraftChange && <div className="draft-change-bar"><GitCompareArrows/><span><strong>{lastDraftChange}</strong><small>已保留修改前版本，可随时恢复。</small></span>{draftVersions[0] && <button onClick={() => restoreDraft(draftVersions[0])}>撤销</button>}</div>}
    {planningFallback && <div className="planning-fallback" role="status"><div><strong>详细安排暂时不可用</strong><span>当前路线仍可直接编辑，地点没有丢失；你也可以再试一次。</span></div><button onClick={openSelectedRoute}>重试</button></div>}
    <div className="route-summary"><span><strong>{days}</strong>天</span><span><strong>{selectedPlaces.length}</strong>个地点</span><span><strong>{selectedRouteMetric.value}</strong>{selectedRouteMetric.label}</span></div>
    <details className="route-generation-basis"><summary><span><ShieldCheck/>生成依据与待确认项</span><ChevronDown/></summary><div><p>{intentSummary.facts.slice(0, 4).join(' · ')}</p><p><Check/>高德真实地点 {selectedPlaces.length} 个 · 每天最多 {selectedOption?.maxStops || '—'} 站</p><p><Clock3/>实时交通、营业状态{hotel ? '' : '、住宿'}待确认</p></div></details>
    {draftVersions.length > 1 && <details className="draft-version-list"><summary><span><GitCompareArrows/>查看修改记录</span><small>{draftVersions.length} 个版本</small><ChevronDown/></summary><div>{draftVersions.map(version => <button key={version.id} onClick={() => restoreDraft(version)}><span><strong>{version.label}</strong><small>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(version.at))}</small></span><em>恢复</em></button>)}</div></details>}
    <p className={`route-schedule-note ${routeScheduleWarnings.length ? 'warning' : ''}`}><Clock3/>{routeScheduleWarnings.length ? `${routeScheduleWarnings.length} 处硬性时间冲突，解决后才能创建` : `已纳入每日开始${arrivalTime ? '、抵达' : ''}${departureTime ? '、返程' : ''}时间`} · 出发前请再确认路况</p>
    <div className="daily-route-draft">{routeDraft.map((group, dayIndex) => {
      const daySchedule = routeDraftSchedules[dayIndex]
      const dayEnd = daySchedule.at(-1)?.end
      const dayStart = daySchedule[0]?.departPrevious ?? daySchedule[0]?.start
      return <section key={dayIndex}><header><span>DAY {String(dayIndex + 1).padStart(2, '0')}</span><strong>{group.length ? `${formatClockMinutes(dayStart)}–${formatClockMinutes(dayEnd)} · ${group.length} 个地点` : '留给休息'}</strong></header>{group.length ? group.map((place, index) => {
        const schedule = daySchedule[index]
        return <div className={`draft-stop ${schedule.warning ? 'has-warning' : ''}`} key={place.id}><i>{index + 1}</i><button type="button" className="draft-stop-detail" aria-label={`查看 ${place.name} 详情`} onClick={() => setPreviewPlace(place)}><em className="draft-stop-time">{formatClockMinutes(schedule.start)}–{formatClockMinutes(schedule.end)}{place.fixed ? ` · 预约 ${place.fixed}` : ' · 建议时段'}</em><strong>{place.name}</strong><small>{place.area} · {place.category}{schedule.departPrevious !== null ? ` · ${formatClockMinutes(schedule.departPrevious)} 出发，预留 ${schedule.transferMinutes} 分钟${transportReserveLabel(transport)}` : ''}</small>{schedule.warning && <b className="draft-stop-warning">{schedule.warning}</b>}<span className="draft-stop-view">查看详情<ArrowRight/></span></button><details className="draft-stop-more"><summary aria-label={`调整 ${place.name}`}><MoreHorizontal/></summary><div><button aria-pressed={place.priority === 'must'} className={place.priority === 'must' ? 'active' : ''} onClick={event => { updateSelectedPlace(place.id, { priority: place.priority === 'must' ? 'want' : 'must' }); event.currentTarget.closest('details')?.removeAttribute('open') }}><Heart fill={place.priority === 'must' ? 'currentColor' : 'none'}/>{place.priority === 'must' ? '取消必去' : '设为必去'}</button><button disabled={dayIndex === 0} onClick={event => { shiftPlace(place.id, -1); event.currentTarget.closest('details')?.removeAttribute('open') }}><ArrowLeft/>移到前一天</button><button disabled={dayIndex === routeDraft.length - 1} onClick={event => { shiftPlace(place.id, 1); event.currentTarget.closest('details')?.removeAttribute('open') }}><ArrowRight/>移到后一天</button><button className="danger" onClick={event => { removeDraftPlace(place.id); event.currentTarget.closest('details')?.removeAttribute('open') }}><X/>移除地点</button></div></details></div>
      }) : <p>不强行填满，留给休息或临时发现。</p>}</section>
    })}</div>
    <button className="form-next" disabled={!selectedPlaces.length || routeScheduleWarnings.length > 0} onClick={createTrip}>{routeScheduleWarnings.length ? '先解决时间冲突' : '确认并创建路线'}{routeScheduleWarnings.length ? <AlertTriangle/> : <Check/>}</button>
    <button className="route-back-link" onClick={() => setReviewMode('options')}>返回选择其他路线</button>
  </section>

  if (previewPlace) return <PlaceDetailScreen place={previewPlace} intent={{ note: preferenceNote, styles: effectiveStyles, travelConstraint }} previewOnly onBack={() => setPreviewPlace(null)}/>

  return <div className="screen create-screen enter" ref={createRef}>
    <header className="simple-head"><button className="icon-btn" aria-label="返回" onClick={goBack}><ArrowLeft/></button><span>规划新旅行</span><i/></header>
    <div className="create-progress" aria-hidden="true">{Array.from({ length: totalSteps }, (_, index) => index + 1).map(value => <span className={value <= step ? 'active' : ''} key={value}/>)}</div>

    {step === 1 && <section className="form-stage create-stage create-basics-stage">
      <h1>去哪，玩几天？</h1>
      <label>目的地（城市 / 地区）<div className="destination-input"><MapPin/><input value={city} onChange={event => setCity(event.target.value)} placeholder="例如：杭州或大理"/></div></label>
      <div className="two-inputs trip-date-row"><TripDateField label="出发日期" value={startDate} onChange={event => setStartDate(event.target.value)}/><TripDateField label="返程日期" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)}/></div>
      <div className="edge-time-fields"><div><strong>出发与首末日时间</strong><small>选填</small></div><p className="edge-time-hint">用于检查抵达、返程当天是否来得及</p><label className="edge-origin">从哪个城市出发<input value={origin} onChange={event => setOrigin(event.target.value)} placeholder="例如：上海"/></label><div className="two-inputs"><label>抵达目的地<input type="time" value={arrivalTime} onChange={event => setArrivalTime(event.target.value)}/></label><label>离开目的地<input type="time" value={departureTime} onChange={event => setDepartureTime(event.target.value)}/></label></div></div>
      <div className="people-field"><span>出行人数</span><div><button aria-label="减少人数" onClick={() => setPeople(value => Math.max(1, value - 1))}>−</button><strong>{people} 人</strong><button aria-label="增加人数" onClick={() => setPeople(value => Math.min(12, value + 1))}>＋</button></div></div>
      {flowError && <div className="flow-error" role="alert">{flowError}</div>}
      <button className="form-next" disabled={!city.trim() || !days} onClick={finishBasics}>继续</button>
    </section>}

    {step === 2 && <section className="form-stage create-stage planning-way-stage">
      <h1>你想，<br/>怎么玩？</h1>
      <p className="create-lead">选几个重点就够了，其余按常见情况处理。</p>
      <div className="creation-paths" role="tablist" aria-label="规划方式">
        <button type="button" role="tab" aria-selected={flowMode === 'guided'} className={flowMode === 'guided' ? 'active' : ''} onClick={() => chooseFlowMode('guided')}>帮我推荐</button>
        <button type="button" role="tab" aria-selected={flowMode === 'manual'} className={flowMode === 'manual' ? 'active' : ''} onClick={() => chooseFlowMode('manual')}>我有想去的地方</button>
      </div>
      <div className="optional-preferences"><span>旅行重点 <small>可多选</small></span><div className="style-grid compact-styles">{[['经典',Compass],['美食',UtensilsCrossed],['购物',ShoppingBag],['慢游',Footprints],['艺术',Sparkles],['周边',TrainFront]].map(([style, Icon]) => <button type="button" aria-pressed={styles.includes(style)} className={styles.includes(style) ? 'active' : ''} onClick={() => setStyles(items => items.includes(style) ? items.filter(item => item !== style) : [...items, style])} key={style}><Icon/><span>{style}</span>{styles.includes(style) && <Check/>}</button>)}</div></div>
      <div className="create-core-preferences">
        <div className="preference-group"><span>每天节奏</span><div className="choice-row">{[['slow','轻松'],['normal','适中'],['full','充实']].map(([id,label]) => <button type="button" aria-pressed={pace === id} className={pace === id ? 'active' : ''} onClick={() => setPace(id)} key={id}>{label}</button>)}</div></div>
        <div className="preference-group"><span>主要交通</span><div className="transport-choice">{[['public','公共交通',TrainFront],['drive','自驾',CarFront],['walk','步行为主',Footprints]].map(([id,label,Icon]) => <button type="button" aria-pressed={transport === id} className={transport === id ? 'active' : ''} onClick={() => setTransport(id)} key={id}><Icon/><span>{label}</span></button>)}</div></div>
      </div>
      <label className="preference-note-field"><span>特别在意的事 <small>选填</small></span><textarea value={preferenceNote} onChange={event => setPreferenceNote(event.target.value)} rows="2" placeholder="例如：想看经典地标，但不想一天横穿城市。"/></label>
      <details className="advanced-preferences">
        <summary><span>更多要求 <small>时间、预算、同行人</small></span><ChevronDown/></summary>
        <div className="intent-grid single"><label><span>每天建议开始</span><input type="time" value={dayStartTime} onChange={event => setDayStartTime(event.target.value || '09:30')}/></label></div>
        <div className="intent-field-group"><span>每人预算 <small>不含往返交通</small></span><div>{['unset','¥500 内','¥500–1000','¥1000+'].map(value => <button key={value} type="button" aria-pressed={budget === value} className={budget === value ? 'active' : ''} onClick={() => setBudget(value)}>{value === 'unset' ? '不限' : value}</button>)}</div></div>
        <div className="intent-grid"><label><span>饮食要求 <small>选填</small></span><input value={diet} onChange={event => setDiet(event.target.value)} placeholder="如：不吃辣"/></label><label><span>住宿倾向 <small>选填</small></span><input value={lodgingPreference} onChange={event => setLodgingPreference(event.target.value)} placeholder="如：地铁旁"/></label></div>
        <div className="preference-group"><span>需要特别照顾</span><div className="constraint-choice">{Object.entries(travelConstraintMeta).map(([id, meta]) => <button type="button" aria-pressed={travelConstraint === id} className={travelConstraint === id ? 'active' : ''} onClick={() => setTravelConstraint(id)} key={id}>{meta.label}</button>)}</div>{travelConstraint !== 'none' && <small className="constraint-note">会降低每天地点密度，保留更多移动和休息时间。</small>}</div>
      </details>
      <details className="destination-cognition">
        <summary><span><MapIcon/><strong>看看 {city} 的区域参考</strong></span><ChevronDown/></summary>
        <p>{cityGuide.summary}</p>
        <div>{cityGuide.zones.map(([name, fit, tradeoff]) => <article key={name}><strong>{name}</strong><span>{fit}</span><small>{tradeoff}</small></article>)}</div>
        <footer><Home/><span><strong>住哪里更顺</strong><small>{cityGuide.stay}</small></span></footer>
        <em><AlertTriangle/>{cityGuide.watch}</em>
      </details>
      {flowError && <div className="flow-error" role="alert">{flowError}</div>}
      {planningStatus === 'loading' && <div className="planning-progress" role="status"><span className="search-loader"/><div><strong>{planningPhase === 'places' ? '正在查找可用地点' : '正在准备路线方案'}</strong><small>最多给出 3 条方向，完成后都可以继续编辑。</small></div></div>}
      <button className="form-next" disabled={planningStatus === 'loading'} onClick={finishPreferences}>{planningStatus === 'loading' ? <><span className="search-loader"/>正在查找真实地点</> : flowMode === 'guided' ? <>生成路线方案<Sparkles/></> : '开始添加地点'}</button>
    </section>}

    {flowMode === 'manual' && step === 3 && <section className="form-stage create-stage place-planner-stage"><div className="eyebrow">REAL PLACE ANCHORS</div><h1>添加你，<br/>真正想去的地方。</h1><p className="form-lead">搜索结果来自高德地图。先选 2 个锚点就能生成路线方案，住宿可以后补。</p><div className="picker-mode"><button type="button" aria-pressed={searchMode === 'place'} className={searchMode === 'place' ? 'active' : ''} onClick={() => { setSearchMode('place'); setPlaceSearch('') }}><MapPin/>想去地点</button><button type="button" aria-pressed={searchMode === 'hotel'} className={searchMode === 'hotel' ? 'active' : ''} onClick={() => { setSearchMode('hotel'); setPlaceSearch('') }}><Home/>住宿位置</button></div><div className="searchbox planner-search"><Search/><input value={placeSearch} onChange={event => setPlaceSearch(event.target.value)} placeholder={searchMode === 'hotel' ? `搜索${city}的真实住宿` : `搜索${city}的景点、餐厅或区域`}/>{placeSearch && <button aria-label="清空搜索" onClick={() => setPlaceSearch('')}><X/></button>}</div>{searchStatus === 'loading' && <div className="search-feedback loading"><span className="search-loader"/>正在高德地图中查找“{query}”</div>}{searchStatus === 'short' && <div className="search-feedback">再输入一个字开始搜索。</div>}{searchStatus === 'error' && <div className="search-feedback error">{searchError}</div>}{searchStatus === 'complete' && results.length === 0 && <div className="search-feedback">没有找到匹配结果，试试完整名称或区县。</div>}{results.length > 0 && <div className="planner-search-results">{results.map(place => { const chosen = searchMode === 'hotel' ? hotel?.id === place.id : selectedPlaces.some(item => item.id === place.id); return <div className="planner-result-row" key={place.id}><span className={`search-thumb tone-${place.tone}`}><CategoryIcon category={place.category}/></span><span><strong>{place.name}</strong><small>高德地图 · {place.area}</small></span><button disabled={chosen} aria-label={chosen ? '已选择' : '选择地点'} onClick={() => selectSearchResult(place)}>{chosen ? <Check/> : <Plus/>}</button></div> })}</div>}{hotel && <div className="selected-hotel"><Home/><span><small>住宿位置</small><strong>{hotel.name}</strong><em>{hotel.area}</em></span><button aria-label="移除住宿" onClick={() => setHotel(null)}><X/></button></div>}<div className="selected-place-head"><span>已选路线锚点</span><strong>{selectedPlaces.length} 个</strong></div><div className="planner-selected-list">{selectedPlaces.map((place, index) => <article key={place.id}><span className="anchor-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{place.name}</strong><small>{place.area} · {place.category}</small><div className="anchor-settings"><button type="button" aria-pressed={place.priority === 'must'} className={place.priority === 'must' ? 'active' : ''} onClick={() => updateSelectedPlace(place.id, { priority: place.priority === 'must' ? 'want' : 'must' })}><Heart fill={place.priority === 'must' ? 'currentColor' : 'none'}/>{place.priority === 'must' ? '必去' : '想去'}</button><label><Clock3/>预约<input aria-label={`${place.name}预约时间`} type="time" value={place.fixed || ''} onChange={event => updateSelectedPlace(place.id, { fixed: event.target.value || undefined })}/></label></div></div><button className="remove-anchor" aria-label={`移除 ${place.name}`} onClick={() => setSelectedPlaces(items => items.filter(item => item.id !== place.id))}><X/></button></article>)}</div>{!selectedPlaces.length && <div className="planner-empty"><MapIcon/><span>搜索并选择真实地点后，它们会出现在这里。</span></div>}{flowError && <div className="flow-error" role="alert">{flowError}</div>}<div className="create-sticky-action"><span><strong>{selectedPlaces.length}</strong> 个锚点</span><button disabled={selectedPlaces.length < 2} onClick={generatePlan}>生成路线方案<Sparkles/></button></div></section>}

    {step === reviewStep && (reviewMode === 'options' ? routeChoice : routeReview)}
  </div>
}

function BottomNav({ tab, setTab }) {
  return <nav className="bottom-nav">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span><Icon size={22}/>{tab === item.id && <i aria-hidden="true"/>}</span><small>{item.label}</small></button> })}</nav>
}
