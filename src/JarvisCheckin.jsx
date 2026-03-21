import { useState, useEffect, useRef } from 'react'
import { colors, loadState, saveState } from './constants'
import { db } from './db'

// JARVIS Proactive Check-in System
// Monitors events/reminders and proactively nudges the user

const CHECK_IN_MESSAGES = {
  event_soon: [
    "Sir, you have {event} in {time}. Are you prepared?",
    "Heads up — {event} starts in {time}. Shall I pull up any details?",
    "{event} is coming up in {time}. Just making sure you're aware.",
    "Reminder: {event} in {time}. You're still on track?",
  ],
  event_imminent: [
    "Sir, {event} starts in {time}. Are you en route?",
    "{event} is in {time}. Time to move if you haven't already.",
    "Final check — {event} in {time}. Everything in order?",
  ],
  wake_up: [
    "Good morning, sir. Time to start the day. Your first event is {event} at {time}.",
    "Rise and shine. I've been running diagnostics while you slept. Ready for today?",
    "Morning, sir. Systems online. Shall I brief you on today's schedule?",
    "Good morning. The day awaits. I have {count} items requiring your attention.",
  ],
  nudge: [
    "Still with me, sir?",
    "Just checking in. Everything alright?",
    "Sir? I need you to acknowledge this one.",
    "I'll keep asking until you respond, sir. It's rather important.",
    "I apologize for the persistence, but this requires your attention.",
  ],
  acknowledged: [
    "Very good, sir.",
    "Acknowledged. Carrying on.",
    "Roger that.",
    "Noted. I'll stand down.",
  ],
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function formatMinutes(min) {
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''}`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h !== 1 ? 's' : ''}`
}

