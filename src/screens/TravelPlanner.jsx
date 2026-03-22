import { useState, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const SAMPLE_ITINERARIES = {
  beach: {
    destination: 'Maui, Hawaii',
    days: [
      { day: 1, title: 'Arrival & Beach Day', activities: [
        { text: 'Check in at resort', cost: 0 },
        { text: "Ka'anapali Beach sunset", cost: 0 },
        { text: "Dinner at Mama's Fish House", cost: 120 },
      ]},
      { day: 2, title: 'Road to Hana', activities: [
        { text: 'Drive the Road to Hana', cost: 40 },
        { text: 'Bamboo Forest hike', cost: 0 },
        { text: 'Black Sand Beach', cost: 0 },
        { text: 'Waterfall swimming', cost: 0 },
      ]},
      { day: 3, title: 'Snorkeling & Culture', activities: [
        { text: 'Molokini Crater snorkeling', cost: 150 },
        { text: 'Lahaina Town exploration', cost: 30 },
        { text: 'Luau dinner show', cost: 180 },
      ]},
      { day: 4, title: 'Adventure Day', activities: [
        { text: 'Haleakala sunrise', cost: 30 },
        { text: 'Zip-lining', cost: 160 },
        { text: 'Spa afternoon', cost: 200 },
        { text: 'Farm-to-table dinner', cost: 95 },
      ]},
      { day: 5, title: 'Departure', activities: [
        { text: 'Morning beach walk', cost: 0 },
        { text: 'Souvenir shopping', cost: 100 },
        { text: 'Airport transfer', cost: 45 },
      ]},
    ],
    packing: ['Sunscreen SPF 50+', 'Swimwear', 'Hiking shoes', 'Snorkel gear', 'Light layers', 'Camera', 'Beach towel'],
    budget: '$4,500',
  },
  city: {
    destination: 'Tokyo, Japan',
    days: [
      { day: 1, title: 'Arrival & Shibuya', activities: [
        { text: 'Check in at Shinjuku hotel', cost: 0 },
        { text: 'Shibuya Crossing', cost: 0 },
        { text: 'Ramen dinner in Golden Gai', cost: 25 },
      ]},
      { day: 2, title: 'Traditional Tokyo', activities: [
        { text: 'Senso-ji Temple', cost: 0 },
        { text: 'Meiji Shrine', cost: 0 },
        { text: 'Harajuku street fashion', cost: 80 },
        { text: 'Sushi workshop', cost: 120 },
      ]},
      { day: 3, title: 'Tech & Pop Culture', activities: [
        { text: 'Akihabara electronics district', cost: 50 },
        { text: 'TeamLab Borderless', cost: 32 },
        { text: 'Robot Restaurant', cost: 80 },
        { text: 'Karaoke night', cost: 30 },
      ]},
      { day: 4, title: 'Day Trip: Mt. Fuji', activities: [
        { text: 'Bullet train to Hakone', cost: 70 },
        { text: 'Mt. Fuji viewpoint', cost: 0 },
        { text: 'Hot springs onsen', cost: 45 },
        { text: 'Return to Tokyo', cost: 70 },
      ]},
      { day: 5, title: 'Markets & Departure', activities: [
        { text: 'Tsukiji Outer Market', cost: 40 },
        { text: 'Last-minute shopping', cost: 100 },
        { text: 'Airport express', cost: 35 },
      ]},
    ],
    packing: ['Comfortable walking shoes', 'Power adapter', 'Pocket WiFi', 'Rail pass', 'Light jacket', 'Umbrella', 'Cash (yen)'],
    budget: '$5,200',
  },
  adventure: {
    destination: 'Costa Rica',
    days: [
      { day: 1, title: 'San Jose Arrival', activities: [
        { text: 'Airport pickup', cost: 35 },
        { text: 'Explore San Jose', cost: 20 },
        { text: 'Local dinner & craft beer', cost: 30 },
      ]},
      { day: 2, title: 'Arenal Volcano', activities: [
        { text: 'Drive to La Fortuna', cost: 50 },
        { text: 'Arenal Volcano hike', cost: 65 },
        { text: 'Hot springs evening', cost: 45 },
        { text: 'Wildlife spotting', cost: 0 },
      ]},
      { day: 3, title: 'Rainforest Adventure', activities: [
        { text: 'Zip-lining through canopy', cost: 85 },
        { text: 'White water rafting', cost: 95 },
        { text: 'Hanging bridges walk', cost: 26 },
        { text: 'Night jungle tour', cost: 45 },
      ]},
      { day: 4, title: 'Pacific Coast', activities: [
        { text: 'Drive to Manuel Antonio', cost: 50 },
        { text: 'Beach time', cost: 0 },
        { text: 'National Park hike', cost: 16 },
        { text: 'Surfing lesson', cost: 60 },
      ]},
      { day: 5, title: 'Departure', activities: [
        { text: 'Morning monkey watching', cost: 0 },
        { text: 'Souvenir market', cost: 40 },
        { text: 'Transfer to airport', cost: 50 },
      ]},
    ],
    packing: ['Bug spray', 'Rain jacket', 'Hiking boots', 'Swimwear', 'Binoculars', 'Dry bag', 'Sunscreen'],
    budget: '$3,800',
  },
}

// Normalize activities: support both string[] and {text,cost}[] formats
function normalizeActivities(activities) {
  if (!activities || !activities.length) return []
  return activities.map(a => {
    if (typeof a === 'string') return { text: a, cost: 0 }
    if (a && typeof a === 'object' && a.text !== undefined) return { text: a.text, cost: a.cost || 0 }
    return { text: String(a), cost: 0 }
  })
}

function normalizeItinerary(itin) {
  if (!itin || !itin.days) return itin
  return {
    ...itin,
    days: itin.days.map(day => ({
      ...day,
      activities: normalizeActivities(day.activities),
    })),
  }
}

// Parse budget string like "$4,500" to number
function parseBudget(b) {
  if (typeof b === 'number') return b
  if (!b) return 0
  const n = parseFloat(String(b).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

// Weather code to description
const WEATHER_LABELS = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Moderate showers', 82: 'Violent showers', 95: 'Thunderstorm',
}
function weatherLabel(code) { return WEATHER_LABELS[code] || 'Unknown' }
function weatherIcon(code) {
  if (code <= 1) return '\u2600' // sun
  if (code <= 3) return '\u26C5' // partly cloudy
  if (code <= 48) return '\uD83C\uDF2B' // fog
  if (code <= 55) return '\uD83C\uDF27' // drizzle
  if (code <= 65) return '\uD83C\uDF27' // rain
  if (code <= 75) return '\u2744' // snow
  if (code <= 82) return '\uD83C\uDF26' // showers
  return '\u26A1' // thunderstorm
}

export default function TravelPlanner({ user, addMemory }) {
  const [trips, setTrips] = useState(() => loadState('trips', []))
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeTrip, setActiveTrip] = useState(null)
  const [tripForm, setTripForm] = useState({
    destination: '', startDate: '', endDate: '', travelers: '2',
    style: 'mixed', interests: [], budget: 'moderate',
  })

  // Edit state
  const [editingActivity, setEditingActivity] = useState(null) // {dayIdx, actIdx}
  const [editText, setEditText] = useState('')
  const [editCost, setEditCost] = useState('')

  // Weather state
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Packing checklist state
  const [checkedItems, setCheckedItems] = useState(() => loadState('packing_checked', {}))
  const [newPackingItem, setNewPackingItem] = useState('')

  // Calendar state
  const [calendarAdded, setCalendarAdded] = useState(false)
  const [calendarAdding, setCalendarAdding] = useState(false)

  useEffect(() => {
    db.trips.list().then(data => {
      if (data.length > 0) { setTrips(data); saveState('trips', data) }
    }).catch(() => {})
  }, [])

  const save = (t) => {
    setTrips(t)
    saveState('trips', t)
  }

  // Update a specific trip in both state and storage
  const updateTrip = useCallback((updatedTrip) => {
    setActiveTrip(updatedTrip)
    const newTrips = trips.map(t => t.id === updatedTrip.id ? updatedTrip : t)
    save(newTrips)
    db.trips.update?.(updatedTrip).catch?.(() => {})
  }, [trips])

  const INTERESTS = ['Beach', 'Hiking', 'Food', 'Culture', 'Nightlife', 'Shopping', 'Adventure', 'Relaxation']

  const generateTrip = async () => {
    setGenerating(true)
    try {
      const itinerary = await db.ai.travel({
        destination: tripForm.destination,
        startDate: tripForm.startDate,
        endDate: tripForm.endDate,
        travelers: tripForm.travelers,
        style: tripForm.style,
        interests: tripForm.interests,
        budget: tripForm.budget,
      })

      if (itinerary.error) throw new Error(itinerary.error)

      const normalized = normalizeItinerary(itinerary)
      const trip = {
        id: Date.now(),
        ...tripForm,
        destination: normalized.destination || tripForm.destination,
        itinerary: normalized,
        createdAt: new Date().toISOString(),
        status: 'planned',
      }
      save([trip, ...trips])
      db.trips.create(trip).catch(() => {})
      setActiveTrip(trip)
      setPlanning(false)
      setCalendarAdded(false)
      setWeather(null)
      addMemory(`AI planned trip to ${trip.destination}`)
    } catch {
      // Fallback to sample
      const styles = Object.keys(SAMPLE_ITINERARIES)
      const style = styles[Math.floor(Math.random() * styles.length)]
      const sample = SAMPLE_ITINERARIES[style]
      const trip = {
        id: Date.now(), ...tripForm,
        destination: tripForm.destination || sample.destination,
        itinerary: normalizeItinerary(sample), createdAt: new Date().toISOString(), status: 'planned',
      }
      save([trip, ...trips])
      setActiveTrip(trip)
      setPlanning(false)
      setCalendarAdded(false)
      setWeather(null)
    }
    setGenerating(false)
  }

  const toggleInterest = (interest) => {
    setTripForm(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest],
    }))
  }

  // --- WEATHER FORECAST ---
  const fetchWeather = async (destination) => {
    setWeatherLoading(true)
    try {
      const city = destination.split(',')[0].trim()
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)
      const geoData = await geoRes.json()
      if (!geoData.results || !geoData.results.length) throw new Error('Location not found')
      const { latitude, longitude } = geoData.results[0]
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit`
      )
      const forecastData = await forecastRes.json()
      setWeather(forecastData.daily)
    } catch {
      setWeather(null)
    }
    setWeatherLoading(false)
  }

  // --- EDIT ITINERARY ---
  const startEditActivity = (dayIdx, actIdx, activity) => {
    setEditingActivity({ dayIdx, actIdx })
    setEditText(activity.text)
    setEditCost(String(activity.cost || 0))
  }

  const saveEditActivity = () => {
    if (!editingActivity || !activeTrip) return
    const { dayIdx, actIdx } = editingActivity
    const newItin = { ...activeTrip.itinerary }
    const newDays = [...newItin.days]
    const newDay = { ...newDays[dayIdx] }
    const newActs = [...newDay.activities]
    newActs[actIdx] = { text: editText.trim() || newActs[actIdx].text, cost: parseFloat(editCost) || 0 }
    newDay.activities = newActs
    newDays[dayIdx] = newDay
    newItin.days = newDays
    updateTrip({ ...activeTrip, itinerary: newItin })
    setEditingActivity(null)
  }

  const deleteActivity = (dayIdx, actIdx) => {
    if (!activeTrip) return
    const newItin = { ...activeTrip.itinerary }
    const newDays = [...newItin.days]
    const newDay = { ...newDays[dayIdx] }
    newDay.activities = newDay.activities.filter((_, i) => i !== actIdx)
    newDays[dayIdx] = newDay
    newItin.days = newDays
    updateTrip({ ...activeTrip, itinerary: newItin })
  }

  const moveActivity = (dayIdx, actIdx, direction) => {
    if (!activeTrip) return
    const newItin = { ...activeTrip.itinerary }
    const newDays = [...newItin.days]
    const newDay = { ...newDays[dayIdx] }
    const newActs = [...newDay.activities]
    const target = actIdx + direction
    if (target < 0 || target >= newActs.length) return
    ;[newActs[actIdx], newActs[target]] = [newActs[target], newActs[actIdx]]
    newDay.activities = newActs
    newDays[dayIdx] = newDay
    newItin.days = newDays
    updateTrip({ ...activeTrip, itinerary: newItin })
  }

  // --- ADD TO CALENDAR ---
  const addToCalendar = async () => {
    if (!activeTrip) return
    setCalendarAdding(true)
    const itin = activeTrip.itinerary
    const startDate = activeTrip.startDate
    try {
      for (let i = 0; i < itin.days.length; i++) {
        const day = itin.days[i]
        let eventDate = ''
        if (startDate) {
          const d = new Date(startDate)
          d.setDate(d.getDate() + i)
          eventDate = d.toISOString().split('T')[0]
        }
        for (const act of day.activities) {
          await db.events.create({
            title: `[Trip] ${act.text}`,
            date: eventDate,
            time: '',
            location: itin.destination || '',
            notes: `Day ${day.day}: ${day.title} | Est. cost: $${act.cost || 0}`,
          })
        }
      }
      setCalendarAdded(true)
      addMemory(`Added ${itin.destination} trip to calendar`)
    } catch {
      // silent fail
    }
    setCalendarAdding(false)
  }

  // --- PACKING CHECKLIST ---
  const togglePackingItem = (item) => {
    const tripKey = activeTrip ? `trip_${activeTrip.id}` : 'default'
    const newChecked = { ...checkedItems }
    if (!newChecked[tripKey]) newChecked[tripKey] = {}
    newChecked[tripKey][item] = !newChecked[tripKey][item]
    setCheckedItems(newChecked)
    saveState('packing_checked', newChecked)
  }

  const isPackingChecked = (item) => {
    const tripKey = activeTrip ? `trip_${activeTrip.id}` : 'default'
    return checkedItems[tripKey]?.[item] || false
  }

  const addPackingItem = () => {
    if (!newPackingItem.trim() || !activeTrip) return
    const newItin = { ...activeTrip.itinerary }
    newItin.packing = [...(newItin.packing || []), newPackingItem.trim()]
    updateTrip({ ...activeTrip, itinerary: newItin })
    setNewPackingItem('')
  }

  const removePackingItem = (item) => {
    if (!activeTrip) return
    const newItin = { ...activeTrip.itinerary }
    newItin.packing = (newItin.packing || []).filter(p => p !== item)
    updateTrip({ ...activeTrip, itinerary: newItin })
  }

  // --- COST TRACKING ---
  const getTotalCost = (itin) => {
    if (!itin || !itin.days) return 0
    return itin.days.reduce((sum, day) => {
      return sum + day.activities.reduce((s, a) => s + (a.cost || 0), 0)
    }, 0)
  }

  // --- TRIP COUNTDOWN ---
  const getCountdown = (startDate) => {
    if (!startDate) return null
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24))
    return diff
  }

  // ==================== ACTIVE TRIP DETAIL VIEW ====================
  if (activeTrip) {
    const itin = normalizeItinerary(activeTrip.itinerary)
    const totalCost = getTotalCost(itin)
    const budgetNum = parseBudget(itin.budget)
    const budgetPct = budgetNum > 0 ? Math.min((totalCost / budgetNum) * 100, 100) : 0
    const packingItems = itin.packing || []
    const checkedCount = packingItems.filter(p => isPackingChecked(p)).length
    const packingPct = packingItems.length > 0 ? Math.round((checkedCount / packingItems.length) * 100) : 0
    const countdown = getCountdown(activeTrip.startDate)

    return (
      <div style={{ padding: 16 }}>
        <button onClick={() => { setActiveTrip(null); setWeather(null); setCalendarAdded(false) }} style={{
          background: 'none', border: 'none', color: colors.primaryLight, fontSize: 14,
          cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit', padding: '12px 16px', minHeight: 44,
        }}>&#8249; Back to Trips</button>

        <h2 style={{ color: colors.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {itin.destination}
        </h2>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: colors.textSecondary, fontSize: 12 }}>{itin.days.length} days</span>
          <span style={{ color: colors.success, fontSize: 12 }}>Budget: {itin.budget}</span>
          {activeTrip.startDate && (
            <span style={{ color: colors.textMuted, fontSize: 12 }}>{activeTrip.startDate} to {activeTrip.endDate}</span>
          )}
        </div>

        {/* MISSION COUNTDOWN */}
        {countdown !== null && (
          <div style={{
            padding: 14, marginBottom: 16,
            background: countdown > 0
              ? `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)`
              : countdown === 0 ? `linear-gradient(135deg, ${colors.success}22, ${colors.success}08)`
              : `${colors.surfaceLight}`,
            border: `1px solid ${countdown > 0 ? colors.primary : countdown === 0 ? colors.success : colors.border}40`,
            borderRadius: 12, textAlign: 'center',
          }}>
            <div style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
              MISSION COUNTDOWN
            </div>
            {countdown > 0 ? (
              <>
                <div style={{ color: colors.primaryLight, fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{countdown}</div>
                <div style={{ color: colors.textSecondary, fontSize: 11 }}>day{countdown !== 1 ? 's' : ''} until deployment</div>
              </>
            ) : countdown === 0 ? (
              <div style={{ color: colors.success, fontSize: 16, fontWeight: 700 }}>MISSION IS ACTIVE -- GO TIME</div>
            ) : (
              <div style={{ color: colors.textMuted, fontSize: 13, fontWeight: 500 }}>Mission completed {Math.abs(countdown)} day{Math.abs(countdown) !== 1 ? 's' : ''} ago</div>
            )}
          </div>
        )}

        {/* ACTION BUTTONS ROW */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={addToCalendar} disabled={calendarAdded || calendarAdding} style={{
            flex: 1, minWidth: 130, padding: '12px 16px', background: calendarAdded ? `${colors.success}20` : colors.gradient1,
            color: calendarAdded ? colors.success : '#fff', border: `1px solid ${calendarAdded ? colors.success : colors.primary}40`,
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: calendarAdded ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>
            {calendarAdding ? 'Syncing...' : calendarAdded ? 'Added to Calendar' : 'Add to Calendar'}
          </button>
          <button onClick={() => fetchWeather(itin.destination)} disabled={weatherLoading} style={{
            flex: 1, minWidth: 130, padding: '12px 16px', background: colors.gradient3,
            color: '#fff', border: `1px solid ${colors.secondary}40`, borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>
            {weatherLoading ? 'Scanning...' : 'Weather Recon'}
          </button>
        </div>

        {/* WEATHER FORECAST */}
        {weather && weather.time && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              WEATHER RECON -- {itin.destination.split(',')[0].toUpperCase()}
            </h3>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
              {weather.time.slice(0, 7).map((date, i) => (
                <div key={date} style={{
                  minWidth: 80, padding: '10px 8px', background: colors.surfaceLight,
                  border: `1px solid ${colors.border}`, borderRadius: 10, textAlign: 'center', flexShrink: 0,
                }}>
                  <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600 }}>
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 22, margin: '4px 0' }}>{weatherIcon(weather.weathercode[i])}</div>
                  <div style={{ color: colors.primaryLight, fontSize: 13, fontWeight: 700 }}>
                    {Math.round(weather.temperature_2m_max[i])}F
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>
                    {Math.round(weather.temperature_2m_min[i])}F
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                    {weatherLabel(weather.weathercode[i])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COST TRACKING SUMMARY */}
        <div style={{
          padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          borderRadius: 12, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>COST ANALYSIS</span>
            <span style={{ color: colors.text, fontSize: 14, fontWeight: 700 }}>
              ${totalCost.toLocaleString()} <span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 400 }}>/ {itin.budget}</span>
            </span>
          </div>
          <div style={{
            height: 8, background: `${colors.border}`, borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
              width: `${budgetPct}%`,
              background: budgetPct > 90 ? colors.danger : budgetPct > 70 ? colors.warning : colors.success,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: colors.textMuted, fontSize: 11 }}>{Math.round(budgetPct)}% utilized</span>
            <span style={{ color: budgetNum - totalCost >= 0 ? colors.success : colors.danger, fontSize: 11, fontWeight: 600 }}>
              {budgetNum - totalCost >= 0 ? `$${(budgetNum - totalCost).toLocaleString()} remaining` : `$${Math.abs(budgetNum - totalCost).toLocaleString()} over budget`}
            </span>
          </div>
        </div>

        {/* ITINERARY */}
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          MISSION ITINERARY
          <span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 400, marginLeft: 8 }}>tap activity to edit</span>
        </h3>
        {itin.days.map((day, dayIdx) => {
          const dayCost = day.activities.reduce((s, a) => s + (a.cost || 0), 0)
          return (
            <div key={day.day} style={{
              padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 10, borderLeft: `3px solid ${colors.primary}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                <div>
                  <span style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600 }}>DAY {day.day}</span>
                  <span style={{ color: colors.text, fontSize: 13, fontWeight: 500, marginLeft: 10 }}>{day.title}</span>
                </div>
                <span style={{ color: colors.warning, fontSize: 11, fontWeight: 600 }}>${dayCost}</span>
              </div>
              {day.activities.map((act, actIdx) => {
                const isEditing = editingActivity && editingActivity.dayIdx === dayIdx && editingActivity.actIdx === actIdx
                if (isEditing) {
                  return (
                    <div key={actIdx} style={{
                      padding: 8, marginBottom: 4, background: `${colors.primary}10`,
                      border: `1px solid ${colors.primary}40`, borderRadius: 8,
                    }}>
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 6, fontSize: 12, padding: '8px 10px' }}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEditActivity(); if (e.key === 'Escape') setEditingActivity(null) }}
                      />
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: colors.textMuted, fontSize: 11 }}>$</span>
                        <input value={editCost} onChange={e => setEditCost(e.target.value)}
                          type="number" min="0" step="1"
                          style={{ ...inputStyle, width: 80, marginBottom: 0, fontSize: 12, padding: '6px 8px' }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditActivity(); if (e.key === 'Escape') setEditingActivity(null) }}
                        />
                        <button onClick={saveEditActivity} style={smallBtnStyle}>Save</button>
                        <button onClick={() => setEditingActivity(null)} style={{ ...smallBtnStyle, background: 'none', color: colors.textMuted, border: `1px solid ${colors.border}` }}>Cancel</button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={actIdx} style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                    padding: '4px 6px', borderRadius: 6, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = `${colors.primary}10`}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ color: colors.textMuted, fontSize: 11 }}>{'\u25CF'}</span>
                    <span onClick={() => startEditActivity(dayIdx, actIdx, act)}
                      style={{ color: colors.textSecondary, fontSize: 14, flex: 1, cursor: 'pointer' }}>{act.text}</span>
                    {act.cost > 0 && (
                      <span style={{ color: colors.warning, fontSize: 11, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>${act.cost}</span>
                    )}
                    <button onClick={() => moveActivity(dayIdx, actIdx, -1)}
                      style={{ ...microBtnStyle }} title="Move up">{'\u25B2'}</button>
                    <button onClick={() => moveActivity(dayIdx, actIdx, 1)}
                      style={{ ...microBtnStyle }} title="Move down">{'\u25BC'}</button>
                    <button onClick={() => deleteActivity(dayIdx, actIdx)}
                      style={{ ...microBtnStyle, color: colors.danger }} title="Remove">{'\u00D7'}</button>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* PACKING LIST */}
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>
          PACKING CHECKLIST
          <span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
            {checkedCount}/{packingItems.length} packed ({packingPct}%)
          </span>
        </h3>
        {/* Packing progress bar */}
        <div style={{
          height: 6, background: `${colors.border}`, borderRadius: 3, overflow: 'hidden', marginBottom: 10,
        }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.3s ease',
            width: `${packingPct}%`,
            background: packingPct === 100 ? colors.success : colors.primaryLight,
          }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {packingItems.map(item => {
            const checked = isPackingChecked(item)
            return (
              <div key={item} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 8, cursor: 'pointer', minHeight: 44,
              }} onClick={() => togglePackingItem(item)}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: `2px solid ${checked ? colors.success : colors.border}`,
                  background: checked ? `${colors.success}25` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: colors.success, fontWeight: 700, flexShrink: 0,
                }}>
                  {checked ? '\u2713' : ''}
                </div>
                <span style={{
                  color: checked ? colors.textMuted : colors.textSecondary, fontSize: 14,
                  textDecoration: checked ? 'line-through' : 'none', flex: 1,
                }}>{item}</span>
                <button onClick={(e) => { e.stopPropagation(); removePackingItem(item) }}
                  style={{ ...microBtnStyle, color: colors.danger }} title="Remove">{'\u00D7'}</button>
              </div>
            )
          })}
        </div>
        {/* Add packing item */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input value={newPackingItem} onChange={e => setNewPackingItem(e.target.value)}
            placeholder="Add gear to loadout..."
            style={{ ...inputStyle, flex: 1, marginBottom: 0, fontSize: 12, padding: '8px 10px' }}
            onKeyDown={e => { if (e.key === 'Enter') addPackingItem() }}
          />
          <button onClick={addPackingItem} style={{
            padding: '12px 16px', background: colors.gradient1, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', minHeight: 44,
          }}>+ Add</button>
        </div>

        {/* AI TIPS */}
        <div style={{
          marginTop: 4, padding: 14, background: `${colors.primary}10`,
          border: `1px solid ${colors.primary}25`, borderRadius: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: colors.primary }}>{'\u25C9'}</span>
            <span style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600 }}>JARVIS MISSION BRIEF</span>
          </div>
          <div style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
            All systems nominal, sir. Tap any activity to edit details and costs inline. Use "Add to Calendar" to sync this mission
            to your schedule. Weather recon provides a 7-day forecast for your destination. The cost tracker monitors budget
            utilization in real-time. Pack smart -- check items off as you load out.
          </div>
        </div>
      </div>
    )
  }

  // ==================== TRIP LIST / HOME VIEW ====================
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Travel Planner</h2>
        <span style={{ fontSize: 11, color: colors.accent, background: `${colors.accent}22`, padding: '6px 10px', borderRadius: 8, fontWeight: 600 }}>JARVIS</span>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 16 }}>Mission planning with AI-powered itineraries, weather recon, cost tracking, and loadout checklists.</p>

      <button onClick={() => setPlanning(true)} style={{
        width: '100%', padding: '12px 16px', background: colors.gradient1, color: '#fff',
        border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, minHeight: 44,
        cursor: 'pointer', marginBottom: 20, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <span>{'\u25C9'}</span> Plan a New Mission
      </button>

      {/* Saved Trips */}
      {trips.length > 0 && (
        <div>
          <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>YOUR MISSIONS</h3>
          {trips.map(trip => {
            const tripItin = normalizeItinerary(trip.itinerary)
            const countdown = getCountdown(trip.startDate)
            const totalCost = getTotalCost(tripItin)
            return (
              <button key={trip.id} onClick={() => { setActiveTrip(trip); setCalendarAdded(false); setWeather(null) }} style={{
                width: '100%', padding: 16, background: colors.surfaceLight,
                border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 10,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: colors.text, fontSize: 15, fontWeight: 500 }}>{tripItin.destination}</div>
                  {countdown !== null && countdown > 0 && (
                    <div style={{
                      color: colors.primaryLight, fontSize: 11, fontWeight: 700,
                      background: `${colors.primary}18`, padding: '3px 8px', borderRadius: 8,
                    }}>
                      T-{countdown}d
                    </div>
                  )}
                  {countdown !== null && countdown === 0 && (
                    <div style={{
                      color: colors.success, fontSize: 11, fontWeight: 700,
                      background: `${colors.success}18`, padding: '3px 8px', borderRadius: 8,
                    }}>
                      TODAY
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: colors.textSecondary, fontSize: 12 }}>{tripItin.days.length} days</span>
                  <span style={{ color: colors.success, fontSize: 12 }}>{tripItin.budget}</span>
                  <span style={{ color: colors.warning, fontSize: 12 }}>Est. ${totalCost.toLocaleString()}</span>
                  <span style={{ color: colors.primaryLight, fontSize: 12 }}>{trip.status}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Quick Inspiration */}
      {trips.length === 0 && (
        <div>
          <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>MISSION TEMPLATES</h3>
          {[
            ['\uD83C\uDFD6\uFE0F', 'Beach Getaway', 'Maui, Bali, Maldives', 'beach'],
            ['\uD83C\uDFD9\uFE0F', 'City Explorer', 'Tokyo, Paris, NYC', 'city'],
            ['\uD83C\uDFD4\uFE0F', 'Adventure Trip', 'Costa Rica, Nepal, Iceland', 'adventure'],
          ].map(([icon, title, places, style]) => (
            <button key={style} onClick={() => { setPlanning(true); setTripForm(prev => ({ ...prev, style })) }} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 16,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 10, cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontSize: 28 }}>{icon}</span>
              <div>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{title}</div>
                <div style={{ color: colors.textSecondary, fontSize: 14 }}>{places}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Planning Modal */}
      {planning && (
        <div style={modalOverlay} onClick={() => setPlanning(false)}>
          <div style={{ ...modalContent, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Plan Your Mission</h3>

            <input value={tripForm.destination} onChange={e => setTripForm({ ...tripForm, destination: e.target.value })}
              placeholder="Target destination..." style={inputStyle} autoFocus />

            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={tripForm.startDate} onChange={e => setTripForm({ ...tripForm, startDate: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} placeholder="Start date" />
              <input type="date" value={tripForm.endDate} onChange={e => setTripForm({ ...tripForm, endDate: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} placeholder="End date" />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <select value={tripForm.travelers} onChange={e => setTripForm({ ...tripForm, travelers: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} traveler{n > 1 ? 's' : ''}</option>)}
              </select>
              <select value={tripForm.budget} onChange={e => setTripForm({ ...tripForm, budget: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}>
                <option value="budget">Budget</option>
                <option value="moderate">Moderate</option>
                <option value="luxury">Luxury</option>
              </select>
            </div>

            <div style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Interests</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {INTERESTS.map(interest => (
                <button key={interest} onClick={() => toggleInterest(interest)} style={{
                  padding: '10px 16px', borderRadius: 16, minHeight: 44,
                  background: tripForm.interests.includes(interest) ? `${colors.primary}30` : colors.surfaceLight,
                  border: `1px solid ${tripForm.interests.includes(interest) ? colors.primary : colors.border}`,
                  color: tripForm.interests.includes(interest) ? colors.primaryLight : colors.textSecondary,
                  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                }}>{interest}</button>
              ))}
            </div>

            <button onClick={generateTrip} disabled={generating} style={{
              width: '100%', padding: '12px 16px', background: colors.gradient1, color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, minHeight: 44,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {generating ? 'JARVIS is planning...' : '\u25C9 Generate Mission with AI'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
  border: `1px solid ${colors.border}`,
}
const inputStyle = {
  width: '100%', padding: '12px 16px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10, minHeight: 44,
}
const smallBtnStyle = {
  padding: '12px 16px', background: colors.gradient1, color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
const microBtnStyle = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 14, cursor: 'pointer', padding: '8px 8px', fontFamily: 'inherit',
  lineHeight: 1, borderRadius: 8, opacity: 0.6, minHeight: 44, minWidth: 44,
}
