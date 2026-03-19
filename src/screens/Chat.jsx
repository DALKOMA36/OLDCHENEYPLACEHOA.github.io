import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const defaultGreeting = (name) => ({
  role: 'ai',
  text: `Good to have you online${name ? `, ${name}` : ''}. I'm J.A.R.V.I.S., your personal AI assistant. I have access to your calendar, tasks, reminders, and other systems. How may I assist you?`,
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
})

export default function Chat({ user, addMemory, navigate }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [appContext, setAppContext] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load messages and app context on mount
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Load app context for AI
      try {
        const today = new Date().toISOString().split('T')[0]
        const [events, tasks, reminders, trains] = await Promise.all([
          db.events.list(today).catch(() => []),
          db.tasks.list().catch(() => []),
          db.reminders.list().catch(() => []),
          db.trains.list().catch(() => []),
        ])
        if (!cancelled) {
          setAppContext({
            userName: user.name,
            todayEvents: events,
            pendingTasks: tasks.filter(t => !t.completed),
            upcomingReminders: reminders.filter(r => !r.dismissed),
            trainSchedule: trains,
          })
        }
      } catch {}

      // Load chat messages
      try {
        const rows = await db.chat.list(50)
        if (!cancelled) {
          if (rows?.length > 0) {
            setMessages(rows)
          } else {
            const cached = loadState('chatMessages', [])
            if (cached.length > 0) {
              setMessages(cached)
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
      } catch {
        if (!cancelled) {
          const cached = loadState('chatMessages', [])
          setMessages(cached.length > 0 ? cached : [defaultGreeting(user.name)])
          setLoaded(true)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [user.name])

  useEffect(() => {
    if (loaded && messages.length > 0) saveState('chatMessages', messages.slice(-50))
  }, [messages, loaded])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  const persistMessage = useCallback(async (msg) => {
    try { await db.chat.send({ role: msg.role, text: msg.text, time: msg.time }) } catch {}
  }, [])

  const addMsg = useCallback((prev, newMsg) => {
    const updated = [...prev, newMsg].slice(-50)
    persistMessage(newMsg)
    return updated
  }, [persistMessage])

  const send = async () => {
    if (!input.trim() || typing) return
    const text = input.trim()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', text, time }

    setMessages(prev => addMsg(prev, userMsg))
    setInput('')
    setTyping(true)

    try {
      const result = await db.ai.chat(text, messages.slice(-20), appContext)
      const aiMsg = {
        role: 'ai',
        text: result.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => addMsg(prev, aiMsg))
    } catch (err) {
      const aiMsg = {
        role: 'ai',
        text: 'Connection to AI core interrupted. Please try again.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => addMsg(prev, aiMsg))
    }
    setTyping(false)
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
              maxWidth: '85%', padding: '10px 14px',
              background: msg.role === 'user' ? colors.primaryDim : 'rgba(15, 25, 45, 0.7)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(0, 212, 255, 0.3)' : colors.border}`,
            }}>
              {msg.role === 'ai' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: colors.primary, boxShadow: `0 0 6px ${colors.primary}`,
                  }} />
                  <span style={{
                    color: colors.primary, fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: 1,
                  }}>JARVIS</span>
                </div>
              )}
              <p style={{
                color: colors.text, fontSize: 13, lineHeight: 1.6, margin: 0,
                fontFamily: "'Exo 2', sans-serif",
                whiteSpace: 'pre-wrap',
              }}>{msg.text}</p>
              <div style={{
                color: colors.textMuted, fontSize: 9, marginTop: 6, textAlign: 'right',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{msg.time}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{
              padding: '12px 20px',
              background: 'rgba(15, 25, 45, 0.7)',
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: colors.primary,
                  animation: 'pulse 1s ease-in-out infinite',
                }} />
                <span style={{
                  color: colors.textMuted, fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1,
                }}>PROCESSING</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
        {['Brief me on today', 'What tasks are pending?', 'Plan my evening', 'Set a reminder'].map(s => (
          <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50) }} style={{
            padding: '5px 12px',
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 10, cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 0.5,
            transition: 'all 0.15s ease',
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
          placeholder="Speak, sir..."
          disabled={typing}
          style={{
            flex: 1, padding: '11px 14px',
            background: 'rgba(10, 18, 32, 0.8)',
            border: `1px solid ${colors.border}`,
            color: colors.text, fontSize: 13,
            fontFamily: "'Exo 2', sans-serif",
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          }}
        />
        <button onClick={send} disabled={!input.trim() || typing} style={{
          width: 42, height: 42,
          background: input.trim() && !typing ? colors.primaryDim : 'transparent',
          border: `1px solid ${input.trim() && !typing ? colors.primary : colors.border}`,
          color: input.trim() && !typing ? colors.primary : colors.textMuted,
          fontSize: 16, cursor: input.trim() && !typing ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          transition: 'all 0.15s ease',
          boxShadow: input.trim() && !typing ? colors.glow : 'none',
        }}>{'>'}</button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