export default function JarvisCheckin({ user }) {
  const [checkin, setCheckin] = useState(null) // { message, type, eventTitle, escalation }
  const [dismissed, setDismissed] = useState({}) // { eventId: timestamp }
  const escalationRef = useRef(0)
  const speakRef = useRef(null)

  // Speak using TTS
  const speak = (text) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.95
    utter.pitch = 0.9
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => v.name.includes('Google') && v.name.includes('UK'))
      || voices.find(v => v.name.includes('Daniel'))
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang === 'en-US')
    if (preferred) utter.voice = preferred
    window.speechSynthesis.speak(utter)
    speakRef.current = utter
  }

  // Send browser notification
  const notify = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.svg', tag: 'jarvis-checkin' })
    }
  }

  // Check events and reminders every 60 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const [events, reminders] = await Promise.all([
          db.events.list(today).catch(() => []),
          db.reminders.list().catch(() => []),
        ])

        const now = new Date()
        const nowMin = now.getHours() * 60 + now.getMinutes()

        // Check events
        for (const event of events) {
          if (!event.time) continue
          const [h, m] = event.time.split(':').map(Number)
          const eventMin = h * 60 + m
          const diff = eventMin - nowMin
          const eventKey = `${event.id || event.title}_${event.date}`

          // Skip if already dismissed in last 30 min
          if (dismissed[eventKey] && Date.now() - dismissed[eventKey] < 30 * 60000) continue

          // 30 min warning
          if (diff > 10 && diff <= 30) {
            const msg = pickRandom(CHECK_IN_MESSAGES.event_soon)
              .replace('{event}', event.title)
              .replace('{time}', formatMinutes(diff))
            triggerCheckin(msg, 'event_soon', event.title, eventKey)
            return
          }

          // 10 min urgent
          if (diff > 0 && diff <= 10) {
            const msg = pickRandom(CHECK_IN_MESSAGES.event_imminent)
              .replace('{event}', event.title)
              .replace('{time}', formatMinutes(diff))
            triggerCheckin(msg, 'event_imminent', event.title, eventKey)
            return
          }
        }

        // Check reminders
        for (const reminder of reminders) {
          if (reminder.dismissed) continue
          if (!reminder.date || !reminder.time) continue
          const rDate = new Date(`${reminder.date}T${reminder.time}`)
          const diffMs = rDate - now
          const diffMin = Math.round(diffMs / 60000)
          const rKey = `reminder_${reminder.id}`

          if (dismissed[rKey] && Date.now() - dismissed[rKey] < 30 * 60000) continue

          if (diffMin >= -5 && diffMin <= 5) {
            triggerCheckin(
              `Sir, reminder: ${reminder.text}`,
              'reminder',
              reminder.text,
              rKey
            )
            return
          }
        }
      } catch {}
    }

    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [dismissed])

  const triggerCheckin = (message, type, title, key) => {
    setCheckin({ message, type, title, key, escalation: 0 })
    speak(message)
    notify('J.A.R.V.I.S.', message)

    // Escalation — nudge again if not acknowledged
    escalationRef.current = 0
    const nudge = setInterval(() => {
      escalationRef.current++
      if (escalationRef.current > 4) {
        clearInterval(nudge)
        return
      }
      const nudgeMsg = pickRandom(CHECK_IN_MESSAGES.nudge)
      speak(nudgeMsg)
      setCheckin(prev => prev ? { ...prev, message: nudgeMsg, escalation: escalationRef.current } : null)
    }, 90000) // nudge every 90 seconds

    // Auto-clear after 8 minutes
    setTimeout(() => {
      clearInterval(nudge)
      setCheckin(null)
    }, 8 * 60000)

    // Store cleanup ref
    return () => clearInterval(nudge)
  }

  const acknowledge = () => {
    if (checkin?.key) {
      setDismissed(prev => ({ ...prev, [checkin.key]: Date.now() }))
    }
    const ackMsg = pickRandom(CHECK_IN_MESSAGES.acknowledged)
    speak(ackMsg)
    setCheckin(null)
    escalationRef.current = 99 // stop nudging
  }

  const snooze = (minutes) => {
    if (checkin?.key) {
      // Dismiss for N minutes
      setDismissed(prev => ({ ...prev, [checkin.key]: Date.now() + (minutes - 30) * 60000 }))
    }
    speak(`Snoozed for ${minutes} minutes, sir.`)
    setCheckin(null)
    escalationRef.current = 99
  }

  if (!checkin) return null

  return (
    <div style={{
      position: 'fixed', bottom: 70, left: 16, right: 16, zIndex: 1000,
      padding: 16,
      background: checkin.type === 'event_imminent' ? 'rgba(255, 77, 77, 0.15)' : colors.primaryDim,
      border: `1px solid ${checkin.type === 'event_imminent' ? colors.danger : colors.primary}`,
      boxShadow: checkin.type === 'event_imminent'
        ? `0 0 20px rgba(255, 77, 77, 0.3)`
        : `0 0 20px rgba(0, 212, 255, 0.3)`,
      backdropFilter: 'blur(10px)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: checkin.type === 'event_imminent' ? colors.danger : colors.primary,
          boxShadow: `0 0 8px ${checkin.type === 'event_imminent' ? colors.danger : colors.primary}`,
          animation: 'pulse 1s ease-in-out infinite',
        }} />
        <span style={{
          color: checkin.type === 'event_imminent' ? colors.danger : colors.primary,
          fontSize: 9, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
        }}>JARVIS CHECK-IN</span>
        {checkin.escalation > 0 && (
          <span style={{
            color: colors.danger, fontSize: 8,
            fontFamily: "'JetBrains Mono', monospace",
          }}>NUDGE #{checkin.escalation}</span>
        )}
      </div>

      <p style={{
        color: colors.text, fontSize: 13, lineHeight: 1.5, marginBottom: 12,
        fontFamily: "'Exo 2', sans-serif",
      }}>{checkin.message}</p>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={acknowledge} style={{
          flex: 2, padding: '8px 0',
          background: colors.primaryDim, border: `1px solid ${colors.primary}`,
          color: colors.primary, fontSize: 10, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>ACKNOWLEDGE</button>
        <button onClick={() => snooze(5)} style={snoozeBtn}>5M</button>
        <button onClick={() => snooze(15)} style={snoozeBtn}>15M</button>
        <button onClick={() => snooze(30)} style={snoozeBtn}>30M</button>
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}

const snoozeBtn = {
  flex: 1, padding: '8px 0',
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textMuted, fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
