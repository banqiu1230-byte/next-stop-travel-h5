export const placesSeed = [
  {
    id: 1, name: '新疆国际大巴扎', sub: '乌鲁木齐・市集', area: '乌鲁木齐', category: '市集',
    priority: 'want', travel: 35, walk: 18, distance: 16, closes: '23:00', tone: 'ochre', x: 60, y: 72,
    mode: 'drive', road: '河滩快速路 · 团结路', fuelCost: '约 ¥18', position: [87.6168, 43.7803],
    indoor: false, nearby: 4, duration: '约 90–120 分钟', rating: 4.4, reviewCount: 12863,
    summary: '把它留作抵达乌鲁木齐后的第一站：吃点东西、补齐路上用品，也让身体适应新疆的日落时间。',
    photos: [
      'https://images.unsplash.com/photo-1528127269322-539801943592?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1518998053901-5348d3961a04?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '阿森', tag: '自驾旅行者', text: '晚上更热闹，停车后慢慢逛就好。出发前在这里补水和零食很方便。' },
      { name: '夏禾', tag: '最近去过', text: '建筑和夜景很好看，热门摊位人多，主食不用一次买太多。' }
    ]
  },
  {
    id: 2, name: '天山天池', sub: '阜康・高山湖泊', area: '昌吉', category: '自然',
    priority: 'must', travel: 95, walk: 40, distance: 92, closes: '19:30', tone: 'blue', x: 67, y: 66,
    mode: 'drive', road: '吐乌大高速 · 天池景区路', fuelCost: '约 ¥75', position: [88.1301, 43.8956],
    indoor: false, nearby: 2, duration: '约 3–4 小时', rating: 4.6, reviewCount: 36428,
    summary: '从乌鲁木齐出发的经典第一段。自驾到游客中心后换乘区间车，天气稳定时湖面和雪山层次最好。',
    photos: [
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '北北', tag: '自驾旅行者', text: '早一点进景区会从容很多，山里温差大，薄羽绒真的用得上。' },
      { name: '陈同学', tag: '最近去过', text: '游客中心换乘很清楚，湖边风大，但走到人少一点的位置很舒服。' }
    ]
  },
  {
    id: 3, name: '布尔津', sub: '阿勒泰・河畔小城', area: '布尔津', category: '住宿',
    priority: 'want', travel: 410, walk: 12, distance: 480, closes: '全天', tone: 'cream', x: 56, y: 24,
    mode: 'drive', road: 'G216 · S21 阿乌高速', fuelCost: '约 ¥320', position: [86.8749, 47.7018],
    indoor: true, nearby: 5, duration: '住一晚', rating: 4.5, reviewCount: 6850,
    summary: '北疆环线的重要落脚点。前一晚住在这里，第二天去禾木不用摸黑赶路，也方便检查油量和胎压。',
    photos: [
      'https://images.unsplash.com/photo-1528181304800-259b08848526?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: 'Kiki', tag: '自驾旅行者', text: '县城补给很方便，晚上早点休息，第二天去禾木的盘山路更轻松。' },
      { name: '老周', tag: '本地向导', text: '出城前加满油、买好水，后面服务区的选择会少很多。' }
    ]
  },
  {
    id: 4, name: '冲乎尔镇', sub: '布尔津・途中补给', area: '冲乎尔', category: '美食',
    priority: 'want', travel: 75, walk: 8, distance: 68, closes: '20:30', tone: 'ochre', x: 60, y: 20,
    mode: 'drive', road: 'G331 国道 · 沿途牧场', fuelCost: '约 ¥48', position: [87.1906, 48.0131],
    indoor: true, nearby: 2, duration: '约 45–60 分钟', rating: 4.5, reviewCount: 932,
    summary: '今天路线中的轻补给站。吃午饭、买热饮并确认剩余油量，之后再进入前往禾木的山路。',
    photos: [
      'https://images.unsplash.com/photo-1547592180-85f173990554?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1555126634-323283e090fa?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '露露', tag: '最近去过', text: '不用停太久，吃完饭把保温杯装满，后面的风景会越来越好。' },
      { name: '阿凯', tag: '自驾旅行者', text: '小镇不大但补给够用，是进山前很顺路的一次休息。' }
    ]
  },
  {
    id: 5, name: '禾木村', sub: '阿勒泰・图瓦村落', area: '禾木', category: '村落',
    priority: 'must', travel: 170, walk: 28, distance: 145, closes: '20:00', tone: 'green', x: 64, y: 13,
    mode: 'drive', road: 'S232 省道 · 盘山路段', fuelCost: '约 ¥105', position: [86.8282, 48.577],
    indoor: false, nearby: 4, duration: '约 3 小时', rating: 4.7, reviewCount: 28640,
    summary: '今天的主目的地。盘山路和换乘需要留足时间，抵达后先办理入住再散步。',
    photos: [
      'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1464278533981-50106e6176b1?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: 'Mori', tag: '风光摄影', text: '不要只赶观景台，村里沿河慢慢走的那一段反而最放松。' },
      { name: '小满', tag: '最近去过', text: '最后一段山路弯多，白天开明显更安心，行李尽量精简。' }
    ]
  },
  {
    id: 6, name: '禾木观景台', sub: '禾木・日落机位', area: '禾木', category: '观景',
    priority: 'must', travel: 35, walk: 35, distance: 8, closes: '21:00', tone: 'red', x: 67, y: 11,
    mode: 'shuttle', road: '景区接驳车 · 木栈道', fuelCost: '约 ¥20', fixed: '19:30', position: [86.8172, 48.5807],
    indoor: false, nearby: 3, duration: '约 60–90 分钟', rating: 4.8, reviewCount: 12452,
    summary: '日落是今天唯一锁定的时间锚点。车辆留在住宿区，换乘接驳车后步行上观景台，留足回程天黑时间。',
    photos: [
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '言午', tag: '自驾旅行者', text: '傍晚风很凉，拍完别拖太久，回村的接驳车会集中排队。' },
      { name: '七月', tag: '最近去过', text: '天气好时层次非常漂亮，提前半小时找位置就够了。' }
    ]
  },
  {
    id: 7, name: '喀纳斯湖', sub: '阿勒泰・高山湖泊', area: '喀纳斯', category: '自然',
    priority: 'must', travel: 120, walk: 45, distance: 78, closes: '20:00', tone: 'blue', x: 59, y: 10,
    mode: 'drive', road: '禾木公路 · 景区换乘中心', fuelCost: '约 ¥58', position: [87.0457, 48.7085],
    indoor: false, nearby: 4, duration: '约 5–6 小时', rating: 4.8, reviewCount: 48750,
    summary: '安排在禾木之后的完整一天，不和今天的日落路线硬挤。景区内以区间车和步行为主。',
    photos: [
      'https://images.unsplash.com/photo-1439853949127-fa647821eba0?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1472396961693-142e6e269027?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '青山', tag: '本地向导', text: '神仙湾、月亮湾和卧龙湾不用都停很久，按光线挑两个更舒服。' },
      { name: '鱼丸', tag: '最近去过', text: '一天留给喀纳斯刚好，别再塞进长距离赶路。' }
    ]
  },
  {
    id: 8, name: '世界魔鬼城', sub: '克拉玛依・雅丹地貌', area: '乌尔禾', category: '地貌',
    priority: 'want', travel: 240, walk: 20, distance: 285, closes: '20:30', tone: 'red', x: 45, y: 43,
    mode: 'drive', road: 'G217 国道 · 奎阿高速', fuelCost: '约 ¥190', position: [85.7398, 46.1327],
    indoor: false, nearby: 1, duration: '约 2–3 小时', rating: 4.5, reviewCount: 22174,
    summary: '北疆环线向南回程时顺路安排，适合傍晚进入。大风或沙尘天气下建议缩短停留。',
    photos: [
      'https://images.unsplash.com/photo-1509316785289-025f5b846b35?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: 'Leon', tag: '自驾旅行者', text: '夕阳颜色最好，但回程不要太晚，风大时车门要扶稳。' },
      { name: '栗子', tag: '最近去过', text: '景区小火车省体力，带好防晒和水就行。' }
    ]
  },
  {
    id: 9, name: '赛里木湖', sub: '博州・环湖公路', area: '博尔塔拉', category: '自然',
    priority: 'must', travel: 330, walk: 24, distance: 430, closes: '21:00', tone: 'blue', x: 15, y: 73,
    mode: 'drive', road: '连霍高速 · 赛里木湖环湖路', fuelCost: '约 ¥285', position: [81.1506, 44.6112],
    indoor: false, nearby: 3, duration: '约 5–6 小时', rating: 4.8, reviewCount: 40219,
    summary: '长距离转场后的重点停留。建议住一晚再环湖，不把四百多公里车程和完整环湖压在同一天。',
    photos: [
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1439853949127-fa647821eba0?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '安安', tag: '自驾旅行者', text: '环湖别追求每个点都停，挑两三处慢慢坐一会儿更值。' },
      { name: '白杨', tag: '最近去过', text: '湖边天气变化快，冲锋衣和墨镜都会用上。' }
    ]
  },
  {
    id: 10, name: '独山子大峡谷', sub: '克拉玛依・峡谷', area: '独山子', category: '地貌',
    priority: 'optional', travel: 165, walk: 35, distance: 220, closes: '19:30', tone: 'violet', x: 36, y: 77,
    mode: 'drive', road: '连霍高速 · 独库公路北段', fuelCost: '约 ¥145', position: [84.8273, 44.3198],
    indoor: false, nearby: 2, duration: '约 2 小时', rating: 4.6, reviewCount: 15306,
    summary: '作为回乌鲁木齐前的弹性停靠点。若当天车程过长或天气不好，可以无负担跳过。',
    photos: [
      'https://images.unsplash.com/photo-1533130061792-64b345e4a833?q=82&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1509316785289-025f5b846b35?q=82&w=1200&auto=format&fit=crop'
    ],
    reviews: [
      { name: '何川', tag: '自驾旅行者', text: '两个小时足够，不建议为了赶这里压缩前一段休息时间。' },
      { name: 'Miya', tag: '最近去过', text: '峡谷边风大，正常观景很好走，注意防晒。' }
    ]
  }
]

