import { useState, useEffect, useRef } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'
import { sendLocalNotification, getPermissionState } from '../push'

// ── Category definitions ──────────────────────────────────────────────
const CATEGORIES = [
  { key: 'personal', label: 'Personal', color: '#00d4ff' },
  { key: 'work',     label: 'Work',     color: '#f0a500' },
  { key: 'health',   label: 'Health',   color: '#00e676' },
  { key: 'finance',  label: 'Finance',  color: '#a855f7' },
  { key: 'family',   label: 'Family',   color: '#ff6b9d' },
]

function getCategoryDef(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[0]
}

// ── Smart time helpers ────────────────────────────────────────────────
function getSmartTimes() {
  const now = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]
  const fmtTime = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

  const in30 = new Date(now.getTime() + 30 * 60000)
  const in1h = new Date(now.getTime() + 60 * 60000)

  const tonight = new Date(now)
  tonight.setHours(20, 0, 0, 0)
  if (tonight <= now) tonight.setDate(tonight.getDate() + 1)

  const tomMorn = new Date(now)
  tomMorn.setDate(tomMorn.getDate() + 1)
  tomMorn.setHours(9, 0, 0, 0)

  const dayOfWeek = now.getDay()
  const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7
  const weekend = new Date(now)
  weekend.setDate(weekend.getDate() + daysUntilSat)
  weekend.setHours(10, 0, 0, 0)

  return [
    { label: 'In 30 min',            date: fmt(in30),   time: fmtTime(in30.getHours(), in30.getMinutes()) },
    { label: 'In 1 hour',            date: fmt(in1h),   time: fmtTime(in1h.getHours(), in1h.getMinutes()) },
    { label: 'Tonight (8pm)',        date: fmt(tonight), time: '20:00' },
    { label: 'Tomorrow morning (9am)', date: fmt(tomMorn), time: '09:00' },
    { label: 'This weekend',         date: fmt(weekend), time: '10:00' },
  ]
}

// ── Snooze presets ────────────────────────────────────────────────────
function getSnoozeOptions() {
  return [
    { label: '5 min',    mins: 5 },
    { label: '15 min',   mins: 15 },
    { label: '1 hour',   mins: 60 },
    { label: 'Tomorrow', mins: 'tomorrow' },
  ]
}

function computeSnoozeDateTime(mins) {
  const now = new Date()
  let target
  if (mins === 'tomorrow') {
    target = new Date(now)
    target.setDate(target.getDate() + 1)
    target.setHours(9, 0, 0, 0)
  } else {
    target = new Date(now.getTime() + mins * 60000)
  }
  return {
    date: target.toISOString().split('T')[0],
    time: `${String(target.getHours()).padStart(2,'0')}:${String(target.getMinutes()).padStart(2,'0')}`,
  }
}

// ── Overdue detection ─────────────────────────────────────────────────
function isOverdue(r) {
  if (r.dismissed || !r.date) return false
  const now = new Date()
  const [h, m] = (r.time || '09:00').split(':').map(Number)
  const rDate = new Date(r.date + 'T00:00:00')
  rDate.setHours(h, m, 0, 0)
  return rDate < now
}

