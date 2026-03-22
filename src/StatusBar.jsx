import { useState, useEffect } from 'react'
import { colors, loadState } from './constants'
import { db } from './db'
import { isOffline } from './offline'

// JARVIS HUD Status Bar — persistent across all screens
// Like the heads-up display in Iron Man's helmet

export default function StatusBar() {
  const [time, setTime] = useState(new Date())
  const [online, setOnline] = useState(navigator.onLine)
  const [nextEvent, setNextEvent] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Online/offline listener
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  // Fetch next event and counts periodically
  useEffect(() => {
    const check = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const events = await db.events.list(today).catch(() => [])
        const now = new Date()

        // Find next upcoming event
        const upcoming = events.filter(e => {
          if (!e.time) return false
          const [h, m] = e.time.split(':').map(Number)
          const t = new Date()
          t.setHours(h, m, 0, 0)
          return t > now
        }).sort((a, b) => a.time.localeCompare(b.time))

        if (upcoming.length > 0) {
          const [h, m] = upcoming[0].time.split(':').map(Number)
          const eventTime = new Date()
          eventTime.setHours(h, m, 0, 0)
          const diffMin = Math.round((eventTime - now) / 60000)
          setNextEvent({
            title: upcoming[0].title,
            diffMin,
            time: upcoming[0].time,
          })
        } else {
          setNextEvent(null)
        }

        // Check offline queue
        const queue = loadState('offline_queue', [])
        setQueueCount(queue.filter(a => !a.synced).length)
      } catch {}
    }

    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [])

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '3px 12px',
      borderTop: `1px solid ${colors.border}`,
      minHeight: 20,
      flexShrink: 0,
    }}>
      {/* Left: connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: online ? colors.success : colors.danger,
          boxShadow: `0 0 4px ${online ? colors.success : colors.danger}`,
        }} />
        <span style={{
          color: online ? colors.textMuted : colors.danger,
          fontSize: 7, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1,
        }}>
          {online ? 'ONLINE' : 'OFFLINE'}
        </span>
        {queueCount > 0 && (
          <span style={{
            color: colors.secondary, fontSize: 7,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {queueCount} QUEUED
          </span>
        )}
      </div>

      {/* Center: next event countdown */}
      {nextEvent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: nextEvent.diffMin <= 15 ? colors.warning : colors.textMuted,
          fontSize: 7, fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: nextEvent.diffMin <= 15 ? colors.warning : colors.textMuted,
            display: 'inline-block',
          }} />
          <span>
            {nextEvent.title.length > 15 ? nextEvent.title.slice(0, 15) + '..' : nextEvent.title}
            {' '}in {nextEvent.diffMin < 60 ? `${nextEvent.diffMin}m` : `${Math.floor(nextEvent.diffMin / 60)}h`}
          </span>
        </div>
      )}

      {/* Right: time */}
      <span style={{
        color: colors.primary, fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 1,
        textShadow: `0 0 4px ${colors.primary}30`,
      }}>
        {timeStr}
      </span>
    </div>
  )
}
