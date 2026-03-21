import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

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
              setWeather({
                temp: Math.round(data.current.temperature_2m),
                desc: codes[data.current.weathercode] || 'Unknown',
                wind: Math.round(data.current.windspeed_10m),
              })
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

  return (
    <div style={{ padding: 16 }}>
      {/* Greeting + Time */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{
              color: colors.text, fontSize: 22, fontWeight: 500,
              fontFamily: "'Exo 2', sans-serif", marginBottom: 4,
            }}>
              {greetings(user.name)}
            </h1>
            <p style={{
              color: colors.textMuted, fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>{briefing.date.toUpperCase()}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              color: colors.primary, fontSize: 20, fontWeight: 300,
              fontFamily: "'Rajdhani', sans-serif",
              textShadow: `0 0 10px ${colors.primary}40`,
            }}>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            {weather && (
              <div style={{
                color: colors.textSecondary, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {weather.temp}°F // {weather.desc}
              </div>
            )}
          </div>
        </div>
        <p style={{
          color: colors.textMuted, fontSize: 9, marginTop: 4,
          fontFamily: "'JetBrains Mono', monospace", fontStyle: 'italic',
        }}>{getSubGreeting()}</p>
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

      {/* Quick Actions — expanded */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={sectionHeader}>QUICK ACCESS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['AI', 'Chat', 'chat', colors.primary],
            ['VC', 'Voice', 'voice', colors.success],
            ['TR', 'Trains', 'trains', colors.secondary],
            ['SC', 'Scan', 'scanner', colors.primary],
            ['RD', 'Reader', 'reader', colors.warning],
            ['TV', 'Travel', 'travel', colors.success],
            ['ML', 'Meals', 'meals', colors.secondary],
            ['BT', 'Build', 'builder', colors.primary],
            ['FO', 'Focus', '__focus__', colors.danger],
          ].map(([icon, label, target, col]) => (
            <button key={target} onClick={() => target === '__focus__' ? startFocusMode?.() : navigate(target)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '12px 8px', background: 'transparent',
              border: `1px solid ${colors.border}`, color: col, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: `0 0 8px ${col}40`,
              }}>{icon}</span>
              <span style={{
                fontSize: 8, color: colors.textMuted,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
              }}>{label}</span>
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

      {/* System Modules Grid */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={sectionHeader}>SYSTEM MODULES</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['CH', 'Channels', 'SMS / Email', 'channels', colors.primary],
            ['RM', 'Reminders', 'Alert system', 'reminders', colors.success],
            ['CL', 'Calendar', 'Schedule', 'calendar', colors.secondary],
            ['TK', 'Tasks', 'Active ops', 'tasks', colors.primary],
          ].map(([icon, title, desc, target, col]) => (
            <button key={target} onClick={() => navigate(target)} style={{
              padding: 14, background: 'transparent',
              border: `1px solid ${colors.border}`, textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <div style={{
                fontSize: 11, marginBottom: 6, color: col,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 1,
              }}>{icon}</div>
              <div style={{
                color: colors.text, fontSize: 12, fontWeight: 600, fontFamily: "'Exo 2', sans-serif",
              }}>{title}</div>
              <div style={{
                color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
              }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  )
}

const cardStyle = {
  padding: 14, background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, marginBottom: 6,
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const sectionHeader = {
  color: colors.textMuted, fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 600, marginBottom: 10, letterSpacing: 2,
}

const vitalStyle = {
  color: colors.textMuted, fontSize: 8,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
