import { useState, useMemo, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const REPEAT_OPTIONS = ['none', 'daily', 'weekly', 'monthly', 'yearly']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

// --- Helpers ---

/** Format 24h time string to 12h display */
const fmt12 = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Display time range: "10:00 AM - 11:30 AM" or just start if no end */
const fmtTimeRange = (start, end) => {
  if (!start) return ''
  const s = fmt12(start)
  if (!end) return s
  return `${s} - ${fmt12(end)}`
}

/** Parse "HH:MM" to minutes since midnight */
const toMin = (t) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Check if two time ranges overlap. Point events (no end) treated as 30-min blocks */
const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const a0 = toMin(aStart)
  const a1 = aEnd ? toMin(aEnd) : a0 + 30
  const b0 = toMin(bStart)
  const b1 = bEnd ? toMin(bEnd) : b0 + 30
  if (a0 === null || b0 === null) return false
  return a0 < b1 && b0 < a1
}

/** Generate virtual recurring event instances for a given date range */
const expandRecurring = (baseEvents, startDate, endDate) => {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')
  const virtuals = []

  for (const evt of baseEvents) {
    if (!evt.repeat || evt.repeat === 'none') continue
    const origin = new Date(evt.date + 'T00:00:00')
    if (isNaN(origin.getTime())) continue

    let cursor = new Date(origin)
    // Advance cursor to near the start of our window
    const maxIter = 1500
    let count = 0
    while (cursor < start && count < maxIter) {
      advanceCursor(cursor, evt.repeat)
      count++
    }
    // Generate instances in range
    while (cursor <= end && count < maxIter) {
      const ds = cursor.toISOString().split('T')[0]
      if (ds !== evt.date) { // skip the original
        virtuals.push({ ...evt, date: ds, _virtualOf: evt.id, id: `${evt.id}_${ds}` })
      }
      advanceCursor(cursor, evt.repeat)
      count++
    }
  }
  return virtuals
}

function advanceCursor(d, repeat) {
  switch (repeat) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: d.setFullYear(d.getFullYear() + 100) // stop
  }
}

const blankEvent = () => ({ title: '', time: '09:00', end_time: '', location: '', calendar: 'personal', color: colors.primary, repeat: 'none' })

