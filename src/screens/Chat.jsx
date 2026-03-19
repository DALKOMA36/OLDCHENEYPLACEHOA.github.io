import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const AI_RESPONSES = {
  greeting: [
    "Hey there! How can I help you today?",
    "Hi! I'm ready to assist. What's on your mind?",
    "Hello! What can I do for you?",
  ],
  calendar: [
    "I can help with your calendar! You can say things like 'Add a meeting tomorrow at 2pm' or 'What's on my schedule this week?'",
    "Sure! Let me check your calendar. You can add events, check for conflicts, or ask me to block time for focus work.",
  ],
  task: [
    "I can manage your tasks! Try saying 'Add a task to buy groceries' or 'What's on my to-do list?'",
    "Let me help with tasks! I can create, assign, and track tasks for you and your circle.",
  ],
  meal: [
    "I'd love to help with meal planning! Tell me your dietary preferences and I'll suggest meals for the week, complete with a grocery list.",
    "Sure! I can plan meals based on your preferences, schedule, and what's in season. Want me to create a weekly plan?",
  ],
  travel: [
    "Travel planning is one of my favorite things! Where are you thinking of going? I can help with itineraries, packing lists, and bookings.",
    "I can help plan your trip! Tell me the destination, dates, and your interests, and I'll create a detailed itinerary.",
  ],
  reminder: [
    "I'll set that reminder for you! I'll make sure to nudge you at the right time.",
    "Done! I've noted that down. I'll remind you when the time comes.",
  ],
  default: [
    "I understand! Let me think about that for a moment... I can help with calendar management, task tracking, meal planning, travel, and much more. What would you like to explore?",
    "Great question! I'm here to help manage your life. I can handle calendars, tasks, meals, messaging, reminders, and even build custom apps for you.",
    "I hear you! I'm continuously learning your preferences to serve you better. Is there something specific I can help with right now?",
  ],
}

const getResponse = (msg) => {
  const lower = msg.toLowerCase()
  if (/\b(hi|hello|hey|morning|evening)\b/.test(lower)) return pick(AI_RESPONSES.greeting)
  if (/\b(calendar|schedule|meeting|event|appointment)\b/.test(lower)) return pick(AI_RESPONSES.calendar)
  if (/\b(task|todo|to-do|remind|reminder)\b/.test(lower)) return pick(AI_RESPONSES.task)
  if (/\b(meal|food|cook|recipe|grocery|dinner|lunch|breakfast)\b/.test(lower)) return pick(AI_RESPONSES.meal)
  if (/\b(travel|trip|vacation|flight|hotel|itinerary)\b/.test(lower)) return pick(AI_RESPONSES.travel)
  if (/\b(remind|alert|notify|nudge)\b/.test(lower)) return pick(AI_RESPONSES.reminder)
  return pick(AI_RESPONSES.default)
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const defaultGreeting = (name) => ({
  role: 'ai',
  text: `Hi ${name}! I'm Jarvis, your personal AI assistant. I can help with your calendar, tasks, meals, travel, messaging, and much more. What can I do for you?`,
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
})

export default function Chat({ user, addMemory }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load messages from D1 on mount, fall back to localStorage
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const rows = await db.chat.list(50)
        if (!cancelled) {
          if (rows && rows.length > 0) {
            setMessages(rows)
          } else {
            // No messages in D1 yet — check localStorage fallback then show greeting
            const cached = loadState('chatMessages', [])
            if (cached.length > 0) {
              setMessages(cached)
              // Migrate localStorage messages to D1 in background
              for (const msg of cached.slice(-50)) {
                db.chat.send({ role: msg.role, text: msg.text, time: msg.time }).catch(() => {})
              }
            } else {
              const greeting = defaultGreeting(user.name)
              setMessages([greeting])
              db.chat.send(greeting).catch(() => {})
            }
          }
          setLoaded(true)
        }
      } catch (err) {
        console.error('D1 chat load failed, falling back to localStorage:', err)
        if (!cancelled) {
          const cached = loadState('chatMessages', [])
          if (cached.length > 0) {
            setMessages(cached)
          } else {
            setMessages([defaultGreeting(user.name)])
          }
          setLoaded(true)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [user.name])

  // Persist to localStorage as fallback whenever messages change (keep last 50)
  useEffect(() => {
    if (loaded && messages.length > 0) {
      saveState('chatMessages', messages.slice(-50))
    }
  }, [messages, loaded])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  const persistMessage = useCallback(async (msg) => {
    try {
      await db.chat.send({ role: msg.role, text: msg.text, time: msg.time })
    } catch (err) {
      console.error('D1 chat save failed:', err)
    }
  }, [])

  const trimAndPersist = useCallback((prev, newMsg) => {
    const updated = [...prev, newMsg].slice(-50)
    persistMessage(newMsg)
    return updated
  }, [persistMessage])

  const send = () => {
    if (!input.trim()) return
    const userMsg = { role: 'user', text: input.trim(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => trimAndPersist(prev, userMsg))
    addMemory(`User said: ${input.trim().slice(0, 100)}`)
    const query = input.trim()
    setInput('')
    setTyping(true)

    setTimeout(() => {
      const response = getResponse(query)
      const aiMsg = { role: 'ai', text: response, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      setMessages(prev => trimAndPersist(prev, aiMsg))
      setTyping(false)
    }, 800 + Math.random() * 1200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', height: 'calc(100dvh - 120px)' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12, animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              maxWidth: '80%', padding: '12px 16px', borderRadius: 16,
              background: msg.role === 'user' ? colors.primary : colors.surfaceLight,
              border: msg.role === 'ai' ? `1px solid ${colors.border}` : 'none',
              borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
              borderBottomLeftRadius: msg.role === 'ai' ? 4 : 16,
            }}>
              {msg.role === 'ai' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ color: colors.primary, fontSize: 12 }}>&#9673;</span>
                  <span style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600 }}>Jarvis</span>
                </div>
              )}
              <p style={{ color: '#fff', fontSize: 14, lineHeight: 1.5, margin: 0 }}>{msg.text}</p>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 6, textAlign: 'right' }}>{msg.time}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ padding: '12px 20px', background: colors.surfaceLight, border: `1px solid ${colors.border}`, borderRadius: 16, borderBottomLeftRadius: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', background: colors.primary,
                    animation: `bounce 1.4s infinite ${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
        {['Plan my week', 'Add a task', 'Meal ideas', 'Set reminder'].map(s => (
          <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50) }} style={{
            padding: '6px 14px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            borderRadius: 20, color: colors.textSecondary, fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}>{s}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message Jarvis..."
          style={{
            flex: 1, padding: '12px 16px', background: colors.surfaceLight,
            border: `1px solid ${colors.border}`, borderRadius: 24,
            color: colors.text, fontSize: 14, fontFamily: 'inherit',
          }}
        />
        <button onClick={send} disabled={!input.trim()} style={{
          width: 44, height: 44, borderRadius: '50%', background: input.trim() ? colors.gradient1 : colors.surfaceLight,
          border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>&#8593;</button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
