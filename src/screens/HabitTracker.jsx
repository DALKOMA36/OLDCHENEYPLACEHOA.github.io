import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const HABIT_COLORS = ['#00d4ff', '#00e676', '#f0a500', '#ff4d4d', '#bb86fc', '#ff6b9d', '#48dbfb', '#feca57']

function getDateStr(d = new Date()) {
  return d.toISOString().split('T')[0]
}

function getDaysInRange(days = 30) {
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    result.push(getDateStr(d))
  }
  return result
}

function getStreak(log, dates) {
  let streak = 0
  const today = getDateStr()
  for (let i = dates.length - 1; i >= 0; i--) {
    if (log[dates[i]]) streak++
    else if (dates[i] !== today) break // allow today to be incomplete
    else break
  }
  return streak
}

export default function HabitTracker({ user }) {
  const [habits, setHabits] = useState(() => loadState('habits_data', []))
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(HABIT_COLORS[0])
  const [newFreq, setNewFreq] = useState('daily') // daily, weekdays, weekly
  const [view, setView] = useState('today') // today, grid

  // Persist locally
  useEffect(() => { saveState('habits_data', habits) }, [habits])

  // Load from D1 on mount
  useEffect(() => {
    db.habits.list().then(rows => {
      if (rows?.length) {
        setHabits(rows.map(r => ({ ...r, log: typeof r.log === 'string' ? JSON.parse(r.log || '{}') : (r.log || {}) })))
      }
    }).catch(() => {})
  }, [])

  const today = getDateStr()
  const last30 = getDaysInRange(30)

  const addHabit = () => {
    if (!newName.trim()) return
    const habit = {
      id: Date.now().toString(),
      name: newName.trim(),
      color: newColor,
      frequency: newFreq,
      log: {},
      createdAt: today,
    }
    setHabits(prev => [...prev, habit])
    db.habits.create({ ...habit, log: JSON.stringify(habit.log) }).catch(() => {})
    setNewName('')
    setShowAdd(false)
  }

  const toggleDay = (habitId, date) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      const log = { ...h.log }
      log[date] = !log[date]
      const updated = { ...h, log }
      db.habits.update({ ...updated, log: JSON.stringify(updated.log) }).catch(() => {})
      return updated
    }))
  }

  const deleteHabit = (id) => {
    setHabits(prev => prev.filter(h => h.id !== id))
    db.habits.delete(id).catch(() => {})
  }

  const completedToday = habits.filter(h => h.log[today]).length
  const totalToday = habits.length
  const bestStreak = Math.max(0, ...habits.map(h => getStreak(h.log, last30)))

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{
          color: colors.primary, fontSize: 13, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>Habit Tracker</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={linkBtn}>
          {showAdd ? 'CANCEL' : '+ NEW HABIT'}
        </button>
      </div>
      <p style={{
        color: colors.textMuted, fontSize: 12, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Build streaks. Break limits. One day at a time.</p>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, padding: 16, borderRadius: 10,
        background: colors.gradient1, border: `1px solid ${colors.borderBright}`,
      }}>
        {[
          [completedToday, totalToday, 'TODAY', colors.primary],
          [bestStreak, 'days', 'BEST STREAK', colors.success],
          [habits.length, 'total', 'HABITS', colors.secondary],
        ].map(([val, sub, label, col]) => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 22, fontWeight: 300, color: col,
              fontFamily: "'Rajdhani', sans-serif",
            }}>{val}<span style={{ fontSize: 12, color: colors.textMuted }}>/{sub}</span></div>
            <div style={{
              fontSize: 11, color: colors.textMuted,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Weekly completion bar chart */}
      {habits.length > 0 && (() => {
        const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
        const now = new Date()
        const dayOfWeek = now.getDay() // 0=Sun
        // Build dates for Mon-Sun of current week
        const monday = new Date(now)
        monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
        const weekDates = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          return getDateStr(d)
        })
        const dayCounts = weekDates.map(date =>
          habits.filter(h => h.log[date]).length
        )
        const maxCount = Math.max(1, ...dayCounts)
        const barW = 100 / 7
        const chartH = 80
        const labelH = 16
        const totalH = chartH + labelH + 4
        return (
          <div style={{
            padding: 16, marginBottom: 16, borderRadius: 10,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          }}>
            <div style={{
              color: colors.textMuted, fontSize: 11, marginBottom: 10,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>WEEKLY COMPLETIONS</div>
            <svg viewBox={`0 0 100 ${totalH}`} width="100%" style={{ display: 'block' }}>
              {dayCounts.map((count, i) => {
                const barH = maxCount > 0 ? (count / maxCount) * chartH : 0
                const x = i * barW + barW * 0.15
                const w = barW * 0.7
                const y = chartH - barH
                const ratio = habits.length > 0 ? count / habits.length : 0
                const barColor = ratio >= 1 ? colors.success : ratio > 0 ? colors.warning : colors.border
                const isToday = weekDates[i] === today
                return (
                  <g key={i}>
                    {/* background track */}
                    <rect x={x} y={0} width={w} height={chartH} rx={2}
                      fill={colors.border} opacity="0.2" />
                    {/* bar */}
                    {barH > 0 && (
                      <rect x={x} y={y} width={w} height={barH} rx={2}
                        fill={barColor} opacity="0.85" />
                    )}
                    {/* count label */}
                    {count > 0 && (
                      <text x={x + w / 2} y={y - 2} textAnchor="middle"
                        fill={colors.textSecondary} fontSize="5"
                        fontFamily="JetBrains Mono, monospace">{count}</text>
                    )}
                    {/* day label */}
                    <text x={x + w / 2} y={chartH + labelH - 3} textAnchor="middle"
                      fill={isToday ? colors.primary : colors.textMuted} fontSize="4.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight={isToday ? '600' : '400'}>
                      {dayLabels[i]}
                    </text>
                    {/* today indicator */}
                    {isToday && (
                      <rect x={x + w / 2 - 1.5} y={chartH + labelH} width={3} height={1}
                        rx={0.5} fill={colors.primary} />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        )
      })()}

      {/* Add habit */}
      {showAdd && (
        <div style={{
          padding: 14, marginBottom: 16,
          border: `1px solid ${colors.border}`, background: colors.surfaceLight,
        }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Habit name (e.g., Meditate, Read, Exercise)"
            onKeyDown={e => e.key === 'Enter' && addHabit()}
            autoFocus
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 10, minHeight: 44, borderRadius: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {HABIT_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: 'none',
                cursor: 'pointer', outline: newColor === c ? `2px solid ${colors.text}` : 'none',
                outlineOffset: 2,
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['daily', 'weekdays', 'weekly'].map(f => (
              <button key={f} onClick={() => setNewFreq(f)} style={{
                flex: 1, padding: '10px 0', fontSize: 11, minHeight: 44, borderRadius: 8,
                background: newFreq === f ? colors.primaryDim : 'transparent',
                border: `1px solid ${newFreq === f ? colors.primary : colors.border}`,
                color: newFreq === f ? colors.primary : colors.textMuted,
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={addHabit} disabled={!newName.trim()} style={{
            width: '100%', padding: '12px 16px', minHeight: 44, borderRadius: 8,
            background: newName.trim() ? colors.primaryDim : 'transparent',
            border: `1px solid ${newName.trim() ? colors.primary : colors.border}`,
            color: newName.trim() ? colors.primary : colors.textMuted,
            fontSize: 12, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>CREATE HABIT</button>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['today', 'TODAY'], ['grid', 'STREAK GRID']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '10px 0', fontSize: 11, minHeight: 44,
            background: view === v ? colors.primaryDim : 'transparent',
            color: view === v ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: view === v ? `1px solid ${colors.primary}` : '1px solid transparent',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Today view */}
      {view === 'today' && habits.map(habit => {
        const done = habit.log[today]
        const streak = getStreak(habit.log, last30)
        return (
          <div key={habit.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 16, marginBottom: 10, borderRadius: 10,
            background: done ? `${habit.color}10` : colors.surfaceLight,
            border: `1px solid ${done ? habit.color + '40' : colors.border}`,
          }}>
            <button onClick={() => toggleDay(habit.id, today)} style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: done ? habit.color : 'transparent',
              border: `2px solid ${habit.color}`,
              color: done ? '#fff' : habit.color,
              fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{done ? '\u2713' : ''}</button>
            <div style={{ flex: 1 }}>
              <div style={{
                color: colors.text, fontSize: 14, fontWeight: 500,
                fontFamily: "'Exo 2', sans-serif",
                textDecoration: done ? 'line-through' : 'none',
                opacity: done ? 0.7 : 1,
              }}>{habit.name}</div>
              <div style={{
                color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              }}>{streak > 0 ? `${streak} day streak` : 'Start your streak!'} // {habit.frequency}</div>
            </div>
            <button onClick={() => deleteHabit(habit.id)} style={{
              background: 'none', border: 'none', color: colors.textMuted,
              fontSize: 14, cursor: 'pointer',
            }}>x</button>
          </div>
        )
      })}

      {/* Streak grid view */}
      {view === 'grid' && habits.map(habit => {
        const streak = getStreak(habit.log, last30)
        return (
          <div key={habit.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: habit.color }} />
                <span style={{ color: colors.text, fontSize: 14, fontWeight: 500, fontFamily: "'Exo 2', sans-serif" }}>
                  {habit.name}
                </span>
              </div>
              <span style={{ color: habit.color, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                {streak}d streak
              </span>
            </div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {last30.map(date => (
                <button key={date} onClick={() => toggleDay(habit.id, date)} title={date} style={{
                  width: 14, height: 14, border: 'none', cursor: 'pointer',
                  background: habit.log[date] ? habit.color : colors.surface,
                  opacity: habit.log[date] ? 1 : 0.3,
                  borderRadius: 2,
                }} />
              ))}
            </div>
          </div>
        )
      })}

      {habits.length === 0 && !showAdd && (
        <div style={{
          textAlign: 'center', padding: 40,
          color: colors.textMuted, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
        }}>
          No habits yet. Tap "+ NEW HABIT" to start building your routine.
        </div>
      )}
    </div>
  )
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 12, cursor: 'pointer', minHeight: 44, padding: '8px 12px',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
