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
    const t1 = setTimeout(() => setPhase(1), 350)
    // Phase 1: grid flash + reconfigure
    const t2 = setTimeout(() => setPhase(2), 700)
    // Phase 2: materialize
    const t3 = setTimeout(() => {
      onComplete()
      setPhase(0)
    }, 1000)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [active])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {/* Full screen dim */}
      <div style={{
        position: 'absolute', inset: 0,
        background: phase === 1 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
        transition: 'background 0.3s ease',
      }} />

      {/* Horizontal sweep lines — expand from center */}
      {[20, 35, 50, 65, 80].map((pct, i) => (
        <div key={`h${i}`} style={{
          position: 'absolute', left: 0, right: 0,
          height: pct === 50 ? 2 : 1,
          background: colors.primary,
          top: `${pct}%`,
          opacity: phase === 0 ? (pct === 50 ? 0.9 : 0.4) : phase === 1 ? 0.2 : 0,
          transform: `scaleX(${phase === 0 ? 1 : phase === 1 ? 0.3 : 0})`,
          transformOrigin: 'center',
          transition: 'all 0.35s ease',
          boxShadow: pct === 50 ? `0 0 15px ${colors.primary}` : `0 0 6px ${colors.primary}60`,
        }} />
      ))}

      {/* Vertical scan line — sweeps left to right */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        width: 3, background: colors.primary,
        left: phase === 0 ? '-2%' : phase === 1 ? '102%' : '102%',
        opacity: phase <= 1 ? 0.7 : 0,
        transition: 'left 0.65s ease-in-out, opacity 0.3s ease',
        boxShadow: `0 0 20px ${colors.primary}, 0 0 40px ${colors.primary}50`,
      }} />

      {/* Grid pattern flash */}
      {phase === 1 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 40px, ${colors.primary}08 40px, ${colors.primary}08 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, ${colors.primary}08 40px, ${colors.primary}08 41px)`,
          animation: 'transGridFade 0.4s ease',
        }} />
      )}

      {/* Corner brackets — expand outward */}
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
        <div key={`b${i}`} style={{
          position: 'absolute',
          [y ? 'bottom' : 'top']: phase <= 1 ? 30 : 60,
          [x ? 'right' : 'left']: phase <= 1 ? 16 : 40,
          width: phase === 0 ? 30 : 20, height: phase === 0 ? 30 : 20,
          [`border${y ? 'Bottom' : 'Top'}`]: `2px solid ${colors.primary}`,
          [`border${x ? 'Right' : 'Left'}`]: `2px solid ${colors.primary}`,
          opacity: phase <= 1 ? 0.6 : 0,
          transition: 'all 0.35s ease',
          boxShadow: `0 0 8px ${colors.primary}30`,
        }} />
      ))}

      {/* Center reticle */}
      {phase <= 1 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: phase === 0 ? 60 : 30, height: phase === 0 ? 60 : 30,
          border: `1px solid ${colors.primary}`,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: phase === 0 ? 0.5 : 0.2,
          transition: 'all 0.35s ease',
          boxShadow: `0 0 15px ${colors.primary}30`,
        }} />
      )}

      {/* Loading text */}
      {phase === 1 && (
        <div style={{
          position: 'absolute', bottom: '20%', left: 0, right: 0,
          textAlign: 'center',
          color: colors.primary, fontSize: 10, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
          opacity: 0.5,
          animation: 'transPulse 0.4s ease',
        }}>RECONFIGURING</div>
      )}

      <style>{`
        @keyframes transGridFade { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes transPulse { 0% { opacity: 0; } 50% { opacity: 0.6; } 100% { opacity: 0; } }
      `}</style>
    </div>
  )
}
