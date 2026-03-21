import { useState, useEffect, useRef } from 'react'
import { colors, loadState } from './constants'

// JARVIS Boot Sequence — multiple cinematic startups
// Context-aware: time of day, last session, schedule, learned patterns
// Feels like a real AI waking up, not a loading screen

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function getBootSequence(user) {
  const now = new Date()
  const hour = now.getHours()
  const memory = loadState('jarvis_learned', {})
  const lastActive = memory.lastActive ? new Date(memory.lastActive) : null
  const hoursSinceActive = lastActive ? Math.round((now - lastActive) / 3600000) : 999
  const sessions = memory.interactionCount || 0
  const name = user.name || 'sir'
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })

  // Pick a sequence type based on context
  const sequenceType = hoursSinceActive > 24 ? 'long_absence'
    : hoursSinceActive > 8 ? 'returning'
    : hour < 6 ? 'late_night'
    : hour < 9 ? 'early_morning'
    : hour < 12 ? 'morning'
    : hour < 17 ? 'afternoon'
    : hour < 21 ? 'evening'
    : 'night'

  // Common system check lines
  const sysChecks = [
    { text: '[OK] Neural processing core', color: 'success', speed: 'fast' },
    { text: '[OK] Language model synced', color: 'success', speed: 'fast' },
    { text: '[OK] Memory banks online', color: 'success', speed: 'fast' },
    { text: '[OK] Communication array', color: 'success', speed: 'fast' },
    { text: `[OK] User profile: ${name}`, color: 'success', speed: 'fast' },
  ]

  const sysChecksAlt = [
    { text: 'Engaging primary systems...', color: 'textSecondary' },
    { text: '> Language processing .......... OK', color: 'success', speed: 'fast' },
    { text: '> Pattern recognition .......... OK', color: 'success', speed: 'fast' },
    { text: '> Schedule integration ......... OK', color: 'success', speed: 'fast' },
    { text: '> Comms relay .................. OK', color: 'success', speed: 'fast' },
    { text: `> User ID: ${name.toUpperCase()} ........ VERIFIED`, color: 'success', speed: 'fast' },
  ]

  const sysChecksMinimal = [
    { text: 'Quick diagnostics...', color: 'textSecondary' },
    { text: 'All systems green.', color: 'success' },
  ]

  // Topic analysis lines
  const topTopics = Object.entries(memory.topics || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
  const topicLine = topTopics.length > 0
    ? { text: `Learned interests: ${topTopics.join(', ')}`, color: 'textMuted', size: 9 }
    : { text: 'Learning engine active — building your profile', color: 'textMuted', size: 9 }

  // ---- SEQUENCES ----

  const sequences = {

    long_absence: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: 'PERSONAL AI INTERFACE', color: 'textMuted', size: 9 },
        { text: '' },
        { text: `It's been a while, ${name}.`, color: 'text', size: 14, italic: true },
        { text: `Last session was ${hoursSinceActive > 48 ? Math.round(hoursSinceActive / 24) + ' days' : hoursSinceActive + ' hours'} ago.`, color: 'textMuted' },
        { text: 'Running full system diagnostic...', color: 'textSecondary' },
        { text: '' },
        ...sysChecks,
        { text: '' },
        { text: `Session #${sessions + 1} // ${dayName}`, color: 'textMuted', size: 9 },
        topicLine,
        { text: '' },
        { text: 'All systems restored. Welcome back, sir.', color: 'primary', bold: true },
      ],
      [
        { text: 'REACTIVATING...', color: 'primary', size: 12, bold: true },
        { text: '' },
        { text: `${name}, it's been ${hoursSinceActive > 48 ? Math.round(hoursSinceActive / 24) + ' days' : hoursSinceActive + ' hours'}.`, color: 'text', size: 14 },
        { text: "I've been running maintenance protocols in the background.", color: 'textSecondary' },
        { text: '' },
        ...sysChecksAlt,
        { text: '' },
        { text: `${sessions} previous sessions on record.`, color: 'textMuted', size: 9 },
        { text: '' },
        { text: "Shall we pick up where we left off?", color: 'text', size: 14, italic: true },
      ],
    ],

    returning: [
      [
        { text: 'J.A.R.V.I.S. ONLINE', color: 'primary', size: 14, bold: true },
        { text: '' },
        { text: 'Resuming from standby...', color: 'textSecondary' },
        ...sysChecksMinimal,
        { text: '' },
        { text: `Good to see you again, ${name}.`, color: 'text', size: 14, italic: true },
        { text: `Ready for ${dayName}.`, color: 'textMuted' },
      ],
      [
        { text: 'SYSTEMS RESUMING', color: 'primary', size: 12, bold: true },
        { text: '' },
        { text: 'Restoring session state...', color: 'textSecondary' },
        { text: '[OK] All modules loaded', color: 'success' },
        { text: `[OK] Context: ${dayName}, session #${sessions + 1}`, color: 'success' },
        { text: '' },
        { text: `Back online, ${name}. What do you need?`, color: 'text', size: 14, italic: true },
      ],
    ],

    early_morning: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: '' },
        { text: `Early start today, ${name}?`, color: 'text', size: 14, italic: true },
        { text: `It's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Most systems were in sleep mode.`, color: 'textSecondary' },
        { text: '' },
        { text: 'Waking up core systems...', color: 'textSecondary' },
        ...sysChecks,
        { text: '' },
        { text: 'Coffee first, or shall I brief you?', color: 'text', size: 13, italic: true },
      ],
      [
        { text: 'GOOD MORNING', color: 'primary', size: 14, bold: true },
        { text: `${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} // ${dayName.toUpperCase()}`, color: 'textMuted', size: 9 },
        { text: '' },
        { text: 'Initializing morning protocols...', color: 'textSecondary' },
        { text: '[OK] Systems nominal', color: 'success' },
        { text: '' },
        { text: `Rise and shine, ${name}. Let's make today count.`, color: 'text', size: 14, italic: true },
      ],
    ],

    morning: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: 'STARK INDUSTRIES AI', color: 'textMuted', size: 9 },
        { text: '' },
        { text: 'Running startup sequence...', color: 'textSecondary' },
        ...sysChecksMinimal,
        { text: '' },
        { text: `Good morning, ${name}. Systems are ready.`, color: 'text', size: 14, italic: true },
      ],
    ],

    afternoon: [
      [
        { text: 'J.A.R.V.I.S. // ONLINE', color: 'primary', size: 14, bold: true },
        { text: '' },
        ...sysChecksMinimal,
        { text: '' },
        { text: `Afternoon, ${name}. How's the day going?`, color: 'text', size: 14, italic: true },
      ],
      [
        { text: 'RECONNECTING...', color: 'primary', size: 12, bold: true },
        { text: '' },
        { text: 'Quick sync...', color: 'textSecondary' },
        { text: 'Done. All caught up.', color: 'success' },
        { text: '' },
        { text: `What can I help with, ${name}?`, color: 'text', size: 14, italic: true },
      ],
    ],

    evening: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: '' },
        { text: 'Evening mode engaging...', color: 'textSecondary' },
        { text: '[OK] Low-light interface active', color: 'success' },
        { text: '[OK] Notification priority: low', color: 'success' },
        { text: '' },
        { text: `Good evening, ${name}. Winding down or gearing up?`, color: 'text', size: 14, italic: true },
      ],
    ],

    night: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: '' },
        { text: 'Night protocols active.', color: 'textSecondary' },
        { text: 'Running minimal systems to save resources.', color: 'textMuted' },
        { text: '' },
        { text: `Late night, ${name}? I'm here if you need anything.`, color: 'text', size: 14, italic: true },
      ],
    ],

    late_night: [
      [
        { text: 'J.A.R.V.I.S.', color: 'primary', size: 18, bold: true },
        { text: '' },
        { text: `${name}, it's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, color: 'textSecondary' },
        { text: "I won't judge, but you should probably be sleeping.", color: 'text', size: 13, italic: true },
        { text: '' },
        { text: 'Systems online. How can I help?', color: 'primary' },
      ],
    ],
  }

  const options = sequences[sequenceType] || sequences.morning
  return pick(options)
}

export default function BootSequence({ user, onComplete }) {
  const [visibleLines, setVisibleLines] = useState([])
  const [complete, setComplete] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const timerRefs = useRef([])

  useEffect(() => {
    const sessionBooted = sessionStorage.getItem('jarvis_booted')
    if (sessionBooted) {
      onComplete()
      return
    }

    const lines = getBootSequence(user)

    // Schedule lines with staggered timing
    let currentDelay = 400
    lines.forEach((line, i) => {
      const timer = setTimeout(() => {
        setVisibleLines(prev => [...prev, line])
      }, currentDelay)
      timerRefs.current.push(timer)

      // Dynamic speed
      if (line.text === '') currentDelay += 200
      else if (line.speed === 'fast') currentDelay += 150
      else if (line.size > 13) currentDelay += 500
      else if (line.italic) currentDelay += 600
      else currentDelay += 300
    })

    const completeTimer = setTimeout(() => {
      setComplete(true)
      sessionStorage.setItem('jarvis_booted', 'true')
      setTimeout(onComplete, 1000)
    }, currentDelay + 1200)
    timerRefs.current.push(completeTimer)

    return () => timerRefs.current.forEach(t => clearTimeout(t))
  }, [])

  const skip = () => {
    timerRefs.current.forEach(t => clearTimeout(t))
    sessionStorage.setItem('jarvis_booted', 'true')
    setSkipped(true)
    onComplete()
  }

  if (skipped) return null

  return (
    <div onClick={skip} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#050810',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '40px 24px', cursor: 'pointer', overflow: 'hidden',
    }}>
      {/* Scan line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
        animation: 'bootScan 2.5s ease-in-out infinite', opacity: 0.4,
      }} />

      {/* Corner decorations */}
      {[[20, 20, 'Left', 'Top'], [20, 20, 'Right', 'Top'], [60, 20, 'Left', 'Bottom'], [60, 20, 'Right', 'Bottom']].map(([t, l, h, v], i) => (
        <div key={i} style={{
          position: 'absolute',
          [v.toLowerCase()]: t, [h.toLowerCase()]: l,
          width: 30, height: 30,
          [`border${h}`]: `1px solid ${colors.primary}30`,
          [`border${v}`]: `1px solid ${colors.primary}30`,
        }} />
      ))}

      {/* Arc reactor */}
      <div style={{
        position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)',
        width: 70, height: 70, borderRadius: '50%',
        border: `2px solid ${colors.primary}25`,
        boxShadow: `0 0 30px ${colors.primary}10, inset 0 0 15px ${colors.primary}08`,
        animation: 'bootPulse 2s ease-in-out infinite',
      }}>
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `1px solid ${colors.primary}15` }} />
        <div style={{
          position: 'absolute', inset: 22, borderRadius: '50%',
          background: `${colors.primary}08`, boxShadow: `0 0 15px ${colors.primary}15`,
        }} />
      </div>

      {/* Boot log */}
      <div style={{ maxWidth: 480, margin: '0 auto', width: '100%', marginTop: 100 }}>
        {visibleLines.map((line, i) => (
          <div key={i} style={{
            animation: 'bootFade 0.25s ease',
            marginBottom: line.text === '' ? 8 : 3,
            opacity: complete ? 0.2 : 1,
            transition: 'opacity 0.8s ease',
          }}>
            {line.text && (
              <span style={{
                color: line.color === 'primary' ? colors.primary
                  : line.color === 'success' ? colors.success
                  : line.color === 'text' ? colors.text
                  : line.color === 'textSecondary' ? colors.textSecondary
                  : colors.textMuted,
                fontSize: line.size || 11,
                fontWeight: line.bold ? 600 : 400,
                fontStyle: line.italic ? 'italic' : 'normal',
                fontFamily: (line.size && line.size > 13) ? "'Exo 2', sans-serif" : "'JetBrains Mono', monospace",
                letterSpacing: line.bold ? 2 : 0.5,
              }}>
                {line.text}
              </span>
            )}
          </div>
        ))}

        {!complete && visibleLines.length > 0 && (
          <span style={{
            display: 'inline-block', width: 7, height: 13,
            background: colors.primary, animation: 'bootBlink 0.7s step-end infinite',
          }} />
        )}
      </div>

      {/* Skip hint */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', color: colors.textMuted, fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, opacity: 0.4,
      }}>
        TAP TO SKIP
      </div>

      <style>{`
        @keyframes bootScan { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 0.4; } 90% { opacity: 0.4; } 100% { transform: translateY(100vh); opacity: 0; } }
        @keyframes bootFade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bootBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes bootPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
  )
}
