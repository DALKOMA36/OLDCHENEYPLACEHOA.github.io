import { useState, useEffect, useRef } from 'react'
import { colors } from './constants'

// JARVIS Animated Avatar — Arc Reactor / HUD Face
// Pulses when speaking, reacts to audio amplitude, idle animations

export default function JarvisAvatar({ speaking = false, listening = false, size = 200 }) {
  const [amplitude, setAmplitude] = useState(0)
  const [rotation, setRotation] = useState(0)
  const frameRef = useRef(null)

  // Smooth animation loop
  useEffect(() => {
    let angle = 0
    const animate = () => {
      angle += speaking ? 1.5 : listening ? 0.8 : 0.2
      setRotation(angle % 360)

      // Simulate amplitude when speaking
      if (speaking) {
        setAmplitude(0.3 + Math.random() * 0.7)
      } else if (listening) {
        setAmplitude(0.1 + Math.random() * 0.3)
      } else {
        setAmplitude(prev => prev * 0.95) // decay
      }

      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [speaking, listening])

  const s = size
  const cx = s / 2
  const cy = s / 2
  const mainColor = speaking ? '#00e676' : listening ? '#00d4ff' : '#00d4ff'
  const glowIntensity = speaking ? 0.6 + amplitude * 0.4 : listening ? 0.3 + amplitude * 0.3 : 0.15
  const pulseScale = 1 + amplitude * 0.08

  return (
    <div style={{
      width: s, height: s, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <defs>
          {/* Glow filter */}
          <filter id="jarvisGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={4 + amplitude * 6} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="jarvisGlowStrong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={8 + amplitude * 12} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background glow */}
        <circle cx={cx} cy={cy} r={s * 0.42} fill="none"
          stroke={mainColor} strokeWidth="1" opacity={glowIntensity * 0.3}
          filter="url(#jarvisGlowStrong)" />

        {/* Outer ring — slow rotation */}
        <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
          {/* Outer segmented ring */}
          {[0, 60, 120, 180, 240, 300].map((angle, i) => (
            <path
              key={i}
              d={describeArc(cx, cy, s * 0.44, angle + 5, angle + 50)}
              fill="none"
              stroke={mainColor}
              strokeWidth={1.5}
              opacity={0.2 + (i % 2 === 0 ? amplitude * 0.3 : 0)}
              filter="url(#jarvisGlow)"
            />
          ))}
        </g>

        {/* Second ring — counter rotation */}
        <g transform={`rotate(${-rotation * 0.7}, ${cx}, ${cy})`}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
            <path
              key={i}
              d={describeArc(cx, cy, s * 0.38, angle + 3, angle + 35)}
              fill="none"
              stroke={mainColor}
              strokeWidth={1}
              opacity={0.15 + (i % 3 === 0 ? amplitude * 0.4 : 0)}
            />
          ))}
        </g>

        {/* Inner ring — tick marks */}
        <g transform={`rotate(${rotation * 0.3}, ${cx}, ${cy})`}>
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = i * 10
            const rad = (angle * Math.PI) / 180
            const r1 = s * 0.30
            const r2 = s * 0.33
            const isMajor = i % 6 === 0
            return (
              <line
                key={i}
                x1={cx + Math.cos(rad) * r1}
                y1={cy + Math.sin(rad) * r1}
                x2={cx + Math.cos(rad) * r2}
                y2={cy + Math.sin(rad) * r2}
                stroke={mainColor}
                strokeWidth={isMajor ? 1.5 : 0.5}
                opacity={isMajor ? 0.4 + amplitude * 0.4 : 0.15}
              />
            )
          })}
        </g>

        {/* Core circle */}
        <circle cx={cx} cy={cy} r={s * 0.25 * pulseScale} fill="none"
          stroke={mainColor} strokeWidth={2}
          opacity={0.3 + amplitude * 0.4}
          filter="url(#jarvisGlow)" />

        {/* Inner core */}
        <circle cx={cx} cy={cy} r={s * 0.18 * pulseScale} fill="none"
          stroke={mainColor} strokeWidth={1}
          opacity={0.2 + amplitude * 0.3} />

        {/* Center dot / reactor core */}
        <circle cx={cx} cy={cy} r={s * 0.06 * pulseScale}
          fill={mainColor}
          opacity={0.3 + glowIntensity}
          filter="url(#jarvisGlowStrong)" />
        <circle cx={cx} cy={cy} r={s * 0.03}
          fill="#ffffff"
          opacity={0.5 + amplitude * 0.5} />

        {/* Audio waveform bars (visible when speaking/listening) */}
        {(speaking || listening) && Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 - 90) * Math.PI / 180
          const barHeight = speaking
            ? s * 0.04 + Math.random() * s * 0.08 * amplitude
            : s * 0.02 + Math.random() * s * 0.03 * amplitude
          const r = s * 0.15
          return (
            <line
              key={`wave-${i}`}
              x1={cx + Math.cos(angle) * r}
              y1={cy + Math.sin(angle) * r}
              x2={cx + Math.cos(angle) * (r + barHeight)}
              y2={cy + Math.sin(angle) * (r + barHeight)}
              stroke={mainColor}
              strokeWidth={2}
              opacity={0.4 + amplitude * 0.6}
              strokeLinecap="round"
            />
          )
        })}

        {/* Scanning line (when listening) */}
        {listening && (
          <line
            x1={cx - s * 0.3}
            y1={cy + Math.sin(rotation * 0.05) * s * 0.2}
            x2={cx + s * 0.3}
            y2={cy + Math.sin(rotation * 0.05) * s * 0.2}
            stroke={mainColor}
            strokeWidth={1}
            opacity={0.15 + amplitude * 0.2}
          />
        )}

        {/* Corner brackets */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => {
          const bx = cx + dx * s * 0.46
          const by = cy + dy * s * 0.46
          const bLen = s * 0.06
          return (
            <g key={`bracket-${i}`} opacity={0.3 + amplitude * 0.2}>
              <line x1={bx} y1={by} x2={bx + dx * -bLen} y2={by}
                stroke={mainColor} strokeWidth={1} />
              <line x1={bx} y1={by} x2={bx} y2={by + dy * -bLen}
                stroke={mainColor} strokeWidth={1} />
            </g>
          )
        })}
      </svg>

      {/* Status text below */}
      <div style={{
        position: 'absolute', bottom: -8,
        color: mainColor, fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 2, textAlign: 'center',
        opacity: 0.6 + amplitude * 0.4,
        textShadow: `0 0 6px ${mainColor}40`,
      }}>
        {speaking ? 'SPEAKING' : listening ? 'LISTENING' : 'STANDBY'}
      </div>
    </div>
  )
}

// SVG arc path helper
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
