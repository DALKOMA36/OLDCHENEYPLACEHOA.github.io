import { useState, useRef, useEffect } from 'react'
import { colors } from '../constants'
import { db } from '../db'

// Check for Web Speech API support
const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

export default function Voice({ user, addMemory }) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [conversation, setConversation] = useState([])
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [amplitude, setAmplitude] = useState(0)
  const [supported] = useState(!!SpeechRecognition)
  const recognitionRef = useRef(null)
  const animRef = useRef(null)
  const synthRef = useRef(null)

  // Amplitude animation when listening
  useEffect(() => {
    if (listening) {
      const animate = () => {
        setAmplitude(0.3 + Math.random() * 0.7)
        animRef.current = requestAnimationFrame(animate)
      }
      animRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(animRef.current)
      setAmplitude(0)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [listening])

  const startListening = () => {
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser')
      return
    }
    setError('')
    setTranscript('')

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript
        } else {
          interim += event.results[i][0].transcript
        }
      }
      setTranscript(final || interim)
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(`Recognition error: ${event.error}`)
      }
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stopListening = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setListening(false)

    // Wait a beat for final transcript
    await new Promise(r => setTimeout(r, 300))

    const text = transcript.trim()
    if (!text) return

    // Add user message
    setConversation(prev => [...prev, { role: 'user', text }])
    addMemory(`Voice: "${text.slice(0, 100)}"`)
    setTranscript('')
    setProcessing(true)

    // Get AI response
    try {
      const today = new Date().toISOString().split('T')[0]
      const [events, tasks, reminders] = await Promise.all([
        db.events.list(today).catch(() => []),
        db.tasks.list().catch(() => []),
        db.reminders.list().catch(() => []),
      ])

      const context = {
        userName: user.name,
        todayEvents: events,
        pendingTasks: tasks.filter(t => !t.completed),
        upcomingReminders: reminders.filter(r => !r.dismissed),
      }

      const result = await db.ai.chat(text, conversation.slice(-10), context)
      const response = result.response

      setConversation(prev => [...prev, { role: 'ai', text: response }])

      // Speak the response
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(response)
        utter.rate = 1.0
        utter.pitch = 0.95
        // Try to find a good voice
        const voices = window.speechSynthesis.getVoices()
        const preferred = voices.find(v => v.name.includes('Google') && v.lang === 'en-US')
          || voices.find(v => v.name.includes('Daniel'))
          || voices.find(v => v.lang === 'en-US' && !v.localService)
          || voices.find(v => v.lang.startsWith('en'))
        if (preferred) utter.voice = preferred
        utter.onstart = () => setSpeaking(true)
        utter.onend = () => setSpeaking(false)
        window.speechSynthesis.speak(utter)
        synthRef.current = utter
      }
    } catch (err) {
      setConversation(prev => [...prev, { role: 'ai', text: 'Voice processing interrupted. Please try again.' }])
    }
    setProcessing(false)
  }

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }

  const ringSize = 140

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100vh - 200px)' }}>
      <h2 style={{
        color: colors.primary, fontSize: 11, fontWeight: 600, marginBottom: 4, alignSelf: 'flex-start',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3, textTransform: 'uppercase',
      }}>Voice Interface</h2>
      <p style={{
        color: colors.textMuted, fontSize: 11, marginBottom: 24, alignSelf: 'flex-start',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {supported ? 'Tap to speak. Real speech recognition + AI.' : 'Speech recognition not available in this browser.'}
      </p>

      {/* Voice Orb */}
      <div style={{ position: 'relative', width: ringSize + 80, height: ringSize + 80, marginBottom: 16 }}>
        {[1, 0.75, 0.5].map((scale, i) => (
          <div key={i} style={{
            position: 'absolute', top: '50%', left: '50%',
            width: ringSize * (1 + (listening ? amplitude * 0.25 * (i + 1) : speaking ? 0.1 * (i + 1) : 0)),
            height: ringSize * (1 + (listening ? amplitude * 0.25 * (i + 1) : speaking ? 0.1 * (i + 1) : 0)),
            borderRadius: '50%',
            border: `1px solid ${listening ? `rgba(0, 212, 255, ${0.5 - i * 0.15})` : speaking ? `rgba(0, 230, 118, ${0.4 - i * 0.1})` : `rgba(0, 212, 255, ${0.1})`}`,
            transform: 'translate(-50%, -50%)',
            transition: listening || speaking ? 'none' : 'all 0.3s ease',
          }} />
        ))}
        <button
          onClick={() => {
            if (speaking) { stopSpeaking(); return }
            if (listening) { stopListening(); return }
            if (!processing) startListening()
          }}
          disabled={processing || !supported}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: ringSize, height: ringSize, borderRadius: '50%',
            background: listening ? 'rgba(0, 212, 255, 0.15)' : speaking ? 'rgba(0, 230, 118, 0.1)' : 'rgba(0, 212, 255, 0.05)',
            border: `1px solid ${listening ? colors.primary : speaking ? colors.success : colors.border}`,
            cursor: processing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
            boxShadow: listening ? `0 0 40px rgba(0, 212, 255, 0.2)` : speaking ? `0 0 30px rgba(0, 230, 118, 0.15)` : 'none',
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: listening ? colors.primary : speaking ? colors.success : processing ? colors.warning : colors.textMuted,
            boxShadow: listening ? `0 0 12px ${colors.primary}` : speaking ? `0 0 10px ${colors.success}` : 'none',
            animation: processing ? 'pulse 1s ease-in-out infinite' : 'none',
          }} />
        </button>
      </div>

      <div style={{
        color: listening ? colors.primary : speaking ? colors.success : processing ? colors.warning : colors.textMuted,
        fontSize: 10, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
      }}>
        {processing ? 'PROCESSING' : listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'READY'}
      </div>

      {/* Live transcript */}
      {transcript && (
        <div style={{
          color: colors.text, fontSize: 13, marginBottom: 16, textAlign: 'center',
          fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic', maxWidth: 300,
        }}>"{transcript}"</div>
      )}

      {error && (
        <div style={{
          color: colors.danger, fontSize: 10, marginBottom: 16,
          fontFamily: "'JetBrains Mono', monospace",
        }}>[ERROR] {error}</div>
      )}

      {/* Conversation */}
      {conversation.length > 0 && (
        <div style={{ width: '100%', maxWidth: 500, marginTop: 8 }}>
          <div style={{
            color: colors.textMuted, fontSize: 9, marginBottom: 10,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>TRANSCRIPT LOG</div>
          {conversation.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}>
              <div style={{
                maxWidth: '85%', padding: '8px 12px',
                background: msg.role === 'user' ? colors.primaryDim : 'rgba(15, 25, 45, 0.7)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(0, 212, 255, 0.3)' : colors.border}`,
              }}>
                {msg.role === 'ai' && (
                  <div style={{
                    color: colors.primary, fontSize: 9, marginBottom: 4,
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>JARVIS</div>
                )}
                <p style={{
                  color: colors.text, fontSize: 12, margin: 0, lineHeight: 1.5,
                  fontFamily: "'Exo 2', sans-serif",
                }}>{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