export default function Calendar({ user, addMemory }) {
  const [events, setEvents] = useState(() => loadState('events', []))
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showAdd, setShowAdd] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null) // null = closed, object = editing
  const [formData, setFormData] = useState(blankEvent())
  const [view, setView] = useState('month') // month or week

  // Load events from D1 on mount, fall back to localStorage
  useEffect(() => {
    let cancelled = false
    db.events.list().then(dbEvents => {
      if (!cancelled) {
        setEvents(dbEvents)
        saveState('events', dbEvents)
      }
    }).catch(() => {
      // D1 unavailable, keep localStorage data
    })
    return () => { cancelled = true }
  }, [])

  const save = useCallback((evts) => { setEvents(evts); saveState('events', evts) }, [])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Date().toISOString().split('T')[0]

  // Visible date range for recurring expansion
  const visibleStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const visibleEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  // All events including virtual recurring instances
  const allEvents = useMemo(() => {
    const virtuals = expandRecurring(events, visibleStart, visibleEnd)
    return [...events, ...virtuals]
  }, [events, visibleStart, visibleEnd])

  const calendarDays = useMemo(() => {
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [firstDay, daysInMonth])

  const dayEvents = useMemo(() => {
    return allEvents.filter(e => e.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }, [allEvents, selectedDate])

  // --- Week view data ---
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    const day = d.getDay()
    const sunday = new Date(d)
    sunday.setDate(d.getDate() - day)
    return Array.from({ length: 7 }, (_, i) => {
      const wd = new Date(sunday)
      wd.setDate(sunday.getDate() + i)
      return wd.toISOString().split('T')[0]
    })
  }, [selectedDate])

  const weekStart = weekDays[0]
  const weekEnd = weekDays[6]

  const weekEvents = useMemo(() => {
    const virtuals = expandRecurring(events, weekStart, weekEnd)
    const all = [...events, ...virtuals]
    return all.filter(e => weekDays.includes(e.date))
  }, [events, weekDays, weekStart, weekEnd])

  // --- Conflict detection ---
  const detectConflicts = useCallback((date, time, endTime, excludeId) => {
    if (!time) return []
    const candidates = allEvents.filter(e => e.date === date && e.id !== excludeId && e.time)
    return candidates.filter(e => overlaps(time, endTime, e.time, e.end_time))
  }, [allEvents])

  const formConflicts = useMemo(() => {
    const date = editingEvent ? editingEvent.date : selectedDate
    const excludeId = editingEvent ? editingEvent.id : null
    return detectConflicts(date, formData.time, formData.end_time, excludeId)
  }, [formData.time, formData.end_time, editingEvent, selectedDate, detectConflicts])

  // --- Actions ---
  const openAdd = () => {
    setEditingEvent(null)
    setFormData(blankEvent())
    setShowAdd(true)
  }

  const openEdit = (evt) => {
    // Don't allow editing virtual instances directly -- edit the base event
    if (evt._virtualOf) {
      const base = events.find(e => e.id === evt._virtualOf)
      if (base) {
        setEditingEvent(base)
        setFormData({ title: base.title, time: base.time || '09:00', end_time: base.end_time || '', location: base.location || '', calendar: base.calendar || 'personal', color: base.color || colors.primary, repeat: base.repeat || 'none' })
      }
    } else {
      setEditingEvent(evt)
      setFormData({ title: evt.title, time: evt.time || '09:00', end_time: evt.end_time || '', location: evt.location || '', calendar: evt.calendar || 'personal', color: evt.color || colors.primary, repeat: evt.repeat || 'none' })
    }
    setShowAdd(true)
  }

  const closeModal = () => { setShowAdd(false); setEditingEvent(null); setFormData(blankEvent()) }

  const addEvent = async () => {
    if (!formData.title.trim()) return
    const evt = { ...formData, id: Date.now(), date: selectedDate }
    save([...events, evt])
    addMemory(`Added event: ${formData.title} on ${selectedDate}`)
    closeModal()
    try {
      const created = await db.events.create(evt)
      setEvents(prev => {
        const updated = prev.map(e => e.id === evt.id ? { ...evt, ...created } : e)
        saveState('events', updated)
        return updated
      })
    } catch {
      // D1 unavailable, localStorage fallback already saved
    }
  }

  const updateEvent = async () => {
    if (!editingEvent || !formData.title.trim()) return
    const updated = { ...editingEvent, ...formData }
    save(events.map(e => e.id === editingEvent.id ? updated : e))
    addMemory(`Updated event: ${formData.title}`)
    closeModal()
    try {
      await db.events.update(updated)
    } catch {
      // D1 unavailable, localStorage fallback already saved
    }
  }

  const deleteEvent = async (id) => {
    // If virtual, resolve to base id
    const realId = typeof id === 'string' && id.includes('_') ? Number(id.split('_')[0]) : id
    save(events.filter(e => e.id !== realId))
    try {
      await db.events.delete(realId)
    } catch {
      // D1 unavailable, localStorage fallback already saved
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const prevWeek = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 7)
    setSelectedDate(d.toISOString().split('T')[0])
    setCurrentDate(d)
  }
  const nextWeek = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + 7)
    setSelectedDate(d.toISOString().split('T')[0])
    setCurrentDate(d)
  }

  const getDateStr = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const hasEvents = (day) => allEvents.some(e => e.date === getDateStr(day))

  const calColors = [colors.primary, colors.secondary, colors.accent, colors.warning, colors.success]
  const calMap = { personal: 0, work: 1, family: 2, school: 3 }

  // --- Render ---
  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>
          <span style={{ color: colors.accent, fontWeight: 300, fontSize: 12, letterSpacing: 1, display: 'block', marginBottom: 2 }}>J.A.R.V.I.S.</span>
          Calendar
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView(view === 'month' ? 'week' : 'month')} style={smallBtn}>
            {view === 'month' ? 'Week' : 'Month'}
          </button>
          <button onClick={openAdd} style={{ ...smallBtn, background: colors.gradient1, color: '#fff' }}>+ Event</button>
        </div>
      </div>

      {/* Calendar Selector Labels */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['Personal', 'Work', 'Family', 'School'].map((cal, i) => (
          <span key={cal} style={{
            padding: '6px 12px', borderRadius: 12, fontSize: 12,
            background: `${calColors[i]}22`, color: calColors[i], border: `1px solid ${calColors[i]}44`,
          }}>{cal}</span>
        ))}
      </div>

      {view === 'month' ? (
        <>
          {/* Month Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button onClick={prevMonth} style={navBtn}>‹</button>
            <span style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} style={navBtn}>›</button>
          </div>

          {/* Day Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, padding: 6 }}>{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 20 }}>
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />
              const dateStr = getDateStr(day)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const has = hasEvents(day)
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    padding: '10px 0', background: isSelected ? colors.primary : 'transparent', minHeight: 44,
                    border: isToday && !isSelected ? `1px solid ${colors.primary}` : `1px solid transparent`,
                    borderRadius: 8, color: isSelected ? '#fff' : colors.text,
                    fontSize: 13, cursor: 'pointer', position: 'relative',
                  }}
                >
                  {day}
                  {has && (
                    <span style={{
                      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                      width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#fff' : colors.accent,
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        /* ===== WEEK VIEW ===== */
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button onClick={prevWeek} style={navBtn}>‹</button>
            <span style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>
              {new Date(weekStart + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(weekEnd + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={nextWeek} style={navBtn}>›</button>
          </div>

          {/* Week column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '42px repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
            <div />
            {weekDays.map(ds => {
              const d = new Date(ds + 'T12:00:00')
              const isToday = ds === todayStr
              const isSel = ds === selectedDate
              return (
                <button key={ds} onClick={() => setSelectedDate(ds)} style={{
                  textAlign: 'center', padding: '4px 0', background: isSel ? `${colors.primary}33` : 'transparent',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{DAYS[d.getDay()]}</div>
                  <div style={{
                    fontSize: 14, fontWeight: isToday ? 700 : 500,
                    color: isToday ? colors.accent : colors.text,
                  }}>{d.getDate()}</div>
                </button>
              )
            })}
          </div>

          {/* Hourly grid */}
          <div style={{ maxHeight: 400, overflowY: 'auto', position: 'relative', border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '42px repeat(7, 1fr)', gap: 0 }}>
              {HOUR_LABELS.map(h => {
                const hour = h.split(':')[0]
                return [
                  <div key={`lbl-${h}`} style={{ fontSize: 11, color: colors.textMuted, padding: '2px 4px', textAlign: 'right', borderTop: `1px solid ${colors.border}15`, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {Number(hour) % 2 === 0 ? fmt12(h).replace(':00 ', ' ') : ''}
                  </div>,
                  ...weekDays.map(ds => {
                    const evtsHere = weekEvents.filter(e => e.date === ds && e.time && e.time.startsWith(hour + ':'))
                    return (
                      <div key={`${ds}-${h}`} onClick={() => setSelectedDate(ds)} style={{
                        height: 28, borderTop: `1px solid ${colors.border}15`, borderLeft: `1px solid ${colors.border}10`,
                        position: 'relative', cursor: 'pointer',
                      }}>
                        {evtsHere.map(ev => (
                          <div key={ev.id} onClick={(e) => { e.stopPropagation(); openEdit(ev) }} title={ev.title} style={{
                            position: 'absolute', top: 1, left: 1, right: 1,
                            height: ev.end_time ? Math.max(14, (toMin(ev.end_time) - toMin(ev.time)) / 60 * 28) : 14,
                            background: `${ev.color || colors.primary}88`,
                            borderRadius: 3, fontSize: 11, color: '#fff', padding: '1px 3px',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer',
                            zIndex: 2, borderLeft: `2px solid ${ev.color || colors.primary}`,
                          }}>
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    )
                  })
                ]
              }).flat()}
            </div>
          </div>
        </>
      )}

      {/* Selected Day Events */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {selectedDate === todayStr ? 'Today' : new Date(selectedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </h3>
        {dayEvents.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
            No events scheduled. Tap "+ Event" to create one, sir.
          </div>
        ) : (
          dayEvents.map(e => (
            <div key={e.id} onClick={() => openEdit(e)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 10, borderLeft: `3px solid ${e.color || colors.primary}`,
              cursor: 'pointer', transition: 'background 0.15s',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{e.title}</div>
                <div style={{ color: colors.primaryLight, fontSize: 13, marginTop: 2 }}>
                  {fmtTimeRange(e.time, e.end_time)}
                </div>
                {e.location && <div style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{e.location}</div>}
                <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 8,
                    background: `${e.color || colors.primary}22`, color: e.color || colors.primaryLight,
                  }}>{e.calendar}</span>
                  {e.repeat && e.repeat !== 'none' && (
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 8,
                      background: `${colors.accent}18`, color: colors.accent, letterSpacing: 0.5,
                    }}>REPEATS {e.repeat.toUpperCase()}</span>
                  )}
                  {e._virtualOf && (
                    <span style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>recurring instance</span>
                  )}
                </div>
              </div>
              <button onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id) }} style={{
                background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 16,
              }}>✕</button>
            </div>
          ))
        )}
      </div>

      {/* AI Suggestion */}
      <div style={{
        padding: 14, background: `${colors.primary}10`, border: `1px solid ${colors.primary}25`,
        borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span style={{ color: colors.primary, fontSize: 16 }}>◉</span>
        <div>
          <div style={{ color: colors.primaryLight, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>JARVIS ANALYSIS</div>
          <div style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
            {dayEvents.length > 3 ? "Heavy schedule detected, sir. I'd recommend blocking recovery time between engagements." :
             dayEvents.length > 1 ? "Moderate day ahead. All systems nominal." :
             "Light schedule. Shall I find optimal slots for a focus block, sir?"}
          </div>
        </div>
      </div>

      {/* Add / Edit Event Modal */}
      {showAdd && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {editingEvent ? 'Edit Event' : 'New Event'}
            </h3>
            <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16, letterSpacing: 1 }}>
              {editingEvent ? `MODIFYING // ${editingEvent.date}` : `SCHEDULING // ${selectedDate}`}
            </div>

            <input
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Event title"
              style={inputStyle}
              autoFocus
            />

            {/* Start / End time */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>START</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={e => setFormData({ ...formData, time: e.target.value })}
                  style={{ ...inputStyle }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>END</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                  style={{ ...inputStyle }}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Calendar type */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>CALENDAR</label>
                <select
                  value={formData.calendar}
                  onChange={e => setFormData({ ...formData, calendar: e.target.value, color: calColors[calMap[e.target.value] ?? 0] })}
                  style={{ ...inputStyle }}
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="family">Family</option>
                  <option value="school">School</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>REPEAT</label>
                <select
                  value={formData.repeat}
                  onChange={e => setFormData({ ...formData, repeat: e.target.value })}
                  style={{ ...inputStyle }}
                >
                  {REPEAT_OPTIONS.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <input
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              placeholder="Location (optional)"
              style={inputStyle}
            />

            {/* Conflict warning */}
            {formConflicts.length > 0 && (
              <div style={{
                padding: '10px 14px', marginBottom: 10, borderRadius: 8,
                background: `${colors.warning}18`, border: `1px solid ${colors.warning}55`,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ color: colors.warning, fontSize: 16, lineHeight: 1 }}>&#9888;</span>
                <div>
                  <div style={{ color: colors.warning, fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>TEMPORAL CONFLICT DETECTED</div>
                  <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Overlaps with: {formConflicts.map(c => c.title).join(', ')}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={closeModal} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              {editingEvent ? (
                <button onClick={updateEvent} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Save Changes</button>
              ) : (
                <button onClick={addEvent} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Add Event</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const smallBtn = {
  padding: '10px 16px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
  borderRadius: 8, color: colors.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
const navBtn = {
  background: 'none', border: 'none', color: colors.text, fontSize: 22, cursor: 'pointer', padding: '10px 16px', minHeight: 44,
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 420,
  border: `1px solid ${colors.border}`, maxHeight: '90vh', overflowY: 'auto',
}
const inputStyle = {
  width: '100%', padding: '12px 14px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box',
}
const labelStyle = {
  display: 'block', fontSize: 12, color: colors.textMuted, letterSpacing: 1,
  marginBottom: 4, fontWeight: 600,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
