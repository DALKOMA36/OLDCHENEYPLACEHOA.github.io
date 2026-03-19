import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const greetings = (name) => {
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${name || 'sir'}.`
  if (h < 17) return `Good afternoon, ${name || 'sir'}.`
  return `Good evening, ${name || 'sir'}.`
}

const tips = [
  "Try asking me to plan your week",
  "I can scan a school flyer and add events",
  "Set up your circle to delegate tasks",
  "Connect your calendar in Settings",
  "I can plan meals based on your diet",
  "Try the Voice feature for hands-free control",
  "Build a custom app with the App Builder",
  "I can help plan your next trip",
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard({ user, navigate, addMemory }) {
  const [briefing, setBriefing] = useState(null)
  const [events, setEvents] = useState(() => loadState('events', []))
  const [tasks, setTasks] = useState(() => loadState('tasks', []))
  const [reminders, setReminders] = useState(() => loadState('reminders', []))
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)])
  const [trainData, setTrainData] = useState(null)
  const [trainSchedule, setTrainSchedule] = useState(() => loadState('trainSchedule', []))

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

  // Fetch quick train status for dashboard
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
      pendingTasks: pendingTasks.slice(0, 3),
    })
  }, [events, tasks, reminders])

  if (!briefing) return null

  return (
    <div style={{ padding: 16 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          color: colors.text, fontSize: 22, fontWeight: 500,
          fontFamily: "'Exo 2', sans-serif", marginBottom: 4,
        }}>
          {greetings(user.name)}
        </h1>
        <p style={{
          color: colors.textMuted, fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1,
        }}>{briefing.date.toUpperCase()}</p>
      </div>

      {/* Status Readout Card */}
      <div style={{
        background: colors.gradient1,
        border: `1px solid ${colors.borderBright}`,
        padding: 20, marginBottom: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle corner decoration */}
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 60, height: 60,
          borderRight: `1px solid ${colors.primary}`,
          borderTop: `1px solid ${colors.primary}`,
          opacity: 0.3,
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: 60, height: 60,
          borderLeft: `1px solid ${colors.primary}`,
          borderBottom: `1px solid ${colors.primary}`,
          opacity: 0.3,
        }} />

        <h3 style={{
          color: colors.primary, fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600, marginBottom: 14, letterSpacing: 2,
        }}>STATUS OVERVIEW</h3>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            [briefing.events, 'EVENTS', colors.primary],
            [briefing.tasks, 'TASKS', colors.secondary],
            [briefing.reminders, 'ALERTS', colors.success],
          ].map(([count, label, col]) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                fontSize: 28, fontWeight: 300, color: col,
                fontFamily: "'Rajdhani', sans-serif",
                textShadow: `0 0 10px ${col}40`,
              }}>{count}</div>
              <div style={{
                fontSize: 9, color: colors.textMuted,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 1.5,
              }}>{label}</div>
            </div>
          ))}
        </div>
        {briefing.events === 0 && briefing.tasks === 0 && (
          <p style={{
            color: colors.textSecondary, fontSize: 11, marginTop: 14,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            All systems nominal. Schedule clear.
          </p>
        )}
      </div>

      {/* Train Status Widget */}
      {trainData && trainData.todayTrains.length > 0 && (
        <button onClick={() => navigate('trains')} style={{
          width: '100%', padding: 14,
          background: colors.surfaceLight,
          border: `1px solid ${colors.border}`,
          marginBottom: 16, cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, color: colors.secondary,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, letterSpacing: 1,
            }}>TR</span>
            <span style={{
              color: colors.text, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, letterSpacing: 1,
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
                  statusColor = myStation.status === 'Enroute' ? colors.warning : myStation.status === 'Departed' ? colors.textMuted : colors.success
                }
              }
              const current = stationList.find(st => st.status === 'Enroute') || stationList.find(st => st.status === 'Station')
              if (current) statusText += ` // ${current.name}`
            }
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{
                  color: colors.primary,
                  fontSize: 11, fontWeight: 600, width: 32,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>#{s.train}</span>
                <span style={{
                  color: colors.textSecondary, fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{s.boardStation}</span>
                <span style={{
                  color: statusColor, fontSize: 11, fontWeight: 500,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{statusText}</span>
              </div>
            )
          })}
          <div style={{
            color: colors.textMuted, fontSize: 10, marginTop: 8,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1,
          }}>VIEW DETAILS &gt;</div>
        </button>
      )}

      {/* Quick Actions */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          color: colors.textMuted, fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600, marginBottom: 12, letterSpacing: 2,
        }}>QUICK ACCESS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['TR', 'Trains', 'trains', colors.secondary],
            ['AI', 'Chat', 'chat', colors.primary],
            ['VC', 'Voice', 'voice', colors.success],
            ['SC', 'Scan', 'scanner', colors.primary],
          ].map(([icon, label, target, col]) => (
            <button
              key={target}
              onClick={() => navigate(target)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 8px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: col, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: `0 0 8px ${col}40`,
              }}>{icon}</span>
              <span style={{
                fontSize: 9, color: colors.textMuted,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 0.5,
              }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's Events */}
      {briefing.todayEvents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{
              color: colors.textMuted, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, letterSpacing: 2,
            }}>SCHEDULED EVENTS</h3>
            <button onClick={() => navigate('calendar')} style={linkBtn}>VIEW ALL</button>
          </div>
          {briefing.todayEvents.map((e, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>{e.title}</span>
                <span style={{
                  color: colors.primary, fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{e.time}</span>
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
            <h3 style={{
              color: colors.textMuted, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, letterSpacing: 2,
            }}>ACTIVE TASKS</h3>
            <button onClick={() => navigate('tasks')} style={linkBtn}>VIEW ALL</button>
          </div>
          {briefing.pendingTasks.map((t, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: t.priority === 'high' ? colors.danger : colors.textMuted,
                  boxShadow: t.priority === 'high' ? `0 0 6px ${colors.danger}` : 'none',
                }} />
                <span style={{ color: colors.text, fontSize: 13 }}>{t.title}</span>
              </div>
              {t.assignee && <div style={{
                color: colors.textMuted, fontSize: 10, marginTop: 4, marginLeft: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}>ASSIGNED: {t.assignee}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Features Grid */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          color: colors.textMuted, fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600, marginBottom: 12, letterSpacing: 2,
        }}>SYSTEM MODULES</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['ML', 'Meal Planner', 'Diet & groceries', 'meals', colors.success],
            ['CH', 'Channels', 'SMS / Email / Slack', 'channels', colors.primary],
            ['BD', 'App Builder', 'Custom applications', 'builder', colors.secondary],
            ['RM', 'Reminders', 'Alert system', 'reminders', colors.primary],
          ].map(([icon, title, desc, target, col]) => (
            <button
              key={target}
              onClick={() => navigate(target)}
              style={{
                padding: 16,
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                textAlign: 'left', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontSize: 11, marginBottom: 8, color: col,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600, letterSpacing: 1,
              }}>{icon}</div>
              <div style={{
                color: colors.text, fontSize: 12, fontWeight: 600,
                fontFamily: "'Exo 2', sans-serif",
              }}>{title}</div>
              <div style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* System Tip */}
      <div style={{
        padding: 14,
        background: colors.primaryDim,
        border: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: colors.primary,
            boxShadow: `0 0 4px ${colors.primary}`,
          }} />
          <span style={{
            color: colors.primary, fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600, letterSpacing: 2,
          }}>SYSTEM NOTE</span>
        </div>
        <p style={{
          color: colors.textSecondary, fontSize: 12,
          fontFamily: "'Exo 2', sans-serif",
        }}>{tip}</p>
      </div>
    </div>
  )
}

const cardStyle = {
  padding: 14,
  background: 'rgba(15, 25, 45, 0.6)',
  border: `1px solid ${colors.border}`,
  marginBottom: 6,
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: 1,
}
