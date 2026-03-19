import { useState, useMemo, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Calendar({ user, addMemory }) {
  const [events, setEvents] = useState(() => loadState('events', []))
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showAdd, setShowAdd] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', time: '09:00', location: '', calendar: 'personal', color: colors.primary })
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

  const calendarDays = useMemo(() => {
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [firstDay, daysInMonth])

  const dayEvents = useMemo(() => {
    return events.filter(e => e.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time))
  }, [events, selectedDate])

  const addEvent = async () => {
    if (!newEvent.title.trim()) return
    const evt = { ...newEvent, id: Date.now(), date: selectedDate }
    // Optimistic update
    save([...events, evt])
    addMemory(`Added event: ${newEvent.title} on ${selectedDate}`)
    setNewEvent({ title: '', time: '09:00', location: '', calendar: 'personal', color: colors.primary })
    setShowAdd(false)
    try {
      const created = await db.events.create(evt)
      // Replace optimistic entry with server-confirmed entry (may have different id)
      setEvents(prev => {
        const updated = prev.map(e => e.id === evt.id ? { ...evt, ...created } : e)
        saveState('events', updated)
        return updated
      })
    } catch {
      // D1 unavailable, localStorage fallback already saved
    }
  }

  const deleteEvent = async (id) => {
    // Optimistic update
    save(events.filter(e => e.id !== id))
    try {
      await db.events.delete(id)
    } catch {
      // D1 unavailable, localStorage fallback already saved
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const getDateStr = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const hasEvents = (day) => events.some(e => e.date === getDateStr(day))

  const calColors = [colors.primary, colors.secondary, colors.accent, colors.warning, colors.success]

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Calendar</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView(view === 'month' ? 'week' : 'month')} style={smallBtn}>
            {view === 'month' ? 'Week' : 'Month'}
          </button>
          <button onClick={() => setShowAdd(true)} style={{ ...smallBtn, background: colors.gradient1, color: '#fff' }}>+ Event</button>
        </div>
      </div>

      {/* Calendar Selector Labels */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['Personal', 'Work', 'Family', 'School'].map((cal, i) => (
          <span key={cal} style={{
            padding: '4px 10px', borderRadius: 12, fontSize: 11,
            background: `${calColors[i]}22`, color: calColors[i], border: `1px solid ${calColors[i]}44`,
          }}>{cal}</span>
        ))}
      </div>

      {/* Month Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={prevMonth} style={navBtn}>‹</button>
        <span style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} style={navBtn}>›</button>
      </div>

      {/* Day Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', color: colors.textMuted, fontSize: 11, padding: 4 }}>{d}</div>
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
                padding: '8px 0', background: isSelected ? colors.primary : 'transparent',
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

      {/* Selected Day Events */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {selectedDate === todayStr ? 'Today' : new Date(selectedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </h3>
        {dayEvents.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
            No events. Tap "+ Event" to add one.
          </div>
        ) : (
          dayEvents.map(e => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${e.color || colors.primary}`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{e.title}</div>
                <div style={{ color: colors.primaryLight, fontSize: 12, marginTop: 2 }}>{e.time}</div>
                {e.location && <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{e.location}</div>}
                <div style={{ marginTop: 4 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 8,
                    background: `${colors.primary}22`, color: colors.primaryLight,
                  }}>{e.calendar}</span>
                </div>
              </div>
              <button onClick={() => deleteEvent(e.id)} style={{
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
          <div style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600 }}>SMART SUGGESTION</div>
          <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {dayEvents.length > 2 ? "Busy day! Consider blocking time for breaks." : "Looks manageable. Want me to find time for a focus block?"}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {showAdd && (
        <div style={modalOverlay} onClick={() => setShowAdd(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New Event</h3>
            <input
              value={newEvent.title}
              onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder="Event title"
              style={inputStyle}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="time"
                value={newEvent.time}
                onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <select
                value={newEvent.calendar}
                onChange={e => setNewEvent({ ...newEvent, calendar: e.target.value, color: calColors[['personal', 'work', 'family', 'school'].indexOf(e.target.value)] })}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="family">Family</option>
                <option value="school">School</option>
              </select>
            </div>
            <input
              value={newEvent.location}
              onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
              placeholder="Location (optional)"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={addEvent} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Add Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const smallBtn = {
  padding: '6px 14px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
  borderRadius: 8, color: colors.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
}
const navBtn = {
  background: 'none', border: 'none', color: colors.text, fontSize: 22, cursor: 'pointer', padding: '4px 12px',
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
