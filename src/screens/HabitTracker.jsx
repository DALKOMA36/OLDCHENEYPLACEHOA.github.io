import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'

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
  const [habits, setHabits] = useState(() => loadState('habits', []))
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(HABIT_COLORS[0])
  const [newFreq, setNewFreq] = useState('daily') // daily, weekdays, weekly
  const [view, setView] = useState('today') // today, grid

  useEffect(() => { saveState('habits', habits) }, [habits])

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
    setNewName('')
    setShowAdd(false)
  }

  const toggleDay = (habitId, date) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      const log = { ...h.log }
      log[date] = !log[date]
      return { ...h, log }
    }))
  }

  const deleteHabit = (id) => {
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  const completedToday = habits.filter(h => h.log[today]).length
  const totalToday = habits.length
  const bestStreak = Math.max(0, ...habits.map(h => getStreak(h.log, last30)))

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{
          color: colors.primary, fontSize: 11, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
        }}>Habit Tracker</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={linkBtn}>
          {showAdd ? 'CANCEL' : '+ NEW HABIT'}
        </button>
      </div>
      <p style={{
        color: colors.textMuted, fontSize: 10, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Build streaks. Break limits. One day at a time.</p>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, padding: 14,
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
              fontSize: 8, color: colors.textMuted,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>{label}</div>
          </div>
        ))}
      </div>

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
              width: '100%', padding: '8px 12px', marginBottom: 10,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif",
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
                flex: 1, padding: '6px 0', fontSize: 9,
                background: newFreq === f ? colors.primaryDim : 'transparent',
                border: `1px solid ${newFreq === f ? colors.primary : colors.border}`,
                color: newFreq === f ? colors.primary : colors.textMuted,
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={addHabit} disabled={!newName.trim()} style={{
            width: '100%', padding: 10,
            background: newName.trim() ? colors.primaryDim : 'transparent',
            border: `1px solid ${newName.trim() ? colors.primary : colors.border}`,
            color: newName.trim() ? colors.primary : colors.textMuted,
            fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>CREATE HABIT</button>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['today', 'TODAY'], ['grid', 'STREAK GRID']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '7px 0', fontSize: 9,
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
            display: 'flex', alignItems: 'center', gap: 12, padding: 14, marginBottom: 6,
            background: done ? `${habit.color}10` : colors.surfaceLight,
            border: `1px solid ${done ? habit.color + '40' : colors.border}`,
          }}>
            <button onClick={() => toggleDay(habit.id, today)} style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
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
                color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
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
                <span style={{ color: colors.text, fontSize: 12, fontWeight: 500, fontFamily: "'Exo 2', sans-serif" }}>
                  {habit.name}
                </span>
              </div>
              <span style={{ color: habit.color, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
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
  fontSize: 9, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}
