import { useState, useEffect, useRef } from 'react'
import { colors, loadState, saveState } from './constants'
import { db } from './db'
import JarvisAvatar from './JarvisAvatar'

// JARVIS Always-On Assistant
// Persistent overlay that listens, watches what screen you're on,
// and proactively suggests things. Like having JARVIS in your ear.

const SCREEN_TIPS = {
  tasks: [
    "I can see your tasks. Shall I prioritize them for you?",
    "Need me to break any of these into subtasks?",
    "I notice some tasks don't have due dates. Want me to suggest some?",
  ],
  calendar: [
    "Looking at your calendar. Want me to find a free slot?",
    "I can check for scheduling conflicts if you'd like.",
    "Shall I suggest optimal times for your next meeting?",
  ],
  meals: [
    "Planning meals? I can generate a full week based on your preferences.",
    "Need grocery list items? I can compile them from your meal plan.",
  ],
  reminders: [
    "I see your reminders. Need me to reschedule any overdue ones?",
    "Want me to set a recurring reminder for something?",
  ],
  finance: [
    "Reviewing finances? I can analyze your spending patterns.",
    "Want a summary of where your money's going this month?",
  ],
  reader: [
    "Ready to read something? I can fetch an article or open a document.",
    "Want me to summarize what you're reading?",
  ],
  habits: [
    "Checking habits. Great job staying consistent!",
    "Need me to suggest a new habit to build?",
  ],
  notes: [
    "Working on notes? I can help organize or summarize them.",
    "Want me to turn any notes into tasks or reminders?",
  ],
  travel: [
    "Planning a trip? Tell me the destination and I'll handle the rest.",
    "Want me to check weather for your upcoming trips?",
  ],
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function JarvisAssistant({ active, onClose, currentScreen, user }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [processing, setProcessing] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const recognitionRef = useRef(null)
  const autoSuggestRef = useRef(null)

  // Show contextual suggestion when activated or screen changes
  useEffect(() => {
    if (!active) return
    const tips = SCREEN_TIPS[currentScreen]
    if (tips) {
      const tip = pick(tips)
      setSuggestion(tip)
      speak(tip)
    } else {
      setSuggestion("I'm here, sir. Listening.")
      speak("I'm here, sir. What do you need?")
    }

    // Auto-suggest every 2 minutes
    autoSuggestRef.current = setInterval(() => {
      const tips = SCREEN_TIPS[currentScreen]
      if (tips) setSuggestion(pick(tips))
    }, 120000)

    return () => clearInterval(autoSuggestRef.current)
  }, [active, currentScreen])

  // Start/stop listening
  useEffect(() => {
    if (!active || !SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      setTranscript(interim || final)
      if (final.trim()) {
        processCommand(final.trim())
        setTranscript('')
      }
    }

    recognition.onerror = () => {}
    recognition.onend = () => {
      // Auto-restart if still active
      if (active) {
        try { recognition.start() } catch {}
      }
    }

    try {
      recognition.start()
      setListening(true)
    } catch {}

    recognitionRef.current = recognition

    return () => {
      try { recognition.stop() } catch {}
      setListening(false)
    }
  }, [active])

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.95
    utter.pitch = 0.9
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => v.name.includes('Daniel'))
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang === 'en-US')
    if (preferred) utter.voice = preferred
    window.speechSynthesis.speak(utter)
  }

  const processCommand = async (text) => {
    setProcessing(true)
    setResponse('')

    try {
      const context = {
        userName: user.name,
        currentScreen,
        instruction: 'The user is speaking to you while using the app. They are currently on the ' + currentScreen + ' screen. Be concise — 1-2 sentences max. Be helpful and proactive.',
      }

      const result = await db.ai.chat(text, [], context)
      if (result.response) {
        setResponse(result.response)
        speak(result.response)
      }
    } catch {
      const fallback = "I didn't catch that clearly, sir. Could you repeat?"
      setResponse(fallback)
      speak(fallback)
    }

    setProcessing(false)
  }

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 95,
      background: `linear-gradient(to bottom, rgba(0, 212, 255, 0.08), transparent)`,
      pointerEvents: 'none',
    }}>
      {/* Floating assistant bar */}
      <div style={{
        position: 'fixed', top: 70, right: 12, left: 12,
        padding: '10px 14px',
        background: 'rgba(5, 8, 16, 0.95)',
        border: `1px solid ${colors.primary}40`,
        boxShadow: `0 4px 20px rgba(0, 212, 255, 0.15)`,
        backdropFilter: 'blur(12px)',
        zIndex: 95,
        pointerEvents: 'all',
        animation: 'assistFadeIn 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: listening ? colors.success : colors.primary,
              boxShadow: `0 0 8px ${listening ? colors.success : colors.primary}`,
              animation: listening ? 'assistPulse 1s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              color: colors.primary, fontSize: 9, fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
            }}>
              {processing ? 'THINKING' : listening ? 'LISTENING' : 'STANDBY'}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 8, cursor: 'pointer',
            padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace",
          }}>DISMISS</button>
        </div>

        {/* Mini avatar + content */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            <JarvisAvatar speaking={!!response} listening={listening} size={50} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>

        {/* Live transcript */}
        {transcript && (
          <div style={{
            color: colors.textSecondary, fontSize: 11, marginBottom: 4,
            fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic',
          }}>"{transcript}"</div>
        )}

        {/* JARVIS response or suggestion */}
        <div style={{
          color: response ? colors.text : colors.textMuted,
          fontSize: response ? 12 : 11,
          fontFamily: "'Exo 2', sans-serif",
          lineHeight: 1.5,
        }}>
          {response || suggestion}
        </div>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes assistFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes assistPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
