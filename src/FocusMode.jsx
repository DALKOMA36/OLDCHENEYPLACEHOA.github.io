import { useState, useEffect, useRef } from 'react'
import { colors, loadState, saveState } from './constants'

// JARVIS Focus Mode — "Suit Up"
// Pomodoro-style deep work with JARVIS check-ins
// Suppresses everything, shows only timer + current task

const FOCUS_PRESETS = [
  { label: '25 MIN', minutes: 25, break: 5 },
  { label: '45 MIN', minutes: 45, break: 10 },
  { label: '90 MIN', minutes: 90, break: 15 },
  { label: 'CUSTOM', minutes: 0, break: 5 },
]

const CHECKIN_MESSAGES = [
  "Still focused, sir? You're doing well.",
  "Progress check. How's it going?",
  "Halfway through. Stay sharp.",
  "Keep at it, sir. You're in the zone.",
  "Just checking in. All systems quiet out here.",
  "The outside world can wait. Stay focused.",
]

export default function FocusMode({ onExit }) {
  const [phase, setPhase] = useState('setup') // setup, focus, break, complete
  const [preset, setPreset] = useState(FOCUS_PRESETS[0])
  const [customMin, setCustomMin] = useState(30)
  const [task, setTask] = useState('')
  const [timeLeft, setTimeLeft] = useState(0) // seconds
  const [totalTime, setTotalTime] = useState(0)
  const [checkinMsg, setCheckinMsg] = useState(null)
  const [sessions, setSessions] = useState(0)
  const timerRef = useRef(null)
  const checkinRef = useRef(null)

  const startFocus = () => {
    const minutes = preset.minutes || customMin
    setTotalTime(minutes * 60)
    setTimeLeft(minutes * 60)
    setPhase('focus')

    // JARVIS speaks
    speak(`Focus mode engaged, sir. ${minutes} minutes on the clock. Let's do this.`)

    // Schedule random check-ins every 8-12 minutes
    scheduleCheckin()
  }

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

  const scheduleCheckin = () => {
    const delay = (8 + Math.random() * 4) * 60 * 1000 // 8-12 min
    checkinRef.current = setTimeout(() => {
      const msg = CHECKIN_MESSAGES[Math.floor(Math.random() * CHECKIN_MESSAGES.length)]
      setCheckinMsg(msg)
      speak(msg)
      setTimeout(() => setCheckinMsg(null), 8000)
      scheduleCheckin() // Schedule next
    }, delay)
  }

  // Timer countdown
  useEffect(() => {
    if (phase !== 'focus' && phase !== 'break') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (phase === 'focus') {
            speak("Time's up, sir. Excellent focus session. Take a break — you've earned it.")
            setSessions(s => s + 1)
            setPhase('break')
            setTimeLeft(preset.break * 60)
            setTotalTime(preset.break * 60)
            return preset.break * 60
          } else {
            speak("Break's over, sir. Ready for another round?")
            setPhase('complete')
            return 0
          }
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Cleanup
  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(checkinRef.current)
    window.speechSynthesis?.cancel()
  }, [])

  const exitFocus = () => {
    clearInterval(timerRef.current)
    clearTimeout(checkinRef.current)
    window.speechSynthesis?.cancel()
    if (phase === 'focus') {
      speak("Focus mode disengaged. Good work, sir.")
    }
    onExit()
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const progress = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 0

  // ---- Setup screen ----
  if (phase === 'setup') {
    return (
      <div style={overlayStyle}>
        <div style={{ maxWidth: 400, width: '100%', padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{
              color: colors.primary, fontSize: 14, fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3, marginBottom: 4,
            }}>FOCUS MODE</div>
            <div style={{
              color: colors.textMuted, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}>Suiting up. All distractions eliminated.</div>
          </div>

          {/* Task input */}
          <input
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="What are you focusing on?"
            autoFocus
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 16,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
              textAlign: 'center',
            }}
          />

          {/* Duration presets */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {FOCUS_PRESETS.map((p, i) => (
              <button key={i} onClick={() => setPreset(p)} style={{
                flex: 1, padding: '12px 0', fontSize: 10,
                background: preset === p ? colors.primaryDim : 'transparent',
                border: `1px solid ${preset === p ? colors.primary : colors.border}`,
                color: preset === p ? colors.primary : colors.textMuted,
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{p.label}</button>
            ))}
          </div>

          {/* Custom duration */}
          {preset.minutes === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <input
                value={customMin}
                onChange={e => setCustomMin(parseInt(e.target.value) || 0)}
                type="number"
                min="5"
                max="180"
                style={{
                  width: 60, padding: '8px 12px', textAlign: 'center',
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  color: colors.primary, fontSize: 18, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <span style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>MINUTES</span>
            </div>
          )}

          {/* Start button */}
          <button onClick={startFocus} style={{
            width: '100%', padding: 16, marginBottom: 10,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`,
            color: colors.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
            boxShadow: `0 0 20px ${colors.primary}20`,
          }}>SUIT UP</button>

          <button onClick={onExit} style={{
            width: '100%', padding: 10, background: 'transparent',
            border: `1px solid ${colors.border}`, color: colors.textMuted,
            fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
          }}>CANCEL</button>
        </div>
      </div>
    )
  }

  // ---- Active focus / break / complete ----
  return (
    <div style={overlayStyle}>
      {/* Circular progress ring */}
      <div style={{ position: 'relative', width: 220, height: 220, margin: '0 auto 30px' }}>
        <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx="110" cy="110" r="100" fill="none"
            stroke={colors.border} strokeWidth="3" />
          {/* Progress ring */}
          <circle cx="110" cy="110" r="100" fill="none"
            stroke={phase === 'break' ? colors.success : colors.primary}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 100}`}
            strokeDashoffset={`${2 * Math.PI * 100 * (1 - progress / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 6px ${phase === 'break' ? colors.success : colors.primary})` }}
          />
        </svg>
        {/* Center content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            color: phase === 'break' ? colors.success : colors.primary,
            fontSize: 42, fontWeight: 300,
            fontFamily: "'Rajdhani', sans-serif",
            textShadow: `0 0 15px ${phase === 'break' ? colors.success : colors.primary}30`,
            lineHeight: 1,
          }}>
            {formatTime(timeLeft)}
          </div>
          <div style={{
            color: colors.textMuted, fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
            marginTop: 6,
          }}>
            {phase === 'focus' ? 'FOCUSING' : phase === 'break' ? 'BREAK' : 'COMPLETE'}
          </div>
        </div>
      </div>

      {/* Task display */}
      {task && (
        <div style={{
          textAlign: 'center', marginBottom: 20, padding: '10px 20px',
          border: `1px solid ${colors.border}`, background: colors.surfaceLight,
        }}>
          <div style={{
            color: colors.textMuted, fontSize: 8, marginBottom: 4,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>CURRENT OBJECTIVE</div>
          <div style={{
            color: colors.text, fontSize: 15, fontWeight: 500,
            fontFamily: "'Exo 2', sans-serif",
          }}>{task}</div>
        </div>
      )}

      {/* JARVIS check-in message */}
      {checkinMsg && (
        <div style={{
          textAlign: 'center', padding: '8px 16px', marginBottom: 16,
          background: colors.primaryDim, border: `1px solid ${colors.primary}`,
          animation: 'focusFadeIn 0.3s ease',
        }}>
          <div style={{
            color: colors.primary, fontSize: 11, fontStyle: 'italic',
            fontFamily: "'Exo 2', sans-serif",
          }}>{checkinMsg}</div>
        </div>
      )}

      {/* Session counter */}
      <div style={{
        textAlign: 'center', color: colors.textMuted, fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 20,
      }}>
        {sessions > 0 ? `${sessions} SESSION${sessions > 1 ? 'S' : ''} COMPLETE` : 'SESSION 1'}
      </div>

      {/* Controls */}
      {phase === 'complete' ? (
        <div style={{ display: 'flex', gap: 8, maxWidth: 300, margin: '0 auto', width: '100%' }}>
          <button onClick={() => { setPhase('setup') }} style={{
            flex: 1, padding: 14,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`,
            color: colors.primary, fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>ANOTHER ROUND</button>
          <button onClick={exitFocus} style={{
            flex: 1, padding: 14, background: 'transparent',
            border: `1px solid ${colors.border}`, color: colors.textMuted,
            fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
          }}>STAND DOWN</button>
        </div>
      ) : (
        <button onClick={exitFocus} style={{
          display: 'block', margin: '0 auto', padding: '10px 30px',
          background: 'transparent', border: `1px solid ${colors.border}`,
          color: colors.textMuted, fontSize: 9, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>EXIT FOCUS MODE</button>
      )}

      <style>{`@keyframes focusFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 9998,
  background: '#050810',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: 24,
}
