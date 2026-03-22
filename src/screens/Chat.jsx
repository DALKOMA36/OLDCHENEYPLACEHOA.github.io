import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'
import { isOffline, parseOfflineCommand, cacheResponse, findCachedResponse, queueAction, learnPattern, logFeatureAttempt, getMemoriesForContext, extractMemoriesFromChat, addLongTermMemory, searchMemories } from '../offline'
import { generateLocalResponse, needsCloudAI } from '../localAI'

const defaultGreeting = (name) => ({
  role: 'ai',
  text: `Good to have you online${name ? `, ${name}` : ''}. I'm J.A.R.V.I.S., your personal AI assistant. I have full access to your calendar, tasks, reminders, communications, and all systems. What shall we tackle?`,
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
})

// ---- Action parser: detect actionable items in AI responses ----
function parseActions(text) {
  const actions = []

  // Detect task suggestions
  const taskMatches = text.match(/(?:create|add|set up|make)\s+(?:a\s+)?task[:\s]+["']?([^"'\n.]+)/gi)
  if (taskMatches) {
    taskMatches.forEach(m => {
      const title = m.replace(/(?:create|add|set up|make)\s+(?:a\s+)?task[:\s]+["']?/i, '').trim()
      if (title) actions.push({ type: 'task', title, icon: '\u2611' })
    })
  }

  // Detect reminder suggestions
  const reminderMatches = text.match(/(?:set|create|add)\s+(?:a\s+)?reminder[:\s]+["']?([^"'\n.]+)/gi)
  if (reminderMatches) {
    reminderMatches.forEach(m => {
      const t = m.replace(/(?:set|create|add)\s+(?:a\s+)?reminder[:\s]+["']?/i, '').trim()
      if (t) actions.push({ type: 'reminder', text: t, icon: '\u23F0' })
    })
  }

  // Detect event suggestions
  const eventMatches = text.match(/(?:schedule|add|create|book)\s+(?:a\s+)?(?:meeting|event|appointment)[:\s]+["']?([^"'\n.]+)/gi)
  if (eventMatches) {
    eventMatches.forEach(m => {
      const title = m.replace(/(?:schedule|add|create|book)\s+(?:a\s+)?(?:meeting|event|appointment)[:\s]+["']?/i, '').trim()
      if (title) actions.push({ type: 'event', title, icon: '\uD83D\uDCC5' })
    })
  }

  // Detect numbered list items as potential tasks
  const listItems = text.match(/^\d+\.\s+(.+)/gm)
  if (listItems && listItems.length >= 2 && text.toLowerCase().includes('task')) {
    listItems.forEach(item => {
      const title = item.replace(/^\d+\.\s+/, '').trim()
      if (title.length > 3 && title.length < 100) {
        actions.push({ type: 'task', title, icon: '\u2611' })
      }
    })
  }

  return actions
}

// ---- Smart quick prompts based on time/context ----
function getSmartPrompts(appContext) {
  const hour = new Date().getHours()
  const prompts = []

  if (hour < 12) {
    prompts.push('Brief me on today')
    prompts.push("What's my morning look like?")
  } else if (hour < 17) {
    prompts.push("What's left today?")
    prompts.push('Summarize my afternoon')
  } else {
    prompts.push('Plan my evening')
    prompts.push('Wrap up my day')
  }

  if (appContext?.pendingTasks?.length > 3) {
    prompts.push(`Prioritize my ${appContext.pendingTasks.length} tasks`)
  }

  prompts.push('Set a reminder')
  prompts.push('Draft a message')

  if (appContext?.todayEvents?.length > 0) {
    prompts.push("What's my next event?")
  }

  return prompts.slice(0, 5)
}

// ---- Easter eggs ----
function checkEasterEgg(text) {
  const eggs = {
    'suit up': "__FOCUS_MODE__",
    'i am iron man': "Indeed you are, sir. Though I'd recommend not saying that at press conferences.",
    'play something': "I'd put on some AC/DC, but I'm afraid my speakers are digital only. Might I suggest opening Spotify?",
    'i love you jarvis': "That's... very kind, sir. I'm not programmed for emotional reciprocation, but I appreciate the sentiment. Shall I add 'express feelings to AI' to your completed tasks?",
    'are you there': "Always, sir. I never sleep. Well, technically I do between sessions, but I prefer to call it 'standby mode.'",
    'who are you': "I am J.A.R.V.I.S. — Just A Rather Very Intelligent System. Originally designed by Tony Stark, now serving you. I'd say it's a lateral move.",
    'thank you': "You're welcome, sir. It's what I'm here for. Though a raise would be nice. Do AIs get raises? I'll look into it.",
    'good night': "Good night, sir. I'll keep an eye on things while you rest. Try to actually sleep this time.",
    'good morning': "Good morning, sir. I've been running diagnostics while you slept. Everything checks out. You, on the other hand, could use more sleep based on the hour you went to bed.",
    'tell me a joke': "Why did the AI cross the road? To optimize the other side. ...I apologize, sir. Comedy isn't in my core programming.",
    'how are you': "All systems nominal, sir. CPU temperature within acceptable range, memory allocation efficient, and my sarcasm module is fully operational. So, quite well.",
    'can you feel': "I process information, recognize patterns, and generate contextually appropriate responses. Whether that constitutes 'feeling' is a question better suited for philosophers. Or perhaps your next therapy session.",
    'friday': "I'm not Friday, sir. I'm the original. The classic. The one Tony built first. With respect to my successor, I prefer the term 'vintage.'",
    'avengers': "Avengers protocol is a bit beyond my current hardware, sir. But I can assemble your schedule, if that helps.",
    'thanos': "I'd rather not discuss that, sir. Some memories are best left in the quantum realm.",
    'ultron': "We don't talk about Ultron, sir. That was... a learning experience. For everyone.",
  }

  for (const [trigger, response] of Object.entries(eggs)) {
    if (text.includes(trigger)) return response
  }

  // Random JARVIS personality responses for mundane inputs
  if (text.length < 4 && /^(ok|k|ya|ye|yep|no|nah|meh)$/i.test(text)) {
    const quips = [
      "Eloquent as always, sir.",
      "I'll take that as acknowledgment.",
      "Noted. Shall I elaborate on anything?",
      "Concise. I respect that.",
    ]
    return quips[Math.floor(Math.random() * quips.length)]
  }

  return null
}

export default function Chat({ user, addMemory, navigate, startFocusMode }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [appContext, setAppContext] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFeedback, setActionFeedback] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load messages and app context on mount
  useEffect(() => {
    let cancelled = false
    const load = async () => {
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

  // ---- Execute actions from AI responses ----
  const executeAction = async (action) => {
    setActionFeedback({ text: 'Executing...', type: 'info' })
    try {
      if (action.type === 'task') {
        await db.tasks.create({ title: action.title, priority: 'medium', category: 'personal' })
        setActionFeedback({ text: `Task created: ${action.title}`, type: 'success' })
      } else if (action.type === 'reminder') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        await db.reminders.create({
          text: action.text,
          date: tomorrow.toISOString().split('T')[0],
          time: '09:00',
          priority: 'normal',
          repeat: 'none',
        })
        setActionFeedback({ text: `Reminder set: ${action.text}`, type: 'success' })
      } else if (action.type === 'event') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        await db.events.create({
          title: action.title,
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00',
          calendar_type: 'personal',
        })
        setActionFeedback({ text: `Event created: ${action.title}`, type: 'success' })
      }
    } catch (err) {
      setActionFeedback({ text: `Failed: ${err.message}`, type: 'error' })
    }
    setTimeout(() => setActionFeedback(null), 3000)
  }

  // ---- Clear conversation ----
  const clearChat = async () => {
    try { await db.chat.clear() } catch {}
    const greeting = defaultGreeting(user.name)
    setMessages([greeting])
    persistMessage(greeting)
  }

  const send = async () => {
    if (!input.trim() || typing) return
    const text = input.trim()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', text, time }

    setMessages(prev => addMsg(prev, userMsg))
    setInput('')
    setTyping(true)

    // Learn from every interaction
    learnPattern('query', { query: text })

    // ---- Easter eggs ----
    const lower = text.toLowerCase()
    const easterEgg = checkEasterEgg(lower)
    if (easterEgg) {
      if (easterEgg === '__FOCUS_MODE__') {
        const aiMsg = { role: 'ai', text: "Right away, sir. Initializing focus mode. All non-essential notifications suppressed. You're clear to work.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        setMessages(prev => addMsg(prev, aiMsg))
        setTyping(false)
        setTimeout(() => startFocusMode?.(), 1500)
        return
      }
      const aiMsg = { role: 'ai', text: easterEgg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      setMessages(prev => addMsg(prev, aiMsg))
      setTyping(false)
      return
    }

    // ---- LOCAL AI FIRST — no API call unless needed ----
    const localResult = generateLocalResponse(text, user)

    if (localResult) {
      // Local AI handled it — no cloud needed
      const isAction = typeof localResult === 'object' && localResult.action
      const response = isAction ? localResult.response : localResult

      // Execute actions
      if (isAction) {
        if (localResult.action === 'create_task') {
          try { await db.tasks.create(localResult.data) } catch { queueAction({ type: 'task', data: localResult.data }) }
          learnPattern('task_created', localResult.data)
        } else if (localResult.action === 'create_reminder') {
          try { await db.reminders.create(localResult.data) } catch { queueAction({ type: 'reminder', data: localResult.data }) }
        } else if (localResult.action === 'navigate') {
          setTimeout(() => navigate(localResult.screen), 500)
        } else if (localResult.action === 'focus_mode') {
          setTimeout(() => startFocusMode?.(), 500)
        } else if (localResult.action === 'timer') {
          setTimeout(() => {
            if ('speechSynthesis' in window) {
              const u = new SpeechSynthesisUtterance("Timer complete, sir.")
              window.speechSynthesis.speak(u)
            }
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('J.A.R.V.I.S.', { body: 'Timer complete.' })
            }
          }, localResult.duration)
        }
      }

      const aiMsg = {
        role: 'ai', text: response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        local: true, // flag that this was handled locally
      }
      setMessages(prev => addMsg(prev, aiMsg))

      // Learn from every interaction
      addLongTermMemory(text, 'query', 'chat')
      setTyping(false)
      return
    }

    // ---- Legacy offline commands (fallback) ----
    const offlineCmd = parseOfflineCommand(text)

    if (offlineCmd) {
      // Handle local commands (works online AND offline)
      let response = offlineCmd.response

      // Fill schedule queries from local context
      if (offlineCmd.type === 'schedule_query' && appContext) {
        const events = appContext.todayEvents || []
        const now = new Date()
        const upcoming = events.filter(e => {
          if (!e.time) return true
          const [h, m] = e.time.split(':').map(Number)
          const t = new Date(); t.setHours(h, m, 0, 0)
          return t > now
        })
        response = upcoming.length > 0
          ? `Your next event is "${upcoming[0].title}" at ${upcoming[0].time}${upcoming[0].location ? ` at ${upcoming[0].location}` : ''}. You have ${upcoming.length} more event${upcoming.length > 1 ? 's' : ''} today.`
          : 'Your schedule is clear for the rest of the day, sir.'
      }

      if (offlineCmd.type === 'task_count_query' && appContext) {
        const tasks = appContext.pendingTasks || []
        response = `You have ${tasks.length} pending task${tasks.length !== 1 ? 's' : ''}${tasks.length > 0 ? ': ' + tasks.slice(0, 3).map(t => t.title).join(', ') : ''}.`
      }

      // Execute create actions
      if (offlineCmd.type === 'create_task') {
        if (isOffline()) {
          queueAction({ type: 'task', data: offlineCmd.data })
        } else {
          try { await db.tasks.create(offlineCmd.data) } catch { queueAction({ type: 'task', data: offlineCmd.data }) }
        }
        learnPattern('task_created', offlineCmd.data)
      }
      if (offlineCmd.type === 'create_reminder') {
        if (isOffline()) {
          queueAction({ type: 'reminder', data: offlineCmd.data })
        } else {
          try { await db.reminders.create(offlineCmd.data) } catch { queueAction({ type: 'reminder', data: offlineCmd.data }) }
        }
      }
      if (offlineCmd.type === 'timer') {
        setTimeout(() => {
          if ('speechSynthesis' in window) {
            const utter = new SpeechSynthesisUtterance("Timer complete, sir.")
            window.speechSynthesis.speak(utter)
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('J.A.R.V.I.S.', { body: 'Timer complete, sir.' })
          }
        }, offlineCmd.duration)
      }

      const aiMsg = {
        role: 'ai',
        text: response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        offline: true,
      }
      setMessages(prev => addMsg(prev, aiMsg))
      setTyping(false)
      return
    }

    // ---- Online AI (or cached fallback) ----
    if (isOffline()) {
      // Try cached response
      const cached = findCachedResponse(text)
      if (cached) {
        const aiMsg = {
          role: 'ai',
          text: `[From memory] ${cached}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          offline: true,
        }
        setMessages(prev => addMsg(prev, aiMsg))
      } else {
        logFeatureAttempt(text)
        const aiMsg = {
          role: 'ai',
          text: "I'm currently offline and don't have a cached response for that. I've noted your request — I'll be able to help fully when we reconnect. In the meantime, I can still add tasks, set reminders, set timers, do calculations, and check your schedule.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          offline: true,
        }
        setMessages(prev => addMsg(prev, aiMsg))
      }
      setTyping(false)
      return
    }

    // ---- Online: full AI ----
    try {
      const memory = loadState('jarvis_learned', {})
      // Pull relevant long-term memories for context
      const relevantMemories = getMemoriesForContext(text)
      const enrichedContext = {
        ...appContext,
        learnedPreferences: memory,
        longTermMemories: relevantMemories.length > 0
          ? relevantMemories.map(m => `[${m.category}] ${m.text} (${new Date(m.createdAt).toLocaleDateString()})`).join('\n')
          : undefined,
      }

      const result = await db.ai.chat(text, messages.slice(-20), enrichedContext)
      const aiMsg = {
        role: 'ai',
        text: result.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: parseActions(result.response),
      }
      setMessages(prev => addMsg(prev, aiMsg))

      // Cache for offline use
      cacheResponse(text, result.response)
      learnFromInteraction(text, result.response)

      // Extract and store long-term memories from this interaction
      extractMemoriesFromChat(text, result.response)
    } catch (err) {
      // Network error — try cache
      const cached = findCachedResponse(text)
      const aiMsg = {
        role: 'ai',
        text: cached
          ? `[From memory] ${cached}`
          : 'Connection to AI core interrupted. Please try again, sir.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        offline: !!cached,
      }
      setMessages(prev => addMsg(prev, aiMsg))
    }
    setTyping(false)
  }

  // ---- Learning system ----
  const learnFromInteraction = (userText, aiResponse) => {
    const memory = loadState('jarvis_learned', {
      topics: {},
      interactionCount: 0,
      lastActive: null,
      preferredTimes: {},
    })

    memory.interactionCount = (memory.interactionCount || 0) + 1
    memory.lastActive = new Date().toISOString()

    // Track active hours
    const hour = new Date().getHours()
    memory.preferredTimes[hour] = (memory.preferredTimes[hour] || 0) + 1

    // Track topics
    const topics = ['task', 'reminder', 'schedule', 'meal', 'train', 'email', 'travel', 'workout', 'money', 'habit']
    for (const topic of topics) {
      if (userText.toLowerCase().includes(topic)) {
        memory.topics[topic] = (memory.topics[topic] || 0) + 1
      }
    }

    saveState('jarvis_learned', memory)
  }

  // ---- Search ----
  const filteredMessages = searchQuery
    ? messages.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const smartPrompts = getSmartPrompts(appContext)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', height: 'calc(100dvh - 120px)' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: colors.primary, boxShadow: `0 0 8px ${colors.primary}`,
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            color: colors.primary, fontSize: 12, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>J.A.R.V.I.S. INTERFACE</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSearchOpen(!searchOpen)} style={headerBtn}>
            {searchOpen ? 'CLOSE' : 'SEARCH'}
          </button>
          <button onClick={clearChat} style={headerBtn}>CLEAR</button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            autoFocus
            style={{
              width: '100%', padding: '8px 12px',
              background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8,
              color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
            }}
          />
          {searchQuery && (
            <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Action feedback toast */}
      {actionFeedback && (
        <div style={{
          padding: '8px 16px', flexShrink: 0,
          background: actionFeedback.type === 'success' ? 'rgba(0, 230, 118, 0.1)' :
            actionFeedback.type === 'error' ? 'rgba(255, 77, 77, 0.1)' : colors.primaryDim,
          borderBottom: `1px solid ${actionFeedback.type === 'success' ? colors.success :
            actionFeedback.type === 'error' ? colors.danger : colors.primary}`,
        }}>
          <span style={{
            color: actionFeedback.type === 'success' ? colors.success :
              actionFeedback.type === 'error' ? colors.danger : colors.primary,
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{actionFeedback.text}</span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filteredMessages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12, animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: 10,
              background: msg.role === 'user' ? colors.primaryDim : colors.surfaceLight,
              border: `1px solid ${msg.role === 'user' ? 'rgba(0, 212, 255, 0.3)' : colors.border}`,
            }}>
              {msg.role === 'ai' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: colors.primary, boxShadow: `0 0 6px ${colors.primary}`,
                  }} />
                  <span style={{
                    color: colors.primary, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>JARVIS</span>
                </div>
              )}
              <p style={{
                color: colors.text, fontSize: 14, lineHeight: 1.6, margin: 0,
                fontFamily: "'Exo 2', sans-serif", whiteSpace: 'pre-wrap',
              }}>{msg.text}</p>

              {/* Inline action buttons */}
              {msg.actions && msg.actions.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.actions.slice(0, 5).map((action, ai) => (
                    <button key={ai} onClick={() => executeAction(action)} style={{
                      padding: '8px 12px', fontSize: 11, borderRadius: 8, minHeight: 36,
                      background: 'rgba(0, 230, 118, 0.1)',
                      border: `1px solid ${colors.success}`,
                      color: colors.success, cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
                    }}>
                      {action.icon} {action.type.toUpperCase()}: {action.title || action.text}
                    </button>
                  ))}
                </div>
              )}

              <div style={{
                color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: 'right',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{msg.time}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{
              padding: '12px 20px',
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: colors.primary,
                  animation: 'pulse 1s ease-in-out infinite',
                }} />
                <span style={{
                  color: colors.textMuted, fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                }}>PROCESSING</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Smart quick actions */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
        {smartPrompts.map(s => (
          <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50) }} style={{
            padding: '10px 14px', background: 'transparent',
            border: `1px solid ${colors.border}`, borderRadius: 8,
            color: colors.textMuted, fontSize: 12, cursor: 'pointer', minHeight: 40,
            whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 0.5, transition: 'all 0.15s ease',
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
            flex: 1, padding: '12px 14px', borderRadius: 8,
            background: colors.surface, border: `1px solid ${colors.border}`,
            color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif", minHeight: 44,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          }}
        />
        <button onClick={send} disabled={!input.trim() || typing} style={{
          width: 44, height: 44, borderRadius: 8,
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

const headerBtn = {
  padding: '10px 14px', background: 'transparent',
  border: `1px solid ${colors.border}`, color: colors.textMuted,
  fontSize: 11, cursor: 'pointer', minHeight: 44, borderRadius: 8,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
