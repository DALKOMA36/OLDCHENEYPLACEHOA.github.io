import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'
import { generateSuggestions } from '../smartSuggestions'

const greetings = (name) => {
  const h = new Date().getHours()
  if (h < 6) return `Burning the midnight oil, ${name || 'sir'}?`
  if (h < 12) return `Good morning, ${name || 'sir'}.`
  if (h < 17) return `Good afternoon, ${name || 'sir'}.`
  if (h < 21) return `Good evening, ${name || 'sir'}.`
  return `Still operational, ${name || 'sir'}. As always.`
}

const getSubGreeting = () => {
  const h = new Date().getHours()
  if (h < 6) return 'All systems nominal. Running night protocols.'
  if (h < 9) return 'Systems online. Ready when you are.'
  if (h < 12) return 'All systems operational. Standing by.'
  if (h < 17) return 'Monitoring all channels. Status green.'
  if (h < 21) return 'Evening protocols active.'
  return 'Night mode engaged. Low priority background tasks running.'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard({ user, navigate, addMemory, startFocusMode }) {
  const [briefing, setBriefing] = useState(null)
  const [events, setEvents] = useState(() => loadState('events', []))
  const [tasks, setTasks] = useState(() => loadState('tasks', []))
  const [reminders, setReminders] = useState(() => loadState('reminders', []))
  const [aiBriefing, setAiBriefing] = useState(null)
  const [loadingBriefing, setLoadingBriefing] = useState(false)
  const [trainData, setTrainData] = useState(null)
  const [trainSchedule, setTrainSchedule] = useState(() => loadState('trainSchedule', []))
  const [weather, setWeather] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [systemUptime] = useState(() => Date.now())
  const [quickAction, setQuickAction] = useState(null) // 'task' | 'reminder' | 'note' | null
  const [quickInput, setQuickInput] = useState('')
  const [quickConfirm, setQuickConfirm] = useState(null)

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load from D1
  useEffect(() => {
    Promise.all([
      db.events.list().catch(() => null),
      db.tasks.list().catch(() => null),
      db.reminders.list().catch(() => null),
      db.trains.list().catch(() => null),
    ]).then(([dbEvents, dbTasks, dbReminders, dbTrains]) => {
      if (dbEvents?.length) setEvents(dbEvents)
      if (dbTasks?.length) setTasks(dbTasks)
      if (dbReminders?.length) setReminders(dbReminders)
      if (dbTrains?.length) setTrainSchedule(dbTrains)
    })
  }, [])

  // Weather (using free API — no key needed)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m&temperature_unit=fahrenheit`)
          .then(r => r.json())
          .then(data => {
            if (data.current) {
              const codes = { 0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
                45: 'Foggy', 48: 'Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
                61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Light Snow', 73: 'Snow',
                75: 'Heavy Snow', 80: 'Showers', 81: 'Heavy Showers', 95: 'Thunderstorm' }
              const w = {
                temp: Math.round(data.current.temperature_2m),
                desc: codes[data.current.weathercode] || 'Unknown',
                wind: Math.round(data.current.windspeed_10m),
              }
              setWeather(w)
              // Cache for local AI
              try { localStorage.setItem('jarvis_weather_cache', JSON.stringify(w)) } catch {}
            }
          }).catch(() => {})
      }, () => {})
    }
  }, [])

  // Train status
  useEffect(() => {
    const todayDay = DAYS[new Date().getDay()]
    const todayTrains = trainSchedule.filter(s => s.days.includes(todayDay))
    if (todayTrains.length === 0) return
    const trainNums = [...new Set(todayTrains.map(s => s.train))]
    Promise.all(trainNums.map(n => fetch(`https://api-v3.amtraker.com/v3/trains/${n}`).then(r => r.json()).catch(() => null)))
      .then(results => {
        const data = {}
        trainNums.forEach((num, i) => { if (results[i]?.[num]) data[num] = results[i][num] })
        setTrainData({ todayTrains, data })
      })
  }, [trainSchedule])

  useEffect(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const todayEvents = events.filter(e => e.date === todayStr)
    const pendingTasks = tasks.filter(t => !t.completed)
    const upcomingReminders = reminders.filter(r => !r.dismissed)

    setBriefing({
      date: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      events: todayEvents.length,
      tasks: pendingTasks.length,
      reminders: upcomingReminders.length,
      todayEvents,
      pendingTasks: pendingTasks.slice(0, 5),
      allPendingTasks: pendingTasks,
    })
  }, [events, tasks, reminders])

  // AI briefing — generate once per day
  useEffect(() => {
    if (!briefing || aiBriefing || loadingBriefing) return
    const lastBriefing = loadState('lastBriefingDate', '')
    const today = new Date().toISOString().split('T')[0]
    if (lastBriefing === today) {
      setAiBriefing(loadState('lastBriefingText', null))
      return
    }
    if (briefing.events === 0 && briefing.tasks === 0 && briefing.reminders === 0) return
    setLoadingBriefing(true)
    db.ai.chat(
      'Give me a brief morning briefing as JARVIS. Summarize my day — events, tasks, and reminders. Be concise but warm, like Tony Stark\'s AI. 2-3 sentences max.',
      [],
      {
        userName: user.name,
        todayEvents: briefing.todayEvents,
        pendingTasks: tasks.filter(t => !t.completed),
        upcomingReminders: reminders.filter(r => !r.dismissed),
      }
    ).then(result => {
      setAiBriefing(result.response)
      saveState('lastBriefingDate', today)
      saveState('lastBriefingText', result.response)
    }).catch(() => {}).finally(() => setLoadingBriefing(false))
  }, [briefing])

  if (!briefing) return null

  // Build "what's next" timeline
  const now = new Date()
  const timeline = []

  // Add today's events with times
  briefing.todayEvents.forEach(e => {
    if (e.time) {
      const [h, m] = e.time.split(':').map(Number)
      const eventTime = new Date()
      eventTime.setHours(h, m, 0, 0)
      if (eventTime > now) {
        const diffMin = Math.round((eventTime - now) / 60000)
        timeline.push({
          type: 'event',
          title: e.title,
          time: e.time,
          location: e.location,
          inMin: diffMin,
          sortKey: eventTime.getTime(),
        })
      }
    }
  })

  // Add active reminders
  reminders.filter(r => !r.dismissed && r.date && r.time).forEach(r => {
    const rDate = new Date(`${r.date}T${r.time}`)
    if (rDate > now && rDate - now < 24 * 60 * 60 * 1000) {
      timeline.push({
        type: 'reminder',
        title: r.text,
        time: r.time,
        inMin: Math.round((rDate - now) / 60000),
        sortKey: rDate.getTime(),
      })
    }
  })

  timeline.sort((a, b) => a.sortKey - b.sortKey)

  const uptimeMinutes = Math.floor((Date.now() - systemUptime) / 60000)
  const memory = loadState('jarvis_learned', {})

  // Module grid — icons + labels, big touch targets
  const MODULES = [
    { icon: '✓', label: 'Tasks', key: 'tasks', col: colors.primary, count: briefing.tasks },
    { icon: '📅', label: 'Calendar', key: 'calendar', col: colors.secondary, count: briefing.events },
    { icon: '⏰', label: 'Reminders', key: 'reminders', col: colors.success, count: briefing.reminders },
    { icon: '💬', label: 'Messages', key: 'channels', col: colors.primary },
    { icon: '🚂', label: 'Trains', key: 'trains', col: colors.secondary },
    { icon: '🍽', label: 'Meals', key: 'meals', col: colors.warning },
    { icon: '📷', label: 'Scanner', key: 'scanner', col: colors.primary },
    { icon: '📖', label: 'Reader', key: 'reader', col: colors.success },
    { icon: '✈', label: 'Travel', key: 'travel', col: colors.secondary },
    { icon: '🔄', label: 'Habits', key: 'habits', col: colors.success },
    { icon: '💰', label: 'Finance', key: 'finance', col: colors.warning },
    { icon: '🎵', label: 'Media', key: 'media', col: colors.primary },
    { icon: '📝', label: 'Notes', key: 'notes', col: colors.secondary },
    { icon: '🔧', label: 'Apps', key: 'builder', col: colors.primary },
    { icon: '✈', label: 'Flights', key: 'flights', col: '#0084c8' },
    { icon: '🎯', label: 'Focus', key: '__focus__', col: colors.danger },
  ]

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      {/* Greeting — big and warm */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{
          color: colors.text, fontSize: 26, fontWeight: 600,
          fontFamily: "'Exo 2', sans-serif", marginBottom: 6,
        }}>
          {greetings(user.name)}
        </h1>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <span style={{
            color: colors.primary, fontSize: 22, fontWeight: 300,
            fontFamily: "'Rajdhani', sans-serif",
            textShadow: `0 0 10px ${colors.primary}40`,
          }}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {weather && (
            <span style={{
              color: colors.textSecondary, fontSize: 14,
              fontFamily: "'Exo 2', sans-serif",
            }}>
              {weather.temp}°F {weather.desc}
            </span>
          )}
        </div>
      </div>

      {/* AI Briefing — moved to top for prominence */}
      {(aiBriefing || loadingBriefing) && (
        <div style={{
          padding: 14, marginBottom: 16,
          background: colors.primaryDim, border: `1px solid ${colors.borderBright}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: colors.primary,
              boxShadow: `0 0 6px ${colors.primary}`,
              animation: loadingBriefing ? 'pulse 1s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              color: colors.primary, fontSize: 9,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 2,
            }}>DAILY BRIEFING</span>
          </div>
          <p style={{
            color: colors.textSecondary, fontSize: 12,
            fontFamily: "'Exo 2', sans-serif", lineHeight: 1.6,
          }}>{loadingBriefing ? 'Compiling briefing...' : aiBriefing}</p>
        </div>
      )}

      {/* Smart Suggestions — as swipeable cards */}
      {(() => {
        const suggestions = generateSuggestions(user)
        if (suggestions.length === 0) return null
        const typeColors = {
          warning: colors.danger, alert: colors.warning, info: colors.primary,
          nudge: colors.secondary, success: colors.success, insight: colors.primaryLight,
          memory: '#bb86fc',
        }
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 0', scrollSnapType: 'x mandatory' }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => s.action && navigate(s.action)} style={{
                  flexShrink: 0, width: '75vw', maxWidth: 300,
                  padding: '14px 16px', textAlign: 'left',
                  background: `${typeColors[s.type] || colors.primary}10`,
                  border: `1px solid ${typeColors[s.type] || colors.primary}30`,
                  borderRadius: 12,
                  cursor: s.action ? 'pointer' : 'default',
                  scrollSnapAlign: 'start',
                  touchAction: 'pan-x',
                }}>
                  <div style={{
                    color: typeColors[s.type] || colors.primary, fontSize: 10, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 6,
                  }}>JARVIS</div>
                  <span style={{
                    color: colors.text, fontSize: 14, lineHeight: 1.5,
                    fontFamily: "'Exo 2', sans-serif",
                  }}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Status Readout Card */}
      <div style={{
        background: colors.gradient1, border: `1px solid ${colors.borderBright}`,
        padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 60, height: 60,
          borderRight: `1px solid ${colors.primary}`, borderTop: `1px solid ${colors.primary}`,
          opacity: 0.3,
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: 60, height: 60,
          borderLeft: `1px solid ${colors.primary}`, borderBottom: `1px solid ${colors.primary}`,
          opacity: 0.3,
        }} />

        <h3 style={{
          color: colors.primary, fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: 14, letterSpacing: 2,
        }}>STATUS OVERVIEW</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            [briefing.events, 'EVENTS', colors.primary],
            [briefing.tasks, 'TASKS', colors.secondary],
            [briefing.reminders, 'ALERTS', colors.success],
            [weather ? `${weather.temp}°` : '--', 'WEATHER', colors.warning],
          ].map(([count, label, col]) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                fontSize: 26, fontWeight: 300, color: col,
                fontFamily: "'Rajdhani', sans-serif",
                textShadow: `0 0 10px ${col}40`,
              }}>{count}</div>
              <div style={{
                fontSize: 8, color: colors.textMuted,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5,
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* System vitals bar */}
        <div style={{
          display: 'flex', gap: 16, marginTop: 14, paddingTop: 10,
          borderTop: `1px solid ${colors.border}`,
        }}>
          <span style={vitalStyle}>UPTIME {uptimeMinutes}m</span>
          <span style={vitalStyle}>SESSIONS {memory.interactionCount || 0}</span>
          <span style={vitalStyle}>CORE ONLINE</span>
        </div>
      </div>

      {/* What's Next Timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={sectionHeader}>WHAT'S NEXT</h3>
          {timeline.slice(0, 4).map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: i === 0 ? colors.primaryDim : colors.surfaceLight,
              border: `1px solid ${i === 0 ? colors.borderBright : colors.border}`,
              marginBottom: 4,
            }}>
              <div style={{
                width: 4, height: 30, background: item.type === 'event' ? colors.primary : colors.secondary,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 12, fontWeight: 500, fontFamily: "'Exo 2', sans-serif" }}>
                  {item.title}
                </div>
                <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.time} {item.location ? `// ${item.location}` : ''}
                </div>
              </div>
              <div style={{
                color: item.inMin < 30 ? colors.warning : colors.textMuted,
                fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'nowrap',
              }}>
                {item.inMin < 60 ? `${item.inMin}m` : `${Math.floor(item.inMin / 60)}h ${item.inMin % 60}m`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Train Status Widget */}
      {trainData && trainData.todayTrains.length > 0 && (
        <button onClick={() => navigate('trains')} style={{
          width: '100%', padding: 14, background: colors.surfaceLight,
          border: `1px solid ${colors.border}`, marginBottom: 16, cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, color: colors.secondary,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 1,
            }}>TR</span>
            <span style={{
              color: colors.text, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 1,
            }}>TRANSIT STATUS</span>
          </div>
          {trainData.todayTrains.map(s => {
            const instances = trainData.data[s.train]
            let statusText = 'No data'
            let statusColor = colors.textMuted
            if (instances && instances.length > 0) {
              const inst = instances[0]
              const stationList = inst.stations ? (Array.isArray(inst.stations) ? inst.stations : Object.values(inst.stations)) : []
              const myStation = stationList.find(st => st.code === s.boardStation)
              if (myStation) {
                if (myStation.arr && myStation.schArr) {
                  const delay = Math.round((new Date(myStation.arr).getTime() - new Date(myStation.schArr).getTime()) / 60000)
                  if (delay <= 0) { statusText = 'On time'; statusColor = colors.success }
                  else if (delay < 60) { statusText = `${delay}m late`; statusColor = delay < 30 ? colors.warning : '#e67e22' }
                  else { statusText = `${Math.floor(delay/60)}h ${delay%60}m late`; statusColor = colors.danger }
                } else if (myStation.status) {
                  statusText = myStation.status
                  statusColor = myStation.status === 'Enroute' ? colors.warning : colors.success
                }
              }
              const current = stationList.find(st => st.status === 'Enroute') || stationList.find(st => st.status === 'Station')
              if (current) statusText += ` // ${current.name}`
            }
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ color: colors.primary, fontSize: 11, fontWeight: 600, width: 32, fontFamily: "'JetBrains Mono', monospace" }}>#{s.train}</span>
                <span style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{s.boardStation}</span>
                <span style={{ color: statusColor, fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{statusText}</span>
              </div>
            )
          })}
        </button>
      )}

      {/* Quick Actions — big inline create buttons */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { key: 'task', label: '+ Task', col: colors.primary, placeholder: 'Task name...' },
            { key: 'reminder', label: '+ Reminder', col: colors.secondary, placeholder: 'Remind me to...' },
            { key: 'note', label: '+ Note', col: colors.success, placeholder: 'Quick note...' },
          ].map(qa => (
            <div key={qa.key} style={{ position: 'relative' }}>
              {quickAction === qa.key ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const text = quickInput.trim()
                    if (!text) return
                    try {
                      if (qa.key === 'task') {
                        await db.tasks.create({ title: text, priority: 'medium', category: 'personal' })
                      } else if (qa.key === 'reminder') {
                        const remindAt = new Date(Date.now() + 60 * 60 * 1000)
                        await db.reminders.create({
                          text,
                          date: remindAt.toISOString().split('T')[0],
                          time: remindAt.toTimeString().slice(0, 5),
                        })
                      } else if (qa.key === 'note') {
                        await db.notes.create({ title: text, body: '', category: 'ideas' })
                      }
                      setQuickInput('')
                      setQuickAction(null)
                      setQuickConfirm(qa.key === 'task' ? 'Task added!' : qa.key === 'reminder' ? 'Reminder set!' : 'Note saved!')
                      setTimeout(() => setQuickConfirm(null), 2000)
                      // Refresh data
                      const updated = qa.key === 'task' ? await db.tasks.list().catch(() => null)
                        : qa.key === 'reminder' ? await db.reminders.list().catch(() => null)
                        : null
                      if (qa.key === 'task' && updated) setTasks(updated)
                      if (qa.key === 'reminder' && updated) setReminders(updated)
                    } catch {}
                  }}
                  style={{
                    display: 'flex', height: 56,
                    background: `${qa.col}15`,
                    border: `1px solid ${qa.col}60`,
                    borderRadius: 12, overflow: 'hidden',
                  }}
                >
                  <input
                    autoFocus
                    value={quickInput}
                    onChange={e => setQuickInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setQuickAction(null); setQuickInput('') } }}
                    onBlur={() => { if (!quickInput.trim()) { setQuickAction(null); setQuickInput('') } }}
                    placeholder={qa.placeholder}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      color: colors.text, fontSize: 14, padding: '0 14px',
                      fontFamily: "'Exo 2', sans-serif",
                    }}
                  />
                  <button type="submit" style={{
                    background: qa.col, border: 'none', color: '#000',
                    fontSize: 14, fontWeight: 700, padding: '0 16px',
                    cursor: 'pointer', fontFamily: "'Exo 2', sans-serif",
                  }}>Add</button>
                </form>
              ) : (
                <button
                  onClick={() => { setQuickAction(qa.key); setQuickInput('') }}
                  style={{
                    width: '100%', height: 56, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: `${qa.col}10`,
                    border: `1px solid ${qa.col}30`,
                    borderRadius: 12, cursor: 'pointer',
                    color: qa.col, fontSize: 16, fontWeight: 600,
                    fontFamily: "'Exo 2', sans-serif",
                    touchAction: 'manipulation',
                  }}
                >{qa.label}</button>
              )}
            </div>
          ))}
        </div>
        {quickConfirm && (
          <div style={{
            textAlign: 'center', marginTop: 8, padding: '8px 0',
            color: colors.success, fontSize: 14, fontWeight: 600,
            fontFamily: "'Exo 2', sans-serif",
            animation: 'pulse 0.5s ease-in-out',
          }}>{quickConfirm}</div>
        )}
      </div>

      {/* Modules — BIG touch targets, 3-column, emoji icons */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[...MODULES, { icon: '🚗', label: 'Work', key: '__arrow__', col: '#e67e22' }].map(mod => (
            <button
              key={mod.key}
              onClick={() => {
                if (mod.key === '__focus__') startFocusMode?.()
                else if (mod.key === '__arrow__') window.open('https://customer.arrowstagelines.com/driverportal/diary', '_blank')
                else navigate(mod.key)
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6,
                padding: '18px 8px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${colors.border}`,
                borderRadius: 14, cursor: 'pointer',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: `${mod.col}30`,
                transition: 'all 0.15s ease',
                position: 'relative', minHeight: 80,
              }}
            >
              {mod.count > 0 && (
                <div style={{
                  position: 'absolute', top: 6, right: 8,
                  background: mod.col, color: '#000', fontWeight: 700,
                  fontSize: 10, width: 20, height: 20, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{mod.count}</div>
              )}
              <span style={{ fontSize: 28 }}>{mod.icon}</span>
              <span style={{
                fontSize: 12, color: colors.text, fontWeight: 500,
                fontFamily: "'Exo 2', sans-serif",
              }}>{mod.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's Events */}
      {briefing.todayEvents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={sectionHeader}>SCHEDULED EVENTS</h3>
            <button onClick={() => navigate('calendar')} style={linkBtn}>VIEW ALL</button>
          </div>
          {briefing.todayEvents.map((e, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>{e.title}</span>
                <span style={{ color: colors.primary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{e.time}</span>
              </div>
              {e.location && <div style={{
                color: colors.textMuted, fontSize: 11, marginTop: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{e.location}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Pending Tasks */}
      {briefing.pendingTasks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={sectionHeader}>ACTIVE TASKS</h3>
            <button onClick={() => navigate('tasks')} style={linkBtn}>VIEW ALL ({briefing.allPendingTasks?.length || 0})</button>
          </div>
          {briefing.pendingTasks.map((t, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: t.priority === 'high' ? colors.danger : t.priority === 'medium' ? colors.warning : colors.textMuted,
                  boxShadow: t.priority === 'high' ? `0 0 6px ${colors.danger}` : 'none',
                }} />
                <span style={{ color: colors.text, fontSize: 13 }}>{t.title}</span>
              </div>
              {t.due_date && <div style={{
                color: colors.textMuted, fontSize: 10, marginTop: 4, marginLeft: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}>DUE: {t.due_date}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Removed — all modules now in unified grid above */}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  )
}

const cardStyle = {
  padding: 16, background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10,
  marginBottom: 8,
}

const linkBtn = {
  background: 'rgba(0,212,255,0.08)', border: `1px solid ${colors.border}`,
  borderRadius: 8, color: colors.primary,
  fontSize: 12, cursor: 'pointer', padding: '8px 14px',
  fontFamily: "'Exo 2', sans-serif", fontWeight: 500,
  touchAction: 'manipulation', minHeight: 36,
}

const sectionHeader = {
  color: colors.textMuted, fontSize: 12, fontWeight: 600,
  fontFamily: "'Exo 2', sans-serif",
  marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase',
}

const vitalStyle = {
  color: colors.textMuted, fontSize: 8,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
