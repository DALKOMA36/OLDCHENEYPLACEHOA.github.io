import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../App'

const greetings = (name) => {
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${name}`
  if (h < 17) return `Good afternoon, ${name}`
  return `Good evening, ${name}`
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

const weatherIcons = { sunny: '☀', cloudy: '☁', rainy: '⛆', snowy: '❄' }

export default function Dashboard({ user, navigate, addMemory }) {
  const [briefing, setBriefing] = useState(null)
  const [events] = useState(() => loadState('events', []))
  const [tasks] = useState(() => loadState('tasks', []))
  const [reminders] = useState(() => loadState('reminders', []))
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)])

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
        <h1 style={{ color: colors.text, fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          {greetings(user.name)}
        </h1>
        <p style={{ color: colors.textSecondary, fontSize: 14 }}>{briefing.date}</p>
      </div>

      {/* Morning Briefing Card */}
      <div style={{
        background: colors.gradient1, borderRadius: 16, padding: 20, marginBottom: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 80, opacity: 0.1 }}>◉</div>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 12, opacity: 0.9 }}>TODAY'S BRIEFING</h3>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            [briefing.events, 'Events', colors.warning],
            [briefing.tasks, 'Tasks', colors.secondary],
            [briefing.reminders, 'Reminders', colors.accent],
          ].map(([count, label, col]) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{label}</div>
            </div>
          ))}
        </div>
        {briefing.events === 0 && briefing.tasks === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 12 }}>
            Your day is clear! Time to relax or plan ahead.
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>QUICK ACTIONS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['◉', 'Chat', 'chat', colors.primary],
            ['◎', 'Voice', 'voice', colors.secondary],
            ['⊞', 'Scan', 'scanner', colors.accent],
            ['➤', 'Travel', 'travel', colors.warning],
          ].map(([icon, label, target, col]) => (
            <button
              key={target}
              onClick={() => navigate(target)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 8px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 12, color: col, cursor: 'pointer', fontSize: 22,
              }}
            >
              {icon}
              <span style={{ fontSize: 10, color: colors.textSecondary }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's Events */}
      {briefing.todayEvents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>TODAY'S EVENTS</h3>
            <button onClick={() => navigate('calendar')} style={linkBtn}>View all</button>
          </div>
          {briefing.todayEvents.map((e, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{e.title}</span>
                <span style={{ color: colors.primaryLight, fontSize: 12 }}>{e.time}</span>
              </div>
              {e.location && <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{e.location}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Pending Tasks */}
      {briefing.pendingTasks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>PENDING TASKS</h3>
            <button onClick={() => navigate('tasks')} style={linkBtn}>View all</button>
          </div>
          {briefing.pendingTasks.map((t, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: t.priority === 'high' ? colors.danger : colors.textSecondary }}>●</span>
                <span style={{ color: colors.text, fontSize: 14 }}>{t.title}</span>
              </div>
              {t.assignee && <div style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, marginLeft: 20 }}>Assigned to {t.assignee}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Features Grid */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>EXPLORE FEATURES</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['◈', 'Meal Planner', 'Plan meals & groceries', 'meals', colors.success],
            ['⊶', 'Channels', 'SMS, Email, Slack', 'channels', colors.primary],
            ['⬡', 'App Builder', 'Create custom apps', 'builder', colors.accent],
            ['⏰', 'Reminders', 'Smart notifications', 'reminders', colors.warning],
          ].map(([icon, title, desc, target, col]) => (
            <button
              key={target}
              onClick={() => navigate(target)}
              style={{
                padding: 16, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 12, textAlign: 'left', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8, color: col }}>{icon}</div>
              <div style={{ color: colors.text, fontSize: 13, fontWeight: 600 }}>{title}</div>
              <div style={{ color: colors.textSecondary, fontSize: 11 }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* AI Tip */}
      <div style={{
        padding: 16, background: `${colors.primary}15`, border: `1px solid ${colors.primary}30`,
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: colors.primary }}>◉</span>
          <span style={{ color: colors.primaryLight, fontSize: 12, fontWeight: 600 }}>AEGIS TIP</span>
        </div>
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>{tip}</p>
      </div>
    </div>
  )
}

const cardStyle = {
  padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
  borderRadius: 10, marginBottom: 8,
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.primaryLight,
  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
}