// ── Keyframe injection (once) ─────────────────────────────────────────
const STYLE_ID = 'jarvis-reminder-keyframes'
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes jarvisPulseGlow {
      0%, 100% { box-shadow: 0 0 8px rgba(255,77,77,0.4), inset 0 0 8px rgba(255,77,77,0.05); }
      50%      { box-shadow: 0 0 20px rgba(255,77,77,0.7), inset 0 0 16px rgba(255,77,77,0.1); }
    }
    @keyframes jarvisFabPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(0,212,255,0.3); }
      50%      { transform: scale(1.08); box-shadow: 0 4px 30px rgba(0,212,255,0.55); }
    }
    @keyframes jarvisSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes jarvisBadgePulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.15); }
    }
  `
  document.head.appendChild(style)
}

// ══════════════════════════════════════════════════════════════════════
//  REMINDERS — J.A.R.V.I.S. TACTICAL REMINDER SYSTEM
// ══════════════════════════════════════════════════════════════════════
export default function Reminders({ user, addMemory }) {
  const [reminders, setReminders] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(null) // reminder id with snooze menu open
  const [newReminder, setNewReminder] = useState({
    text: '', date: '', time: '09:00', repeat: 'none', priority: 'normal', category: 'personal',
  })
  const [quickText, setQuickText] = useState('')
  const [quickCategory, setQuickCategory] = useState('personal')
  const quickInputRef = useRef(null)

  // Inject CSS keyframes
  useEffect(() => { ensureKeyframes() }, [])

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

  // Check for due reminders every 30 seconds and send notifications
  const checkedRef = useRef(new Set())
  useEffect(() => {
    if (getPermissionState() !== 'granted') return
    const check = () => {
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const nowMins = now.getHours() * 60 + now.getMinutes()

      reminders.forEach(r => {
        if (r.dismissed || checkedRef.current.has(r.id)) return
        if (r.date !== todayStr) return
        const [h, m] = (r.time || '09:00').split(':').map(Number)
        const reminderMins = h * 60 + m
        // Notify if within 1 minute of reminder time
        if (Math.abs(nowMins - reminderMins) <= 1) {
          checkedRef.current.add(r.id)
          sendLocalNotification('J.A.R.V.I.S. Reminder', r.text, {
            tag: `reminder-${r.id}`,
          })
        }
      })
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [reminders])

  // ── Actions ─────────────────────────────────────────────────────────
  const addReminder = async () => {
    if (!newReminder.text.trim()) return
    const reminder = { ...newReminder, id: Date.now(), dismissed: false, createdAt: new Date().toISOString() }
    try {
      const created = await db.reminders.create(reminder)
      setReminders(prev => [created, ...prev])
    } catch {
      setReminders(prev => [reminder, ...prev])
    }
    addMemory(`Set reminder: ${newReminder.text}`)
    setNewReminder({ text: '', date: '', time: '09:00', repeat: 'none', priority: 'normal', category: 'personal' })
    setShowAdd(false)
  }

  const quickAddReminder = async (dateStr, timeStr) => {
    if (!quickText.trim()) return
    const reminder = {
      text: quickText, date: dateStr, time: timeStr,
      repeat: 'none', priority: 'normal', category: quickCategory,
      id: Date.now(), dismissed: false, createdAt: new Date().toISOString(),
    }
    try {
      const created = await db.reminders.create(reminder)
      setReminders(prev => [created, ...prev])
    } catch {
      setReminders(prev => [reminder, ...prev])
    }
    addMemory(`Set reminder: ${quickText}`)
    setQuickText('')
    setQuickCategory('personal')
    setShowQuickAdd(false)
  }

  const dismiss = async (id) => {
    const updated = reminders.map(r => r.id === id ? { ...r, dismissed: true } : r)
    setReminders(updated)
    const target = updated.find(r => r.id === id)
    try {
      if (target) await db.reminders.update(target)
    } catch { /* localStorage fallback handled by effect */ }
  }

  const deleteReminder = async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id))
    try {
      await db.reminders.delete(id)
    } catch { /* localStorage fallback handled by effect */ }
  }

  const snoozeReminder = async (id, mins) => {
    const { date, time } = computeSnoozeDateTime(mins)
    const updated = reminders.map(r =>
      r.id === id ? { ...r, date, time, dismissed: false } : r
    )
    setReminders(updated)
    checkedRef.current.delete(id) // allow re-notification
    setSnoozeOpen(null)
    const target = updated.find(r => r.id === id)
    try {
      if (target) await db.reminders.update(target)
    } catch { /* localStorage fallback */ }
  }

  // ── Derived lists ───────────────────────────────────────────────────
  const active = reminders.filter(r => !r.dismissed)
  const overdue = active.filter(r => isOverdue(r))
  const upcoming = active.filter(r => !isOverdue(r))
  const dismissed = reminders.filter(r => r.dismissed)
  const smartTimes = getSmartTimes()
  const snoozeOptions = getSnoozeOptions()

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>
          Reminders
        </h2>
        <button onClick={() => setShowAdd(true)} style={{
          padding: '12px 16px', background: colors.gradient1, color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
        }}>+ Reminder</button>
      </div>

      {/* Smart Reminders Info */}
      <div style={{
        padding: 16, background: `${colors.warning}10`, border: `1px solid ${colors.warning}25`,
        borderRadius: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ color: colors.warning, fontSize: 18 }}>&#9673;</span>
        <div>
          <div style={{ color: colors.warning, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>STARK TACTICAL REMINDER SYSTEM</div>
          <div style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
            Jarvis nudges you before things become urgent, sends day-of prompts, and follows up on lingering items.
          </div>
        </div>
      </div>

      {/* ── Overdue Reminders (red glow section) ───────────────────── */}
      {overdue.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ color: colors.danger, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
              OVERDUE
            </h3>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 22, height: 22, borderRadius: 11, fontSize: 11, fontWeight: 700,
              background: colors.danger, color: '#fff',
              animation: 'jarvisBadgePulse 1.5s ease-in-out infinite',
            }}>{overdue.length}</span>
          </div>
          {overdue.map(r => {
            const cat = getCategoryDef(r.category)
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
                background: `${colors.danger}08`, border: `1px solid ${colors.danger}40`,
                borderRadius: 10, marginBottom: 10,
                borderLeft: `3px solid ${colors.danger}`,
                animation: 'jarvisPulseGlow 2s ease-in-out infinite',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{r.text}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.date && <span style={{ fontSize: 12, color: colors.danger, fontWeight: 600 }}>{r.date}</span>}
                    <span style={{ fontSize: 12, color: colors.danger }}>{r.time}</span>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 8,
                      background: `${cat.color}20`, color: cat.color, fontWeight: 600,
                    }}>{cat.label}</span>
                    {r.repeat !== 'none' && (
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: `${colors.secondary}22`, color: colors.secondary,
                      }}>&#8635; {r.repeat}</span>
                    )}
                  </div>
                  {/* Snooze bar for overdue */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: colors.textMuted, lineHeight: '22px', marginRight: 4 }}>SNOOZE:</span>
                    {snoozeOptions.map(s => (
                      <button key={s.label} onClick={() => snoozeReminder(r.id, s.mins)} style={snoozePillStyle}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => dismiss(r.id)} style={iconBtn} title="Dismiss">&#10003;</button>
                  <button onClick={() => deleteReminder(r.id)} style={{ ...iconBtn, color: colors.danger, background: `${colors.danger}15` }}>&#10005;</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Active / Upcoming Reminders ────────────────────────────── */}
      <h3 style={{ color: colors.text, fontSize: 15, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>
        ACTIVE ({upcoming.length})
      </h3>
      {upcoming.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
          No active reminders. Set one to get nudged at the right time.
        </div>
      ) : (
        upcoming.map(r => {
          const cat = getCategoryDef(r.category)
          const isSnoozeOpen = snoozeOpen === r.id
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 10,
              borderLeft: `3px solid ${r.priority === 'urgent' ? colors.danger : r.priority === 'important' ? colors.warning : colors.primary}`,
              animation: 'jarvisSlideUp 0.3s ease-out',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{r.text}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.date && <span style={{ fontSize: 12, color: colors.primaryLight }}>{r.date}</span>}
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>{r.time}</span>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 8,
                    background: `${cat.color}20`, color: cat.color, fontWeight: 600,
                  }}>{cat.label}</span>
                  {r.repeat !== 'none' && (
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: `${colors.secondary}22`, color: colors.secondary,
                    }}>&#8635; {r.repeat}</span>
                  )}
                </div>
                {/* Snooze row — toggleable */}
                {isSnoozeOpen && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', animation: 'jarvisSlideUp 0.2s ease-out' }}>
                    <span style={{ fontSize: 12, color: colors.textMuted, lineHeight: '22px', marginRight: 4 }}>SNOOZE:</span>
                    {snoozeOptions.map(s => (
                      <button key={s.label} onClick={() => snoozeReminder(r.id, s.mins)} style={snoozePillStyle}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => setSnoozeOpen(isSnoozeOpen ? null : r.id)}
                  style={{ ...iconBtn, background: `${colors.warning}15`, color: colors.warning, fontSize: 14 }}
                  title="Snooze"
                >&#9202;</button>
                <button onClick={() => dismiss(r.id)} style={iconBtn} title="Dismiss">&#10003;</button>
                <button onClick={() => deleteReminder(r.id)} style={{ ...iconBtn, color: colors.danger, background: `${colors.danger}15` }}>&#10005;</button>
              </div>
            </div>
          )
        })
      )}

      {/* ── Dismissed ──────────────────────────────────────────────── */}
      {dismissed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: colors.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            DISMISSED ({dismissed.length})
          </h3>
          {dismissed.slice(0, 5).map(r => (
            <div key={r.id} style={{
              padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 10, opacity: 0.5,
            }}>
              <div style={{ color: colors.text, fontSize: 14, textDecoration: 'line-through' }}>{r.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ Full Add Reminder Modal ════════════════════════════════════ */}
      {showAdd && (
        <div style={modalOverlay} onClick={() => setShowAdd(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 4 }}>New Reminder</h3>
            <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14, letterSpacing: 0.5 }}>
              JARVIS SCHEDULING PROTOCOL
            </div>

            <input
              value={newReminder.text}
              onChange={e => setNewReminder({ ...newReminder, text: e.target.value })}
              placeholder="What do you want to remember?"
              style={inputStyle}
              autoFocus
            />

            {/* Smart time suggestion pills */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6, letterSpacing: 0.5, fontWeight: 600 }}>QUICK SET</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {smartTimes.map(st => (
                  <button key={st.label} onClick={() => setNewReminder({ ...newReminder, date: st.date, time: st.time })} style={{
                    padding: '8px 12px', fontSize: 12, fontWeight: 500, minHeight: 36,
                    background: (newReminder.date === st.date && newReminder.time === st.time) ? `${colors.primary}30` : `${colors.primary}10`,
                    color: colors.primaryLight, border: `1px solid ${colors.primary}30`,
                    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={newReminder.date}
                onChange={e => setNewReminder({ ...newReminder, date: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
              <input type="time" value={newReminder.time}
                onChange={e => setNewReminder({ ...newReminder, time: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
            </div>

            {/* Category pills */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6, letterSpacing: 0.5, fontWeight: 600 }}>CATEGORY</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                  <button key={cat.key} onClick={() => setNewReminder({ ...newReminder, category: cat.key })} style={{
                    padding: '8px 14px', fontSize: 12, fontWeight: 600, minHeight: 36,
                    background: newReminder.category === cat.key ? `${cat.color}30` : `${cat.color}10`,
                    color: cat.color,
                    border: newReminder.category === cat.key ? `1.5px solid ${cat.color}` : `1px solid ${cat.color}30`,
                    borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}>
                    {cat.label}
                  </button>
                ))}
              </div>
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

      {/* ══ Quick Add Modal (from FAB) ═════════════════════════════════ */}
      {showQuickAdd && (
        <div style={modalOverlay} onClick={() => setShowQuickAdd(false)}>
          <div style={{ ...modalContent, maxWidth: 360, animation: 'jarvisSlideUp 0.25s ease-out' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, color: colors.primary, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
              QUICK DEPLOY REMINDER
            </div>
            <input
              ref={quickInputRef}
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              placeholder="What needs doing?"
              style={{ ...inputStyle, fontSize: 15, padding: '14px 16px' }}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && quickText.trim()) {
                  const st = smartTimes[0]
                  quickAddReminder(st.date, st.time)
                }
              }}
            />
            {/* Category quick select */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setQuickCategory(cat.key)} style={{
                  padding: '8px 12px', fontSize: 12, fontWeight: 600, minHeight: 36,
                  background: quickCategory === cat.key ? `${cat.color}30` : 'transparent',
                  color: cat.color,
                  border: quickCategory === cat.key ? `1.5px solid ${cat.color}` : `1px solid ${cat.color}25`,
                  borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Time pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {smartTimes.map(st => (
                <button key={st.label} onClick={() => quickAddReminder(st.date, st.time)} style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600,
                  background: `${colors.primary}12`, color: colors.primaryLight,
                  border: `1px solid ${colors.primary}30`, borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                  opacity: quickText.trim() ? 1 : 0.4,
                  pointerEvents: quickText.trim() ? 'auto' : 'none',
                }}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ Floating Action Button ═════════════════════════════════════ */}
      <button
        onClick={() => { setShowQuickAdd(true); setQuickText(''); setQuickCategory('personal') }}
        style={{
          position: 'fixed', bottom: 80, right: 20,
          width: 56, height: 56, borderRadius: 28,
          background: `linear-gradient(135deg, ${colors.primary}, #0090cc)`,
          color: '#fff', fontSize: 28, fontWeight: 300, lineHeight: '56px',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'jarvisFabPulse 3s ease-in-out infinite',
          zIndex: 100,
        }}
        title="Quick Add Reminder"
      >+</button>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────
const iconBtn = {
  width: 36, height: 36, borderRadius: 8, background: `${colors.success}15`,
  border: 'none', color: colors.success, fontSize: 14, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const snoozePillStyle = {
  padding: '6px 12px', fontSize: 12, fontWeight: 600, minHeight: 32,
  background: `${colors.warning}15`, color: colors.warning,
  border: `1px solid ${colors.warning}30`, borderRadius: 8,
  cursor: 'pointer', fontFamily: 'inherit',
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
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
