import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'
import JarvisAvatar from '../JarvisAvatar'

// Check for Web Speech API support
const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

// Available screens for navigation commands
const SCREEN_ALIASES = {
  tasks: 'tasks', task: 'tasks', 'to do': 'tasks', todos: 'tasks',
  calendar: 'calendar', schedule: 'calendar', events: 'calendar',
  chat: 'chat', messages: 'chat', ai: 'chat',
  dashboard: 'dashboard', home: 'dashboard', main: 'dashboard',
  meals: 'meals', food: 'meals', 'meal planner': 'meals',
  scanner: 'scanner', scan: 'scanner',
  channels: 'channels', channel: 'channels',
  voice: 'voice',
  reader: 'reader', read: 'reader',
  travel: 'travel', trips: 'travel', trip: 'travel',
  builder: 'builder', apps: 'builder',
  reminders: 'reminders', reminder: 'reminders',
  settings: 'settings', config: 'settings',
  trains: 'trains', train: 'trains',
}

// ---- Command parser: detect direct voice commands ----
function parseCommand(text) {
  const lower = text.toLowerCase().trim()

  // "add task [title]"
  const taskMatch = lower.match(/^(?:add|create|new)\s+task\s+(.+)$/i)
  if (taskMatch) {
    return { type: 'add_task', title: taskMatch[1].trim(), display: `Create task: "${taskMatch[1].trim()}"` }
  }

  // "set reminder [text]"
  const reminderMatch = lower.match(/^(?:set|add|create)\s+(?:a\s+)?reminder\s+(.+)$/i)
  if (reminderMatch) {
    return { type: 'set_reminder', text: reminderMatch[1].trim(), display: `Set reminder: "${reminderMatch[1].trim()}" (1 hour from now)` }
  }

  // "set timer [N] minutes"
  const timerMatch = lower.match(/^(?:set|start)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(?:minute|minutes|min|mins)$/i)
  if (timerMatch) {
    const mins = parseInt(timerMatch[1])
    return { type: 'set_timer', minutes: mins, display: `Starting ${mins}-minute countdown timer` }
  }

  // "what's next" / "what is next"
  if (/^what(?:'s|s|\s+is)\s+next/i.test(lower) || lower === 'next event' || lower === 'next up') {
    return { type: 'whats_next', display: 'Checking your next event...' }
  }

  // "what time is it"
  if (/^what(?:'s|s|\s+is)\s+(?:the\s+)?time/i.test(lower) || lower === 'time') {
    return { type: 'time', display: 'Telling the time' }
  }

  // "navigate to [screen]" / "go to [screen]" / "open [screen]" / "show [screen]"
  const navMatch = lower.match(/^(?:navigate\s+to|go\s+to|open|show|switch\s+to|take\s+me\s+to)\s+(.+)$/i)
  if (navMatch) {
    const target = navMatch[1].trim()
    const screenKey = SCREEN_ALIASES[target]
    if (screenKey) {
      return { type: 'navigate', screen: screenKey, display: `Navigating to ${screenKey}` }
    }
    return { type: 'navigate_unknown', target, display: `Unknown screen: "${target}"` }
  }

  // "suit up" / "focus mode"
  if (/^(?:suit\s+up|focus\s+mode|activate\s+focus)/i.test(lower)) {
    return { type: 'focus_mode', display: 'Activating focus mode...' }
  }

  return null // Not a direct command — pass to AI
}

export default function Voice({ user, addMemory, navigate, startFocusMode }) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [conversation, setConversation] = useState([])
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [amplitude, setAmplitude] = useState(0)
  const [supported] = useState(!!SpeechRecognition)
  const [useCloudTTS, setUseCloudTTS] = useState(() => loadState('voice_cloud_tts', false))
  const [commandPreview, setCommandPreview] = useState(null)
  const [activeTimers, setActiveTimers] = useState([])
  const [appContext, setAppContext] = useState(null)
  const [micAmplitudes, setMicAmplitudes] = useState(new Array(24).fill(0))
  const recognitionRef = useRef(null)
  const animRef = useRef(null)
  const synthRef = useRef(null)
  const audioRef = useRef(null)
  const analyserRef = useRef(null)
  const micStreamRef = useRef(null)
  const conversationRef = useRef(null)

  // Load app context (events, tasks, reminders) for AI awareness
  useEffect(() => {
    let cancelled = false
    const loadContext = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const [events, tasks, reminders] = await Promise.all([
          db.events.list(today).catch(() => []),
          db.tasks.list().catch(() => []),
          db.reminders.list().catch(() => []),
        ])
        if (!cancelled) {
          setAppContext({
            userName: user.name,
            todayEvents: events,
            pendingTasks: tasks.filter(t => !t.completed),
            upcomingReminders: reminders.filter(r => !r.dismissed),
          })
        }
      } catch {}
    }
    loadContext()
    // Refresh context every 2 minutes
    const interval = setInterval(loadContext, 120000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [user.name])

  // Scroll conversation to bottom
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [conversation])

  // Real microphone amplitude analysis via Web Audio API
  const startMicAnalyser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = { analyser, audioCtx }

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const update = () => {
        analyser.getByteFrequencyData(dataArray)
        // Build waveform bars from frequency data
        const bars = []
        const step = Math.floor(dataArray.length / 24)
        for (let i = 0; i < 24; i++) {
          const val = dataArray[i * step] || 0
          bars.push(val / 255)
        }
        setMicAmplitudes(bars)
        // Overall amplitude for the orb rings
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255
        setAmplitude(0.2 + avg * 1.5)
        animRef.current = requestAnimationFrame(update)
      }
      animRef.current = requestAnimationFrame(update)
    } catch {
      // Fallback to random animation if mic access denied
      const animate = () => {
        setAmplitude(0.3 + Math.random() * 0.7)
        const bars = new Array(24).fill(0).map(() => Math.random() * 0.6)
        setMicAmplitudes(bars)
        animRef.current = requestAnimationFrame(animate)
      }
      animRef.current = requestAnimationFrame(animate)
    }
  }, [])

  const stopMicAnalyser = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    if (analyserRef.current) {
      analyserRef.current.audioCtx.close().catch(() => {})
      analyserRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    setAmplitude(0)
    setMicAmplitudes(new Array(24).fill(0))
  }, [])

  // Speaking amplitude animation (synthetic pulse when using TTS)
  useEffect(() => {
    if (speaking && !listening) {
      const animate = () => {
        setAmplitude(0.4 + Math.random() * 0.4)
        const bars = new Array(24).fill(0).map((_, i) => {
          const t = Date.now() / 200
          return 0.2 + Math.abs(Math.sin(t + i * 0.3)) * 0.6
        })
        setMicAmplitudes(bars)
        animRef.current = requestAnimationFrame(animate)
      }
      animRef.current = requestAnimationFrame(animate)
      return () => cancelAnimationFrame(animRef.current)
    }
    if (!listening && !speaking) {
      setAmplitude(0)
      setMicAmplitudes(new Array(24).fill(0))
    }
  }, [speaking, listening])

  // Persist cloud TTS preference
  useEffect(() => {
    saveState('voice_cloud_tts', useCloudTTS)
  }, [useCloudTTS])

  // ---- Speak response via browser TTS or Cloud TTS ----
  const speakResponse = useCallback(async (text) => {
    setSpeaking(true)

    if (useCloudTTS) {
      try {
        const audioUrl = await db.ai.tts(text, 'onyx', 1.0)
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.onended = () => {
          setSpeaking(false)
          URL.revokeObjectURL(audioUrl)
        }
        audio.onerror = () => {
          setSpeaking(false)
          URL.revokeObjectURL(audioUrl)
        }
        await audio.play()
      } catch {
        // Fallback to browser TTS on cloud failure
        speakBrowser(text)
      }
    } else {
      speakBrowser(text)
    }
  }, [useCloudTTS])

  const speakBrowser = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1.0
      utter.pitch = 0.9
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v => v.name.includes('Daniel'))
        || voices.find(v => v.name.includes('Google UK English Male'))
        || voices.find(v => v.name.includes('Google') && v.lang === 'en-GB')
        || voices.find(v => v.lang === 'en-GB' && !v.localService)
        || voices.find(v => v.lang === 'en-US' && !v.localService)
        || voices.find(v => v.lang.startsWith('en'))
      if (preferred) utter.voice = preferred
      utter.onstart = () => setSpeaking(true)
      utter.onend = () => setSpeaking(false)
      window.speechSynthesis.speak(utter)
      synthRef.current = utter
    } else {
      setSpeaking(false)
    }
  }

  // ---- Execute a parsed voice command ----
  const executeCommand = useCallback(async (cmd) => {
    setCommandPreview(null)
    setProcessing(true)

    try {
      switch (cmd.type) {
        case 'add_task': {
          await db.tasks.create({ title: cmd.title, priority: 'medium', category: 'personal' })
          const response = `Very good, sir. I've created the task: "${cmd.title}". It's been added to your task list.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        case 'set_reminder': {
          const reminderTime = new Date(Date.now() + 60 * 60 * 1000)
          await db.reminders.create({
            text: cmd.text,
            date: reminderTime.toISOString().split('T')[0],
            time: reminderTime.toTimeString().slice(0, 5),
            priority: 'normal',
            repeat: 'none',
          })
          const response = `Reminder set, sir. I'll prompt you about "${cmd.text}" at ${reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        case 'set_timer': {
          const endTime = Date.now() + cmd.minutes * 60 * 1000
          const timerId = setTimeout(async () => {
            const doneMsg = `Sir, your ${cmd.minutes}-minute timer has concluded.`
            setConversation(prev => [...prev, { role: 'ai', text: doneMsg, isCommand: true }])
            setActiveTimers(prev => prev.filter(t => t.id !== timerId))
            await speakResponse(doneMsg)
          }, cmd.minutes * 60 * 1000)
          setActiveTimers(prev => [...prev, { id: timerId, minutes: cmd.minutes, endTime }])
          const response = `Timer started, sir. ${cmd.minutes} minutes on the clock. I'll notify you when it's done.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        case 'whats_next': {
          const today = new Date().toISOString().split('T')[0]
          const events = appContext?.todayEvents || await db.events.list(today).catch(() => [])
          const now = new Date()
          const nowMinutes = now.getHours() * 60 + now.getMinutes()
          const upcoming = events
            .filter(e => {
              if (!e.time) return false
              const [h, m] = e.time.split(':').map(Number)
              return h * 60 + m > nowMinutes
            })
            .sort((a, b) => a.time.localeCompare(b.time))

          let response
          if (upcoming.length > 0) {
            const next = upcoming[0]
            response = `Your next event is "${next.title}" at ${next.time}${next.location ? `, at ${next.location}` : ''}. You have ${upcoming.length} more event${upcoming.length > 1 ? 's' : ''} remaining today.`
          } else {
            response = 'Your schedule is clear for the remainder of the day, sir. No upcoming events on the books.'
          }
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        case 'time': {
          const now = new Date()
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          const response = `It's ${timeStr}, sir. ${dateStr}.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        case 'navigate': {
          const response = `Right away, sir. Opening ${cmd.screen}.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          setTimeout(() => navigate(cmd.screen), 800)
          break
        }
        case 'focus_mode': {
          const response = "Right away, sir. Initializing focus mode. All non-essential systems suppressed."
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          setTimeout(() => startFocusMode?.(), 1000)
          break
        }
        case 'navigate_unknown': {
          const response = `I'm afraid I don't recognise a screen called "${cmd.target}", sir. You might try: tasks, calendar, chat, dashboard, meals, reminders, or settings.`
          setConversation(prev => [...prev, { role: 'ai', text: response, isCommand: true }])
          await speakResponse(response)
          break
        }
        default:
          break
      }
    } catch (err) {
      const errMsg = `I encountered a difficulty executing that command, sir. ${err.message || 'Please try again.'}`
      setConversation(prev => [...prev, { role: 'ai', text: errMsg }])
      await speakResponse(errMsg)
    }

    setProcessing(false)
  }, [appContext, navigate, speakResponse])

  const startListening = () => {
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser')
      return
    }
    setError('')
    setTranscript('')
    setCommandPreview(null)

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    let finalTranscript = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t + ' '
        } else {
          interim = t
        }
      }
      const current = (finalTranscript + interim).trim()
      setTranscript(current)
      // Live command detection preview
      const cmd = parseCommand(current)
      setCommandPreview(cmd)
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      if (event.error === 'no-speech') {
        // No speech detected — restart silently
        try { recognition.start() } catch {}
        return
      }
      if (event.error === 'audio-capture') {
        setError('Microphone not available. Make sure no other app is using the mic, then reload this page.')
      } else if (event.error === 'not-allowed') {
        setError('Microphone blocked. Allow mic access in browser settings and reload.')
      } else {
        setError(`Voice error: ${event.error}`)
      }
      setListening(false)
      stopMicAnalyser()
    }

    recognition.onend = () => {
      // On mobile, recognition can end unexpectedly — auto-restart if still supposed to be listening
      if (recognitionRef.current === recognition && !processing) {
        try { recognition.start() } catch {
          setListening(false)
          stopMicAnalyser()
        }
        return
      }
      setListening(false)
      stopMicAnalyser()
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
    startMicAnalyser()
  }

  const stopListening = async () => {
    const rec = recognitionRef.current
    recognitionRef.current = null // prevent auto-restart in onend
    if (rec) {
      try { rec.stop() } catch {}
    }
    setListening(false)
    stopMicAnalyser()

    // Wait a beat for final transcript
    await new Promise(r => setTimeout(r, 300))

    const text = transcript.trim()
    if (!text) return

    // Add user message to conversation
    setConversation(prev => [...prev, { role: 'user', text }])
    addMemory(`Voice: "${text.slice(0, 100)}"`)
    setTranscript('')

    // Check for direct voice command first
    const cmd = parseCommand(text)
    if (cmd) {
      setCommandPreview(null)
      await executeCommand(cmd)
      return
    }

    // Not a command — send to AI with full context
    setProcessing(true)
    setCommandPreview(null)

    try {
      const context = appContext || {
        userName: user.name,
        todayEvents: [],
        pendingTasks: [],
        upcomingReminders: [],
      }

      const result = await db.ai.chat(text, conversation.slice(-10), context)
      const response = result.response

      setConversation(prev => [...prev, { role: 'ai', text: response }])
      await speakResponse(response)
    } catch (err) {
      const errText = 'Voice processing interrupted, sir. My apologies. Please try again.'
      setConversation(prev => [...prev, { role: 'ai', text: errText }])
    }
    setProcessing(false)
  }

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeaking(false)
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      activeTimers.forEach(t => clearTimeout(t.id))
    }
  }, [activeTimers])

  const ringSize = 140
  const statusText = processing ? 'PROCESSING' : listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'STANDING BY'
  const statusColor = listening ? colors.primary : speaking ? colors.success : processing ? colors.warning : colors.textMuted

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 500, marginBottom: 20 }}>
        <div>
          <h2 style={{
            color: colors.primary, fontSize: 13, fontWeight: 600, marginBottom: 4,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: 'uppercase',
            margin: 0,
          }}>J.A.R.V.I.S. Voice Interface</h2>
          <p style={{
            color: colors.textMuted, fontSize: 12, margin: '4px 0 0 0',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {supported ? 'At your service, sir. Tap the orb to speak.' : 'Speech recognition not available in this browser.'}
          </p>
        </div>
        {/* Cloud TTS toggle */}
        <button
          onClick={() => setUseCloudTTS(!useCloudTTS)}
          title={useCloudTTS ? 'Using OpenAI TTS (Onyx voice)' : 'Using browser TTS'}
          style={{
            padding: '10px 14px', minHeight: 44, borderRadius: 8,
            background: useCloudTTS ? 'rgba(0, 230, 118, 0.15)' : 'transparent',
            border: `1px solid ${useCloudTTS ? colors.success : colors.border}`,
            color: useCloudTTS ? colors.success : colors.textMuted,
            fontSize: 11, cursor: 'pointer', flexShrink: 0,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            transition: 'all 0.2s ease',
          }}
        >
          {useCloudTTS ? 'CLOUD TTS' : 'LOCAL TTS'}
        </button>
      </div>

      {/* Active timers display */}
      {activeTimers.length > 0 && (
        <div style={{ width: '100%', maxWidth: 500, marginBottom: 12 }}>
          {activeTimers.map((timer, i) => (
            <TimerDisplay key={timer.id} timer={timer} onClear={() => {
              clearTimeout(timer.id)
              setActiveTimers(prev => prev.filter(t => t.id !== timer.id))
            }} />
          ))}
        </div>
      )}

      {/* JARVIS Avatar — tap to speak */}
      <button
        onClick={() => {
          if (speaking) { stopSpeaking(); return }
          if (listening) { stopListening(); return }
          if (!processing) startListening()
        }}
        disabled={processing || !supported}
        style={{
          background: 'none', border: 'none', cursor: processing ? 'wait' : 'pointer',
          padding: 0, marginBottom: 8,
          WebkitTapHighlightColor: 'rgba(0,212,255,0.2)',
          touchAction: 'manipulation',
        }}
      >
        <JarvisAvatar speaking={speaking} listening={listening} size={Math.min(220, window.innerWidth - 80)} />
      </button>

      {/* Live transcript with command detection */}
      {transcript && (
        <div style={{ textAlign: 'center', maxWidth: 360, marginTop: 10, marginBottom: 8 }}>
          <div style={{
            color: colors.text, fontSize: 14, marginBottom: 6,
            fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic',
            animation: 'fadeIn 0.2s ease',
          }}>"{transcript}"</div>
          {commandPreview && (
            <div style={{
              color: colors.secondary, fontSize: 11, padding: '8px 12px', borderRadius: 8,
              background: colors.secondaryDim, border: `1px solid rgba(240, 165, 0, 0.3)`,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
              animation: 'fadeIn 0.2s ease',
            }}>
              COMMAND DETECTED: {commandPreview.display}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          color: colors.danger, fontSize: 12, marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}>[ERROR] {error}</div>
      )}

      {/* Quick command hints */}
      {!listening && !processing && !speaking && conversation.length === 0 && (
        <div style={{
          width: '100%', maxWidth: 500, marginTop: 12, padding: 16, borderRadius: 10,
          background: colors.surfaceLight, border: `1px solid ${colors.border}`,
        }}>
          <div style={{
            color: colors.textMuted, fontSize: 13, marginBottom: 10,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>VOICE COMMANDS</div>
          {[
            '"Add task [title]" — create a new task',
            '"Set reminder [text]" — reminder in 1 hour',
            '"Set timer [N] minutes" — countdown timer',
            '"What\'s next" — your next calendar event',
            '"What time is it" — current time',
            '"Navigate to [screen]" — switch screens',
          ].map((hint, i) => (
            <div key={i} style={{
              color: colors.textSecondary, fontSize: 14, marginBottom: 6, paddingLeft: 8,
              fontFamily: "'Exo 2', sans-serif", borderLeft: `2px solid ${colors.border}`,
            }}>{hint}</div>
          ))}
          <div style={{
            color: colors.textMuted, fontSize: 12, marginTop: 8,
            fontFamily: "'JetBrains Mono', monospace", fontStyle: 'italic',
          }}>Any other input routes to the AI core for natural conversation.</div>
        </div>
      )}

      {/* Conversation transcript */}
      {conversation.length > 0 && (
        <div ref={conversationRef} style={{
          width: '100%', maxWidth: 500, marginTop: 12, flex: 1,
          overflowY: 'auto', maxHeight: 'calc(100vh - 520px)',
        }}>
          <div style={{
            color: colors.textMuted, fontSize: 13, marginBottom: 10,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>TRANSCRIPT LOG</div>
          {conversation.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8, animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{
                maxWidth: '85%', padding: '12px 16px', borderRadius: 10,
                background: msg.role === 'user' ? colors.primaryDim :
                  msg.isCommand ? 'rgba(240, 165, 0, 0.08)' : colors.surfaceLight,
                border: `1px solid ${msg.role === 'user' ? 'rgba(0, 212, 255, 0.3)' :
                  msg.isCommand ? 'rgba(240, 165, 0, 0.25)' : colors.border}`,
              }}>
                {msg.role === 'ai' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: msg.isCommand ? colors.secondary : colors.primary,
                      boxShadow: `0 0 6px ${msg.isCommand ? colors.secondary : colors.primary}`,
                    }} />
                    <span style={{
                      color: msg.isCommand ? colors.secondary : colors.primary, fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                    }}>{msg.isCommand ? 'JARVIS // COMMAND' : 'JARVIS'}</span>
                  </div>
                )}
                <p style={{
                  color: colors.text, fontSize: 14, margin: 0, lineHeight: 1.5,
                  fontFamily: "'Exo 2', sans-serif",
                }}>{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

// ---- Timer display component with live countdown ----
function TimerDisplay({ timer, onClear }) {
  const [remaining, setRemaining] = useState(Math.max(0, timer.endTime - Date.now()))

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, timer.endTime - Date.now())
      setRemaining(left)
      if (left <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [timer.endTime])

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const pct = 1 - remaining / (timer.minutes * 60000)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10,
      background: 'rgba(255, 190, 48, 0.08)', border: `1px solid rgba(255, 190, 48, 0.25)`,
      marginBottom: 10,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: colors.warning, boxShadow: `0 0 6px ${colors.warning}`,
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{ flex: 1 }}>
        <div style={{
          color: colors.warning, fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>
          TIMER {timer.minutes}m — {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} remaining
        </div>
        <div style={{
          height: 2, marginTop: 4, background: 'rgba(255, 190, 48, 0.15)',
          borderRadius: 1, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct * 100}%`,
            background: colors.warning, transition: 'width 1s linear',
          }} />
        </div>
      </div>
      <button onClick={onClear} style={{
        background: 'none', border: `1px solid rgba(255, 190, 48, 0.3)`, borderRadius: 8,
        color: colors.warning, fontSize: 11, padding: '8px 12px', minHeight: 36, cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
      }}>CLEAR</button>
    </div>
  )
}