function previewPlace({ id, name, sub, area, category, priority = 'want', closes, tone, x, y, position, indoor = true, rating, photo }) {
  return {
    id, name, sub, area, category, priority, closes, tone, x, y, position, indoor, rating,
    travel: 28, walk: 24, nearby: 2, duration: '约 60–90 分钟', reviewCount: 860,
    summary: `这是${area}一带值得留给旅行当天慢慢体验的地点，适合和附近地点安排在同一天。`,
    photos: [photo, photo],
    reviews: [
      { name: 'Lulu', tag: '最近去过', text: '位置很好找，建议避开最拥挤的时段，体验会轻松很多。' },
      { name: 'Kai', tag: '旅行者', text: '周边也很适合散步，可以和附近地点安排在同一段路线里。' }
    ]
  }
}

export const placesByTripSeed = {
  xinjiang: placesSeed,
  dali: [
    previewPlace({ id: 101, name: '洱海生态廊道', sub: '大理・洱海', area: '洱海', category: '自然', priority: 'must', closes: '20:00', tone: 'blue', x: 65, y: 46, position: [100.236, 25.706], indoor: false, rating: 4.7, photo: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=82&w=1200&auto=format&fit=crop' }),
    previewPlace({ id: 102, name: '喜洲古镇', sub: '大理・古镇', area: '喜洲', category: '古镇', priority: 'must', closes: '19:00', tone: 'ochre', x: 48, y: 30, position: [100.132, 25.852], indoor: false, rating: 4.6, photo: 'https://images.unsplash.com/photo-1528127269322-539801943592?q=82&w=1200&auto=format&fit=crop' }),
    previewPlace({ id: 103, name: '苍山感通索道', sub: '大理・苍山', area: '苍山', category: '自然', closes: '17:00', tone: 'green', x: 30, y: 58, position: [100.126, 25.608], indoor: false, rating: 4.5, photo: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=82&w=1200&auto=format&fit=crop' })
  ],
  chengdu: [
    previewPlace({ id: 201, name: '成都大熊猫繁育基地', sub: '成华・熊猫基地', area: '成华', category: '景点', priority: 'must', closes: '17:30', tone: 'green', x: 64, y: 24, position: [104.147, 30.738], indoor: false, rating: 4.7, photo: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?q=82&w=1200&auto=format&fit=crop' }),
    previewPlace({ id: 202, name: '人民公园', sub: '青羊・鹤鸣茶社', area: '青羊', category: '慢游', closes: '22:00', tone: 'ochre', x: 42, y: 55, position: [104.055, 30.657], rating: 4.5, photo: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?q=82&w=1200&auto=format&fit=crop' }),
    previewPlace({ id: 203, name: '望平街', sub: '锦江・河畔街区', area: '锦江', category: '美食', closes: '23:00', tone: 'red', x: 57, y: 68, position: [104.093, 30.653], rating: 4.4, photo: 'https://images.unsplash.com/photo-1555126634-323283e090fa?q=82&w=1200&auto=format&fit=crop' })
  ]
}

export const conditionMeta = {
  rain: { label: '下雨了', hint: '减少室外步行，优先室内地点', preview: '优先室内地点，并减少室外步行' },
  tired: { label: '我累了', hint: '减少移动和停留，优先休息', preview: '缩短移动距离，减少今天的体力消耗' },
  hungry: { label: '我饿了', hint: '先安排附近用餐，再继续路线', preview: '把附近用餐或补给放到前面' },
  late: { label: '出发晚了', hint: '压缩路线，保留预约与必去', preview: '压缩可选地点，优先保留预约和必去' },
  skip: { label: '不想去了', hint: '暂时跳过，放到今天最后', preview: '把当前地点移到今天最后' },
  closed: { label: '临时关闭', hint: '移除当前地点并衔接下一站', preview: '移除当前地点并衔接下一站' }
}

export const initialPlan = [3, 4, 5, 6]

export function formatTravelTime(minutes) {
  if (!Number.isFinite(minutes)) return '时间待定'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function sortForCondition(ids, places, condition, lockedIds = []) {
  const placeMap = new Map(places.map(place => [place.id, place]))
  const movable = ids.filter(id => !lockedIds.includes(id))
  movable.sort((a, b) => {
    const pa = placeMap.get(a)
    const pb = placeMap.get(b)
    if (!pa || !pb) return 0
    if (condition === 'hungry') return Number(['美食', '餐厅'].includes(pb.category)) - Number(['美食', '餐厅'].includes(pa.category)) || pa.travel - pb.travel
    if (condition === 'tired' || condition === 'rain') return pa.travel - pb.travel
    if (condition === 'late') return Number(pb.priority === 'must') - Number(pa.priority === 'must') || pa.travel - pb.travel
    return Number(pb.priority === 'must') - Number(pa.priority === 'must') || pa.travel - pb.travel
  })
  return ids.map(id => lockedIds.includes(id) ? id : movable.shift())
}

export function clockToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 9 * 60
}

export function formatClockMinutes(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function durationToMinutes(value) {
  const text = String(value || '')
  const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0])).filter(Number.isFinite)
  if (!values.length) return 90
  const average = values.reduce((sum, item) => sum + item, 0) / values.length
  return /小时/.test(text) ? Math.round(average * 60) : Math.round(average)
}

export function closingTimeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null
}

export function placeDistance(a, b) {
  if (!a?.position || !b?.position) return Number.POSITIVE_INFINITY
  const toRad = value => value * Math.PI / 180
  const [lng1, lat1] = a.position
  const [lng2, lat2] = b.position
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const value = Math.min(1, Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2)
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function transferReserveMinutes(origin, destination, transport = 'public') {
  const distanceKm = placeDistance(origin, destination)
  if (!Number.isFinite(distanceKm)) return transport === 'walk' ? 20 : transport === 'drive' ? 25 : 35
  if (transport === 'walk') return Math.max(10, Math.min(180, Math.ceil((distanceKm / 4.2 * 60) / 5) * 5))
  if (transport === 'drive') return Math.max(15, Math.min(240, Math.ceil((12 + distanceKm * 1.35) / 5) * 5))
  return Math.max(20, Math.min(120, Math.ceil((18 + distanceKm * 4) / 5) * 5))
}

export function scheduleRuntimeStop(cursor, travelMinutes, place, appointmentBuffer = 20) {
  const earliestArrival = cursor + travelMinutes
  const appointment = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
  const canMeetAppointment = appointment !== null && earliestArrival <= appointment
  const departure = canMeetAppointment ? Math.max(cursor, appointment - appointmentBuffer - travelMinutes) : cursor
  const arrival = departure + travelMinutes
  const visitStart = appointment !== null && arrival <= appointment ? appointment : arrival
  const leave = visitStart + durationToMinutes(place.duration)
  return { departure, arrival, visitStart, leave, appointment }
}

export function runtimeStopIssue(place, { arrival, leave, now }) {
  const appointment = /^\d{1,2}:\d{2}$/.test(String(place.fixed || '')) ? clockToMinutes(place.fixed) : null
  if (appointment !== null && now >= appointment) return { code: 'appointment-passed', title: `${place.fixed} 预约已过`, detail: '当天无法再按原预约执行' }
  if (appointment !== null && arrival > appointment) return { code: 'appointment-late', title: `预计赶不上 ${place.fixed} 预约`, detail: '需要移出当天或调整整段行程' }
  const closing = closingTimeToMinutes(place.closes)
  if (closing !== null && arrival >= closing) return { code: 'closed-before-arrival', title: '预计到达时已闭馆', detail: `${place.closes} 关闭，当天不建议再去` }
  if (closing !== null && leave > closing) return { code: 'closing-short', title: '当天可游览时间不足', detail: `预计结束晚于 ${place.closes} 闭馆` }
  if (leave > 22 * 60 + 30) return { code: 'day-overflow', title: '当天时间不足', detail: `预计 ${formatClockMinutes(leave)} 结束` }
  return null
}

export function buildRuntimeDayStatus({ ids, places, visitedIds = [], clock, stage = 'ready', condition = '', energy = 'normal', transportMode = 'public', origin = null }) {
  const placeMap = new Map(places.map(place => [place.id, place]))
  const now = clockToMinutes(clock)
  let cursor = now + (stage === 'ready' ? 5 : 0)
  let blocked = false
  let previousPlace = origin
  return ids.map(id => {
    const place = placeMap.get(id)
    if (!place) return { id, missing: true }
    if (visitedIds.includes(id)) {
      if (!origin) previousPlace = place
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

export function validateConditionPreview({ preview, ids, places, condition, lockedIds = [], visitedIds = [], clock, energy = 'normal', transportMode = 'public', origin = null }) {
  const nextPlan = preview.nextPlan || ids
  const preservedIds = ids.filter(id => visitedIds.includes(id) || lockedIds.includes(id) || places.some(place => place.id === id && place.fixed))
  const removedProtected = preservedIds.filter(id => !nextPlan.includes(id))
  const conflicts = buildRuntimeDayStatus({ ids: nextPlan, places, visitedIds, clock, condition, energy, transportMode, origin }).filter(status => status.issue)
  removedProtected.forEach(id => conflicts.push({ id, place: places.find(place => place.id === id), issue: { code: 'protected-removed', title: '预约或锁定地点需要保留', detail: '请进入路线编辑，单独确认删除或跨天调整。' } }))
  const unverified = nextPlan.filter(id => !visitedIds.includes(id)).map(id => places.find(place => place.id === id)).filter(place => place && !place.openingVerifiedAt && (!place.closes || place.closes === '待确认'))
  const changed = ids.length !== nextPlan.length || ids.some((id, index) => nextPlan[index] !== id)
  const hasAdjustment = changed || ['rain', 'tired', 'hungry'].includes(condition)
  return { ...preview, nextPlan, nextId: nextPlan.find(id => !visitedIds.includes(id)) ?? null, conflicts, unverified, changed, canApply: !conflicts.length && hasAdjustment }
}

export function previewConditionChange({ ids, places, condition, lockedIds = [], visitedIds = [], currentId, clock, energy, transportMode, origin }) {
  const completed = ids.filter(id => visitedIds.includes(id))
  const originalFuture = ids.filter(id => !visitedIds.includes(id))
  let future = [...originalFuture]

  if (condition === 'closed') future = future.filter(id => id !== currentId)
  else if (condition === 'skip' && future.length > 1) future = [...future.filter(id => id !== currentId), currentId]
  else future = sortForCondition(future, places, condition, lockedIds)

  const placeMap = new Map(places.map(place => [place.id, place]))
  const currentName = placeMap.get(currentId)?.name || '当前地点'
  const nextName = placeMap.get(future[0])?.name || '今天没有下一站'
  const movedCount = future.filter((id, index) => originalFuture[index] !== id).length
  const keptLocked = future.filter(id => lockedIds.includes(id)).length
  const changes = []

  if (condition === 'closed') changes.push(`移除「${currentName}」`)
  else if (condition === 'skip') changes.push(`把「${currentName}」移到今天最后`)
  else if (movedCount > 0) changes.push(`调整 ${movedCount} 个地点的先后顺序`)
  else changes.push('当前顺序不需要改变')
  changes.push(future.length ? `调整后下一站：${nextName}` : '调整后今天没有待去地点')
  if (keptLocked > 0) changes.push(`保留 ${keptLocked} 个预约或锁定地点`)

  const preview = { nextPlan: [...completed, ...future], nextId: future[0] || null, changes }
  return clock ? validateConditionPreview({ preview, ids, places, condition, lockedIds, visitedIds, clock, energy, transportMode, origin }) : preview
}

export function getTransport(place, condition, energy, preferredMode) {
  const effectiveMode = place.mode === 'shuttle' ? 'shuttle' : preferredMode || place.mode
  if (effectiveMode === 'drive' || effectiveMode === 'shuttle') {
    const hasTravelTime = Number.isFinite(place.travel)
    const needsLiveRoute = place.source === 'amap'
    const drive = {
      id: 'drive', label: '自驾', minutes: hasTravelTime ? place.travel : null, cost: needsLiveRoute ? '待导航' : (place.fuelCost || '按实际油耗'),
      route: `${place.distance || '--'} 公里 · ${place.road || '按导航路线行驶'}`
    }
    const charter = {
      id: 'charter', label: '包车', minutes: hasTravelTime ? place.travel + 15 : null, cost: needsLiveRoute ? '待询价' : '约 ¥600 起',
      route: '司机接送 · 可在安全位置临时停靠'
    }
    const shuttle = {
      id: 'shuttle', label: '景区接驳', minutes: hasTravelTime ? place.travel : null, cost: '以景区为准',
      route: place.road || '换乘中心上车 · 按景区线路运行'
    }

    let recommended = effectiveMode === 'shuttle' ? shuttle : drive
    let reason = effectiveMode === 'shuttle' ? '景区内限制自驾，换乘接驳最稳妥' : '路线已结合里程、路况和补给点安排'
    if (condition === 'rain') reason = '有降水，已预留更宽松的安全车程'
    if ((condition === 'tired' || energy === 'low') && effectiveMode !== 'shuttle') reason = '你现在有点累，建议先休息，恢复后再开车'
    if (condition === 'hungry') reason = '先在顺路补给点停下，吃完再继续赶路'
    const alternatives = []
    return { recommended, reason, alternatives: alternatives.filter(item => item.id !== recommended.id) }
  }

  const hasTravelTime = Number.isFinite(place.travel)
  const hasWalkTime = Number.isFinite(place.walk)
  const needsLiveRoute = place.source === 'amap'
  const transit = {
    id: 'transit', label: '公共交通', minutes: hasTravelTime ? place.travel : null, cost: needsLiveRoute ? '待导航' : '约 ¥8',
    route: '打开高德后查看当前公交路线'
  }
  const walk = {
    id: 'walk', label: '步行', minutes: hasWalkTime ? place.walk : null, cost: '免费',
    route: '沿主街慢慢走，途中可以随时停下休息'
  }
  const taxi = {
    id: 'taxi', label: '出租车', minutes: hasTravelTime ? Math.max(6, place.travel - 4) : null, cost: needsLiveRoute ? '待叫车' : '约 ¥35',
    route: '直接到地点入口附近，价格以实时计价为准'
  }
  let recommended = hasWalkTime && place.walk <= 10 ? walk : transit
  let reason = hasWalkTime && place.walk <= 10 ? '距离很近，走过去最省事' : needsLiveRoute ? '出发前确认路况和路线' : '时间稳定，也不用走太久'
  if (condition === 'rain') { recommended = transit; reason = '现在有雨，尽量减少室外步行' }
  if (condition === 'tired' || energy === 'low') { recommended = taxi; reason = '你现在有点累，先把体力留给目的地' }
  if (condition === 'hungry') { recommended = transit; reason = '更快到达，先解决吃饭这件事' }
  return { recommended, reason, alternatives: [transit, walk, taxi].filter(item => item.id !== recommended.id) }
}
