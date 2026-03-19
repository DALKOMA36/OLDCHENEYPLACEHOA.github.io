import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../App'
import { db } from '../db'

export default function Reminders({ user, addMemory }) {
  const [reminders, setReminders] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newReminder, setNewReminder] = useState({ text: '', date: '', time: '09:00', repeat: 'none', priority: 'normal' })

  // Load reminders from D1 on mount, fall back to localStorage
  useEffect(() => {
    let cancelled = false
    db.reminders.list()
      .then(data => { if (!cancelled) setReminders(data) })
      .catch(() => {
        if (!cancelled) setReminders(loadState('reminders', []))
      })
    return () => { cancelled = true }
  }, [])

  // Persist to localStorage as fallback whenever reminders change
  useEffect(() => {
    if (reminders.length > 0) {
      saveState('reminders', reminders)
    }
  }, [reminders])

  const addReminder = async () => {
    if (!newReminder.text.trim()) return
    const reminder = { ...newReminder, id: Date.now(), dismissed: false, createdAt: new Date().toISOString() }
    try {
      const created = await db.reminders.create(reminder)
      setReminders(prev => [created, ...prev])
    } catch {
      // Fallback: use local state only
      setReminders(prev => [reminder, ...prev])
    }
    addMemory(`Set reminder: ${newReminder.text}`)
    setNewReminder({ text: '', date: '', time: '09:00', repeat: 'none', priority: 'normal' })
    setShowAdd(false)
  }

  const dismiss = async (id) => {
    const updated = reminders.map(r => r.id === id ? { ...r, dismissed: true } : r)
    setReminders(updated)
    const target = updated.find(r => r.id === id)
    try {
      if (target) await db.reminders.update(target)
    } catch {
      // localStorage fallback already handled by the effect
    }
  }

  const deleteReminder = async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id))
    try {
      await db.reminders.delete(id)
    } catch {
      // localStorage fallback already handled by the effect
    }
  }

  const active = reminders.filter(r => !r.dismissed)
  const dismissed = reminders.filter(r => r.dismissed)

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Reminders</h2>
        <button onClick={() => setShowAdd(true)} style={{
          padding: '8px 16px', background: colors.gradient1, color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Reminder</button>
      </div>

      {/* Smart Reminders Info */}
      <div style={{
        padding: 14, background: `${colors.warning}10`, border: `1px solid ${colors.warning}25`,
        borderRadius: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ color: colors.warning, fontSize: 18 }}>◉</span>
        <div>
          <div style={{ color: colors.warning, fontSize: 11, fontWeight: 600 }}>SMART REMINDERS</div>
          <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            Jarvis nudges you before things become urgent, sends day-of prompts, and follows up on lingering items.
          </div>
        </div>
      </div>

      {/* Active Reminders */}
      <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        ACTIVE ({active.length})
      </h3>
      {active.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
          No active reminders. Set one to get nudged at the right time.
        </div>
      ) : (
        active.map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            borderRadius: 10, marginBottom: 8,
            borderLeft: `3px solid ${r.priority === 'urgent' ? colors.danger : r.priority === 'important' ? colors.warning : colors.primary}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{r.text}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {r.date && <span style={{ fontSize: 11, color: colors.primaryLight }}>{r.date}</span>}
                <span style={{ fontSize: 11, color: colors.textSecondary }}>{r.time}</span>
                {r.repeat !== 'none' && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 6,
                    background: `${colors.secondary}22`, color: colors.secondary,
                  }}>↻ {r.repeat}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => dismiss(r.id)} style={iconBtn} title="Dismiss">✓</button>
              <button onClick={() => deleteReminder(r.id)} style={{ ...iconBtn, color: colors.danger }}>✕</button>
            </div>
          </div>
        ))
      )}

      {/* Dismissed */}
      {dismissed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: colors.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            DISMISSED ({dismissed.length})
          </h3>
          {dismissed.slice(0, 5).map(r => (
            <div key={r.id} style={{
              padding: 10, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 8, marginBottom: 6, opacity: 0.5,
            }}>
              <div style={{ color: colors.text, fontSize: 13, textDecoration: 'line-through' }}>{r.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add Reminder Modal */}
      {showAdd && (
        <div style={modalOverlay} onClick={() => setShowAdd(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New Reminder</h3>
            <input
              value={newReminder.text}
              onChange={e => setNewReminder({ ...newReminder, text: e.target.value })}
              placeholder="What do you want to remember?"
              style={inputStyle}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={newReminder.date}
                onChange={e => setNewReminder({ ...newReminder, date: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
              <input type="time" value={newReminder.time}
                onChange={e => setNewReminder({ ...newReminder, time: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newReminder.repeat} onChange={e => setNewReminder({ ...newReminder, repeat: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select value={newReminder.priority} onChange={e => setNewReminder({ ...newReminder, priority: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={addReminder} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Set Reminder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 6, background: `${colors.success}15`,
  border: 'none', color: colors.success, fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
  border: `1px solid ${colors.border}`,
}
const inputStyle = {
  width: '100%', padding: '12px 14px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
