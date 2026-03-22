import { useState, useEffect } from 'react'
import { colors } from './constants'

// JARVIS HUD Screen Transition
// Lines sweep, grid reconfigures, new content materializes
// Like Tony Stark's holographic displays rearranging

export default function ScreenTransition({ active, onComplete }) {
  const [phase, setPhase] = useState(0) // 0=sweep, 1=grid, 2=materialize

  useEffect(() => {
    if (!active) { setPhase(0); return }

    // Phase 0: horizontal sweep lines
    const t1 = setTimeout(() => setPhase(1), 150)
    // Phase 1: grid flash
    const t2 = setTimeout(() => setPhase(2), 300)
    // Phase 2: fade complete
    const t3 = setTimeout(() => {
      onComplete()
      setPhase(0)
    }, 450)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [active])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {/* Horizontal sweep lines */}
      {phase >= 0 && (
        <>
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: 1, background: colors.primary,
            top: '30%',
            opacity: phase === 0 ? 0.6 : 0,
            transform: `scaleX(${phase === 0 ? 1 : 0})`,
            transition: 'all 0.15s ease',
            boxShadow: `0 0 8px ${colors.primary}`,
          }} />
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: 1, background: colors.primary,
            top: '70%',
            opacity: phase === 0 ? 0.6 : 0,
            transform: `scaleX(${phase === 0 ? 1 : 0})`,
            transition: 'all 0.15s ease',
            boxShadow: `0 0 8px ${colors.primary}`,
          }} />
          {/* Center horizontal line */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: 2, background: colors.primary,
            top: '50%',
            opacity: phase <= 1 ? 0.8 : 0,
            transform: `scaleX(${phase <= 1 ? 1 : 0})`,
            transition: 'all 0.2s ease',
            boxShadow: `0 0 12px ${colors.primary}`,
          }} />
        </>
      )}

      {/* Vertical scan line */}
      {phase >= 0 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          width: 2, background: colors.primary,
          left: phase === 0 ? '0%' : phase === 1 ? '100%' : '100%',
          opacity: phase <= 1 ? 0.5 : 0,
          transition: 'left 0.3s ease, opacity 0.15s ease',
          boxShadow: `0 0 15px ${colors.primary}, 0 0 30px ${colors.primary}40`,
        }} />
      )}

      {/* Grid flash */}
      {phase === 1 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `${colors.primary}06`,
          animation: 'transFlash 0.15s ease',
        }} />
      )}

      {/* Corner brackets flash */}
      {phase >= 0 && phase <= 1 && (
        <>
          {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
            <div key={i} style={{
              position: 'absolute',
              [y ? 'bottom' : 'top']: 40,
              [x ? 'right' : 'left']: 20,
              width: 20, height: 20,
              [`border${y ? 'Bottom' : 'Top'}`]: `1px solid ${colors.primary}`,
              [`border${x ? 'Right' : 'Left'}`]: `1px solid ${colors.primary}`,
              opacity: phase === 0 ? 0.6 : 0.3,
              transition: 'opacity 0.15s ease',
            }} />
          ))}
        </>
      )}

      <style>{`
        @keyframes transFlash {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
