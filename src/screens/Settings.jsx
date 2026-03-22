import { useState, useEffect } from 'react'
import { colors, loadState, saveState, setTheme, getTheme } from '../constants'
import { db, auth } from '../db'
import { isPushSupported, getPermissionState, requestPermission, sendLocalNotification } from '../push'

export default function Settings({ user, updateUser, addMemory }) {
  const [editName, setEditName] = useState(false)
  const [name, setName] = useState(user.name)
  const [showMemory, setShowMemory] = useState(false)
  const [showCircle, setShowCircle] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', phone: '', role: 'family' })
  const [briefingTime, setBriefingTime] = useState(() => loadState('briefingTime', '07:00'))
  const [briefingDays, setBriefingDays] = useState(() => loadState('briefingDays', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']))
  const [showChangePin, setShowChangePin] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const [pushState, setPushState] = useState(getPermissionState())
  const [theme, setThemeState] = useState(getTheme())

  useEffect(() => {
    db.user.get().then(data => {
      if (data.briefing_time) setBriefingTime(data.briefing_time)
      if (data.briefing_days) setBriefingDays(data.briefing_days)
    }).catch(() => {})
  }, [])

  const saveName = () => {
    updateUser({ name: name || 'Friend' })
    setEditName(false)
    addMemory(`Changed name to ${name}`)
  }

  const toggleIntegration = (key) => {
    updateUser({
      integrations: { ...user.integrations, [key]: !user.integrations[key] },
    })
  }

  const addCircleMember = () => {
    if (!newMember.name.trim()) return
    updateUser({ circle: [...user.circle, { ...newMember, id: Date.now() }] })
    addMemory(`Added ${newMember.name} to circle`)
    setNewMember({ name: '', phone: '', role: 'family' })
  }

  const removeCircleMember = (id) => {
    updateUser({ circle: user.circle.filter(m => m.id !== id) })
  }

  const handleChangePin = async () => {
    setPinMsg('')
    if (!currentPin || currentPin.length < 4) { setPinMsg('Enter your current PIN'); return }
    if (!newPin || newPin.length < 4) { setPinMsg('New PIN must be at least 4 digits'); return }
    try {
      await auth.changePin(currentPin, newPin)
      setPinMsg('PIN updated!')
      setCurrentPin('')
      setNewPin('')
      setTimeout(() => { setPinMsg(''); setShowChangePin(false) }, 1500)
    } catch (err) {
      setPinMsg(err.message)
    }
  }

  const clearAllData = () => {
    if (confirm('This will delete all your data. Are you sure?')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  const integrations = [
    { key: 'google', name: 'Google Calendar', desc: 'Sync events from Google', icon: 'GC' },
    { key: 'apple', name: 'Apple Calendar', desc: 'Sync iCloud Calendar', icon: 'AC' },
    { key: 'outlook', name: 'Outlook', desc: 'Microsoft calendar & email', icon: 'OL' },
    { key: 'slack', name: 'Slack', desc: 'Workspace messaging', icon: 'SL' },
    { key: 'whatsapp', name: 'WhatsApp', desc: 'Chat messaging', icon: 'WA' },
    { key: 'instacart', name: 'Instacart', desc: 'Grocery delivery', icon: 'IC' },
  ]

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 14, fontWeight: 600, marginBottom: 20,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 1, textTransform: 'uppercase',
      }}>System Configuration</h2>

      {/* Profile */}
      <Section title="USER PROFILE">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <div style={{
            width: 44, height: 44,
            border: `1px solid ${colors.primary}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: colors.primary, fontSize: 16, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: colors.glow,
          }}>{(user.name || 'U')[0].toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            {editName ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveName()} />
                <button onClick={saveName} style={smBtn}>SAVE</button>
              </div>
            ) : (
              <>
                <div style={{ color: colors.text, fontSize: 15, fontWeight: 500, fontFamily: "'Exo 2', sans-serif" }}>{user.name}</div>
                <button onClick={() => setEditName(true)} style={{
                  background: 'none', border: 'none', color: colors.textMuted, fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, padding: '12px 16px', minHeight: 44,
                }}>
                  MODIFY
                </button>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* Email Accounts */}
      <EmailAccounts />

      {/* Display Mode */}
      <Section title="DISPLAY MODE">
        <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
          {[['auto', 'AUTO'], ['dark', 'DARK'], ['sun', 'SUN']].map(([t, label]) => (
            <button key={t} onClick={() => { setTheme(t); setThemeState(t); window.location.reload() }} style={{
              flex: 1, padding: '12px 0', minHeight: 44,
              background: theme === t ? colors.primaryDim : 'transparent',
              border: `1px solid ${theme === t ? colors.primary : colors.border}`,
              color: theme === t ? colors.primary : colors.textMuted,
              fontSize: 11, cursor: 'pointer', borderRadius: 8,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>{label}</button>
          ))}
        </div>
        <div style={{
          padding: '4px 14px 10px', color: colors.textMuted, fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Auto detects system preference. Sun mode for outdoor readability.
        </div>
      </Section>

      {/* Circle / Family */}
      <Section title="TRUSTED CONTACTS">
        <div style={{ padding: '8px 14px' }}>
          <p style={{
            color: colors.textMuted, fontSize: 14, marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Add personnel to delegate tasks and share calendars.
          </p>
          {user.circle.map(member => (
            <div key={member.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                width: 30, height: 30,
                border: `1px solid ${colors.primary}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.primary, fontSize: 12, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{member.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{member.name}</div>
                <div style={{
                  color: colors.textMuted, fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{member.phone} / {member.role}</div>
              </div>
              <button onClick={() => removeCircleMember(member.id)} style={{
                background: 'none', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 11, cursor: 'pointer',
                padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", minHeight: 44, borderRadius: 8,
              }}>X</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })}
              placeholder="Name" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <input value={newMember.phone} onChange={e => setNewMember({ ...newMember, phone: e.target.value })}
              placeholder="Phone" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <button onClick={addCircleMember} style={smBtn}>ADD</button>
          </div>
        </div>
      </Section>

      {/* Morning Briefing */}
      {/* Calendar Sync */}
      <CalendarSyncSettings />

      <Section title="BRIEFING SCHEDULE">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              color: colors.textMuted, fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 1,
            }}>TIME:</span>
            <input type="time" value={briefingTime} onChange={e => { setBriefingTime(e.target.value); saveState('briefingTime', e.target.value); db.user.update({ briefing_time: e.target.value }).catch(() => {}) }}
              style={{ ...inputStyle, marginBottom: 0, width: 'auto' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <button key={day} onClick={() => {
                const updated = briefingDays.includes(day) ? briefingDays.filter(d => d !== day) : [...briefingDays, day]
                setBriefingDays(updated)
                saveState('briefingDays', updated)
                db.user.update({ briefing_days: updated }).catch(() => {})
              }} style={{
                padding: '10px 12px', minHeight: 44,
                background: briefingDays.includes(day) ? colors.primaryDim : 'transparent',
                border: `1px solid ${briefingDays.includes(day) ? colors.primary : colors.border}`,
                color: briefingDays.includes(day) ? colors.primary : colors.textMuted,
                fontSize: 11, cursor: 'pointer', borderRadius: 8,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 0.5,
                transition: 'all 0.15s ease',
              }}>{day}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* Quick Links — real links, not fake toggles */}
      <Section title="QUICK LINKS">
        {[
          { name: 'Google Calendar', url: 'https://calendar.google.com', icon: 'GC', col: '#4285f4' },
          { name: 'iCloud Calendar', url: 'https://www.icloud.com/calendar', icon: 'AC', col: '#a0a0a0' },
          { name: 'Outlook Calendar', url: 'https://outlook.live.com/calendar', icon: 'OL', col: '#0078d4' },
          { name: 'Gmail', url: 'https://mail.google.com', icon: 'GM', col: '#ea4335' },
          { name: 'Spotify', url: 'https://open.spotify.com', icon: 'SP', col: '#1db954' },
          { name: 'Google Maps', url: 'https://maps.google.com', icon: 'MP', col: '#34a853' },
          { name: 'Instacart', url: 'https://www.instacart.com', icon: 'IC', col: '#43b02a' },
        ].map(link => (
          <button key={link.name} onClick={() => window.open(link.url, '_blank')} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 44,
            borderBottom: `1px solid ${colors.border}`,
            width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border}`,
            cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{
              fontSize: 11, width: 24, textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              color: link.col, fontWeight: 600,
            }}>{link.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>{link.name}</div>
            </div>
            <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>OPEN →</span>
          </button>
        ))}
      </Section>

      {/* AI Memory */}
      <Section title="MEMORY BANK">
        <div style={{ padding: '10px 14px' }}>
          <p style={{
            color: colors.textMuted, fontSize: 11, marginBottom: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            System learns preferences and routines. {user.memory.length} entries stored.
          </p>
          <button onClick={() => setShowMemory(!showMemory)} style={{
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            padding: '12px 16px', color: colors.textSecondary, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1, borderRadius: 8, minHeight: 44,
            transition: 'all 0.15s ease',
          }}>
            {showMemory ? 'COLLAPSE' : 'EXPAND'} LOG
          </button>
          {showMemory && (
            <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
              {user.memory.length === 0 ? (
                <div style={{
                  color: colors.textMuted, fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>No entries. System will learn from usage.</div>
              ) : (
                user.memory.map((m, i) => (
                  <div key={i} style={{
                    padding: '5px 0', borderBottom: `1px solid ${colors.border}`,
                    fontSize: 11, color: colors.textSecondary,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <span style={{ color: colors.textMuted }}>{new Date(m.date).toLocaleDateString()}</span>
                    {' '}{m.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Notifications */}
      <Section title="NOTIFICATIONS">
        <div style={{ padding: '10px 14px' }}>
          {!isPushSupported() ? (
            <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              Push notifications not supported in this browser
            </div>
          ) : pushState === 'granted' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.success, boxShadow: `0 0 6px ${colors.success}` }} />
                <span style={{ color: colors.success, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                  NOTIFICATIONS ACTIVE
                </span>
              </div>
              <button onClick={() => {
                sendLocalNotification('J.A.R.V.I.S.', 'Notification system operational, sir.', { tag: 'test' })
              }} style={{
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 11, cursor: 'pointer', padding: '12px 16px',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, borderRadius: 8, minHeight: 44,
              }}>SEND TEST</button>
            </div>
          ) : pushState === 'denied' ? (
            <div style={{ color: colors.danger, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              Notifications blocked. Enable in browser settings.
            </div>
          ) : (
            <button onClick={async () => {
              const granted = await requestPermission()
              setPushState(granted ? 'granted' : 'denied')
              if (granted) sendLocalNotification('J.A.R.V.I.S.', 'Notification system online, sir.')
            }} style={{
              width: '100%', padding: '12px 16px',
              background: colors.primaryDim,
              border: `1px solid ${colors.primary}`,
              color: colors.primary, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, borderRadius: 8, minHeight: 44,
            }}>ENABLE NOTIFICATIONS</button>
          )}
        </div>
      </Section>

      {/* Security */}
      <Section title="ACCESS CONTROL">
        <div style={{ padding: '10px 14px' }}>
          {!showChangePin ? (
            <button onClick={() => setShowChangePin(true)} style={{
              width: '100%', padding: '12px 16px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 1, borderRadius: 8, minHeight: 44,
              transition: 'all 0.15s ease',
            }}>CHANGE ACCESS CODE</button>
          ) : (
            <div>
              <input
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Current PIN"
                type="password"
                inputMode="numeric"
                style={{ width: '100%', padding: 10, marginBottom: 8, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
              />
              <input
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="New PIN (4+ digits)"
                type="password"
                inputMode="numeric"
                style={{ width: '100%', padding: 10, marginBottom: 8, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                onKeyDown={e => e.key === 'Enter' && handleChangePin()}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleChangePin} style={{
                  flex: 1, padding: '12px 16px',
                  background: colors.primaryDim,
                  color: colors.primary,
                  border: `1px solid ${colors.primary}`,
                  fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1, borderRadius: 8, minHeight: 44,
                }}>CONFIRM</button>
                <button onClick={() => { setShowChangePin(false); setCurrentPin(''); setNewPin(''); setPinMsg('') }} style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  color: colors.textMuted,
                  border: `1px solid ${colors.border}`,
                  fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1, borderRadius: 8, minHeight: 44,
                }}>ABORT</button>
              </div>
              {pinMsg && <p style={{
                color: pinMsg === 'PIN updated!' ? colors.success : colors.danger,
                fontSize: 10, marginTop: 8,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{pinMsg}</p>}
            </div>
          )}
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="SYSTEM RESET">
        <div style={{ padding: '10px 14px' }}>
          <button onClick={clearAllData} style={{
            width: '100%', padding: '12px 16px',
            background: 'transparent',
            border: `1px solid ${colors.danger}30`,
            color: colors.danger, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1, borderRadius: 8, minHeight: 44,
            transition: 'all 0.15s ease',
          }}>PURGE ALL DATA</button>
        </div>
      </Section>

      {/* Data Export / Backup */}
      <Section title="DATA // BACKUP">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 10, lineHeight: 1.6 }}>
            Export all your JARVIS data as a JSON file. Use it to backup or migrate.
          </div>
          <button onClick={() => {
            const data = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key.startsWith('jarvis_')) {
                try { data[key] = JSON.parse(localStorage.getItem(key)) }
                catch { data[key] = localStorage.getItem(key) }
              }
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `jarvis-backup-${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
          }} style={{
            width: '100%', padding: '12px 16px', marginBottom: 6,
            background: colors.primaryDim, border: `1px solid ${colors.primary}`,
            color: colors.primary, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, borderRadius: 8, minHeight: 44,
          }}>EXPORT ALL DATA</button>
          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  try {
                    const data = JSON.parse(reader.result)
                    let count = 0
                    for (const [key, value] of Object.entries(data)) {
                      if (key.startsWith('jarvis_')) {
                        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
                        count++
                      }
                    }
                    alert(`Restored ${count} data entries. Reloading...`)
                    window.location.reload()
                  } catch { alert('Invalid backup file') }
                }
                reader.readAsText(file)
              }}
              style={{ display: 'none' }}
              id="backup-import"
            />
            <button onClick={() => document.getElementById('backup-import')?.click()} style={{
              width: '100%', padding: '12px 16px',
              background: 'transparent', border: `1px solid ${colors.border}`,
              color: colors.textMuted, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, borderRadius: 8, minHeight: 44,
            }}>IMPORT BACKUP</button>
          </div>
        </div>
      </Section>

      {/* About / Version */}
      <Section title="ABOUT // VERSION">
        <div style={{ padding: '14px 14px 16px', textAlign: 'center' }}>
          <div style={{
            color: colors.primary, fontSize: 14, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 6,
          }}>J.A.R.V.I.S. v2.0</div>
          <div style={{
            color: colors.textMuted, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 4,
          }}>Just A Rather Very Intelligent System</div>
          <div style={{
            color: colors.textSecondary, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.8,
          }}>
            Powered by Anthropic Claude // Built by Tony Stark (you)
          </div>
          <div style={{
            marginTop: 10, width: 30, height: 1,
            background: colors.border, margin: '10px auto',
          }} />
          <div style={{
            color: colors.textMuted, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
          }}>
            {(() => {
              try {
                const learned = JSON.parse(localStorage.getItem('jarvis_learned') || '0')
                const count = typeof learned === 'number' ? learned : (Array.isArray(learned) ? learned.length : Object.keys(learned).length)
                return `${count} interaction${count !== 1 ? 's' : ''} logged`
              } catch { return '0 interactions logged' }
            })()}
          </div>
        </div>
      </Section>

      <div style={{ height: 40 }} />
    </div>
  )
}

function CalendarSyncSettings() {
  const [feeds, setFeeds] = useState(() => loadState('ics_feeds', []))
  const [icsUrl, setIcsUrl] = useState('')
  const [feedName, setFeedName] = useState('')
  const [provider, setProvider] = useState('google')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const CAL_PROVIDERS = [
    { id: 'google', name: 'Google', help: 'Google Calendar → Settings → your calendar → "Secret address in iCal format". Copy the URL. Google never sees your JARVIS data — one-way pull only.' },
    { id: 'apple', name: 'Apple iCloud', help: 'Calendar app → right-click calendar → Share → Public Calendar. Copy the URL. Or use iCloud.com → Calendar → Share.' },
    { id: 'outlook', name: 'Outlook', help: 'Outlook.com → Calendar → Settings → Shared calendars → Publish. Copy the ICS link.' },
    { id: 'custom', name: 'Other ICS', help: 'Paste any ICS/webcal feed URL.' },
  ]

  const addFeed = async () => {
    if (!icsUrl.trim()) return
    setSyncing(true)
    setSyncResult('')
    try {
      const result = await db.ics.import(icsUrl.trim())
      const feed = {
        id: Date.now().toString(),
        name: feedName.trim() || CAL_PROVIDERS.find(p => p.id === provider)?.name || 'Calendar',
        url: icsUrl.trim(),
        provider,
        lastSync: new Date().toISOString(),
        eventCount: result.imported || 0,
      }
      const updated = [...feeds, feed]
      setFeeds(updated)
      saveState('ics_feeds', updated)
      setSyncResult(`Added! Imported ${result.imported || 0} events.`)
      setIcsUrl('')
      setFeedName('')
      setShowAdd(false)
    } catch (err) {
      setSyncResult(`Error: ${err.message}`)
    }
    setSyncing(false)
  }

  const removeFeed = (id) => {
    const updated = feeds.filter(f => f.id !== id)
    setFeeds(updated)
    saveState('ics_feeds', updated)
  }

  const syncNow = async (feed) => {
    setSyncing(true)
    try {
      const result = await db.ics.import(feed.url)
      const updated = feeds.map(f => f.id === feed.id ? {
        ...f, lastSync: new Date().toISOString(), eventCount: result.imported || 0,
      } : f)
      setFeeds(updated)
      saveState('ics_feeds', updated)
      setSyncResult(`Synced ${feed.name}: ${result.imported || 0} events`)
    } catch (err) {
      setSyncResult(`Sync failed: ${err.message}`)
    }
    setSyncing(false)
  }

  const lastSync = loadState('ics_last_sync', null)

  return (
    <Section title="CALENDAR SYNC">
      <div style={{ padding: '10px 14px' }}>
        <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, lineHeight: 1.6 }}>
          Import calendars from Google, Apple, or Outlook. One-way pull — your JARVIS data is never shared. Auto-syncs every 30 minutes.
        </div>

        {lastSync && (
          <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
            LAST AUTO-SYNC: {new Date(lastSync).toLocaleString()}
          </div>
        )}

        {/* Existing feeds */}
        {feeds.map(feed => (
          <div key={feed.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          }}>
            <span style={{
              color: feed.provider === 'google' ? '#4285f4' : feed.provider === 'apple' ? '#a0a0a0' : colors.primary,
              fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
            }}>{feed.provider === 'google' ? 'GC' : feed.provider === 'apple' ? 'AP' : feed.provider === 'outlook' ? 'OL' : 'IC'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 11, fontFamily: "'Exo 2', sans-serif" }}>{feed.name}</div>
              <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                {feed.eventCount} events // synced {feed.lastSync ? new Date(feed.lastSync).toLocaleDateString() : 'never'}
              </div>
            </div>
            <button onClick={() => syncNow(feed)} disabled={syncing} style={{
              padding: '8px 10px', fontSize: 11, background: 'transparent',
              border: `1px solid ${colors.border}`, color: colors.textMuted,
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", borderRadius: 8, minHeight: 44,
            }}>SYNC</button>
            <button onClick={() => removeFeed(feed.id)} style={{
              padding: '8px 10px', fontSize: 11, background: 'transparent', borderRadius: 8, minHeight: 44,
              border: `1px solid ${colors.danger}`, color: colors.danger,
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            }}>DEL</button>
          </div>
        ))}

        {/* Add feed */}
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', padding: 10, marginTop: 6,
            background: 'transparent', border: `1px dashed ${colors.border}`,
            color: colors.textMuted, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, borderRadius: 8, minHeight: 44,
          }}>+ ADD CALENDAR FEED</button>
        ) : (
          <div style={{ marginTop: 8, padding: 10, border: `1px solid ${colors.border}`, background: colors.surfaceLight }}>
            {/* Provider selection */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {CAL_PROVIDERS.map(p => (
                <button key={p.id} onClick={() => setProvider(p.id)} style={{
                  padding: '8px 12px', fontSize: 11, minHeight: 44, borderRadius: 8,
                  background: provider === p.id ? colors.primaryDim : 'transparent',
                  border: `1px solid ${provider === p.id ? colors.primary : colors.border}`,
                  color: provider === p.id ? colors.primary : colors.textMuted,
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}>{p.name}</button>
              ))}
            </div>

            {/* Provider help */}
            <div style={{
              color: colors.textSecondary, fontSize: 11, marginBottom: 8, lineHeight: 1.6,
              fontFamily: "'JetBrains Mono', monospace", padding: 8,
              background: colors.primaryDim, border: `1px solid ${colors.border}`,
            }}>
              {CAL_PROVIDERS.find(p => p.id === provider)?.help}
            </div>

            <input
              value={feedName}
              onChange={e => setFeedName(e.target.value)}
              placeholder="Calendar name (e.g., Work, Personal)"
              style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
            />
            <input
              value={icsUrl}
              onChange={e => setIcsUrl(e.target.value)}
              placeholder="Paste ICS feed URL here..."
              style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={addFeed} disabled={!icsUrl.trim() || syncing} style={{
                flex: 1, padding: 8,
                background: icsUrl.trim() && !syncing ? colors.primaryDim : 'transparent',
                border: `1px solid ${icsUrl.trim() && !syncing ? colors.primary : colors.border}`,
                color: icsUrl.trim() && !syncing ? colors.primary : colors.textMuted,
                fontSize: 10, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{syncing ? 'IMPORTING...' : 'ADD & SYNC'}</button>
              <button onClick={() => setShowAdd(false)} style={{
                padding: '8px 12px', background: 'transparent',
                border: `1px solid ${colors.border}`, color: colors.textMuted,
                fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
              }}>CANCEL</button>
            </div>
          </div>
        )}

        {syncResult && <div style={{
          color: syncResult.includes('Error') || syncResult.includes('failed') ? colors.danger : colors.success,
          fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace",
        }}>{syncResult}</div>}
      </div>
    </Section>
  )
}

const EMAIL_PROVIDERS = [
  { key: 'gmail', name: 'Gmail', icon: 'GM', imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587, help: 'Use an App Password from myaccount.google.com/apppasswords' },
  { key: 'outlook', name: 'Outlook / Hotmail', icon: 'OL', imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587, help: 'Use your regular Outlook/Microsoft password' },
  { key: 'protonmail', name: 'ProtonMail Bridge', icon: 'PM', imap_host: '127.0.0.1', imap_port: 1143, smtp_host: '127.0.0.1', smtp_port: 1025, help: 'Requires ProtonMail Bridge running on your computer' },
  { key: 'yahoo', name: 'Yahoo', icon: 'YH', imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, help: null },
  { key: 'custom', name: 'Custom IMAP', icon: '{}', imap_host: '', imap_port: '', smtp_host: '', smtp_port: '', help: null },
]

function EmailAccounts() {
  const [accounts, setAccounts] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [newAccount, setNewAccount] = useState({ email: '', password: '', display_name: '', imap_host: '', imap_port: '', smtp_host: '', smtp_port: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    db.email.accounts().then(setAccounts).catch(() => {})
  }, [])

  const selectProvider = (provider) => {
    setSelectedProvider(provider)
    setNewAccount(prev => ({
      ...prev,
      imap_host: provider.imap_host,
      imap_port: provider.imap_port,
      smtp_host: provider.smtp_host,
      smtp_port: provider.smtp_port,
    }))
  }

  const resetForm = () => {
    setShowAdd(false)
    setSelectedProvider(null)
    setNewAccount({ email: '', password: '', display_name: '', imap_host: '', imap_port: '', smtp_host: '', smtp_port: '' })
    setError('')
  }

  const addAccount = async () => {
    if (!newAccount.email || !newAccount.password) { setError('Email and password required'); return }
    setAdding(true)
    setError('')
    try {
      const result = await db.email.addAccount(newAccount)
      if (result.success) {
        const updated = await db.email.accounts()
        setAccounts(updated)
        resetForm()
        if (result.note) setError(result.note)
      } else {
        setError(result.error || 'Failed to add')
      }
    } catch (err) {
      setError(err.message)
    }
    setAdding(false)
  }

  const removeAccount = async (id) => {
    if (!confirm('Remove this email account?')) return
    await db.email.deleteAccount(id).catch(() => {})
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  const providerBtnStyle = (isSelected) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '12px 14px', marginBottom: 4, minHeight: 44,
    background: isSelected ? colors.primaryDim : 'transparent',
    border: `1px solid ${isSelected ? colors.primary : colors.border}`,
    color: isSelected ? colors.primary : colors.textSecondary,
    fontSize: 11, cursor: 'pointer', textAlign: 'left', borderRadius: 8,
    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
    transition: 'all 0.15s ease',
  })

  return (
    <Section title="EMAIL ACCOUNTS">
      <div style={{ padding: '10px 14px' }}>
        {accounts.length === 0 && !showAdd && (
          <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
            No email accounts connected. Add one to let JARVIS read your inbox.
          </div>
        )}
        {accounts.map(acc => (
          <div key={acc.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <div style={{
              width: 30, height: 30, border: `1px solid ${colors.primary}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            }}>@</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{acc.display_name || acc.email}</div>
              <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                {acc.imap_host} {acc.last_sync ? `// synced ${new Date(acc.last_sync).toLocaleDateString()}` : '// not synced yet'}
              </div>
            </div>
            <button onClick={() => removeAccount(acc.id)} style={{
              background: 'none', border: `1px solid ${colors.border}`,
              color: colors.textMuted, fontSize: 11, cursor: 'pointer',
              padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
            }}>X</button>
          </div>
        ))}

        {showAdd ? (
          <div style={{ marginTop: 8 }}>
            {/* Provider Selection Step */}
            {!selectedProvider ? (
              <div>
                <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: 1 }}>
                  SELECT PROVIDER:
                </div>
                {EMAIL_PROVIDERS.map(p => (
                  <button key={p.key} onClick={() => selectProvider(p)} style={providerBtnStyle(false)}>
                    <span style={{
                      width: 22, textAlign: 'center', fontSize: 11, fontWeight: 600,
                      color: colors.textMuted,
                    }}>{p.icon}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
                <button onClick={resetForm} style={{
                  width: '100%', padding: 8, marginTop: 4,
                  background: 'transparent', border: `1px solid ${colors.border}`,
                  color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>CANCEL</button>
              </div>
            ) : (
              <div>
                {/* Provider badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                  padding: '6px 10px', background: colors.primaryDim,
                  border: `1px solid ${colors.primary}40`,
                }}>
                  <span style={{ color: colors.primary, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedProvider.icon}
                  </span>
                  <span style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", flex: 1 }}>
                    {selectedProvider.name}
                  </span>
                  <button onClick={() => setSelectedProvider(null)} style={{
                    background: 'none', border: 'none', color: colors.textMuted,
                    fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                  }}>CHANGE</button>
                </div>

                {/* Provider-specific help text */}
                {selectedProvider.help && (
                  <div style={{
                    padding: '6px 10px', marginBottom: 8,
                    background: `${colors.warning}10`, border: `1px solid ${colors.warning}30`,
                    color: colors.warning, fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
                  }}>
                    {selectedProvider.help}
                  </div>
                )}

                <input value={newAccount.email} onChange={e => setNewAccount(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Email address" type="email"
                  style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
                <input value={newAccount.password} onChange={e => setNewAccount(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={selectedProvider.key === 'gmail' ? 'App password' : 'Password'}
                  type="password"
                  style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
                <input value={newAccount.display_name} onChange={e => setNewAccount(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="Display name (optional)"
                  style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />

                {/* IMAP / SMTP fields - editable for custom, pre-filled for presets */}
                <div style={{
                  color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1, marginBottom: 4, marginTop: 4,
                }}>IMAP SETTINGS</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={newAccount.imap_host} onChange={e => setNewAccount(prev => ({ ...prev, imap_host: e.target.value }))}
                    placeholder="IMAP host"
                    readOnly={selectedProvider.key !== 'custom'}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0, opacity: selectedProvider.key !== 'custom' ? 0.6 : 1 }} />
                  <input value={newAccount.imap_port} onChange={e => setNewAccount(prev => ({ ...prev, imap_port: e.target.value }))}
                    placeholder="Port"
                    readOnly={selectedProvider.key !== 'custom'}
                    style={{ ...inputStyle, width: 60, marginBottom: 0, opacity: selectedProvider.key !== 'custom' ? 0.6 : 1 }} />
                </div>

                <div style={{
                  color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1, marginBottom: 4,
                }}>SMTP SETTINGS</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input value={newAccount.smtp_host} onChange={e => setNewAccount(prev => ({ ...prev, smtp_host: e.target.value }))}
                    placeholder="SMTP host"
                    readOnly={selectedProvider.key !== 'custom'}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0, opacity: selectedProvider.key !== 'custom' ? 0.6 : 1 }} />
                  <input value={newAccount.smtp_port} onChange={e => setNewAccount(prev => ({ ...prev, smtp_port: e.target.value }))}
                    placeholder="Port"
                    readOnly={selectedProvider.key !== 'custom'}
                    style={{ ...inputStyle, width: 60, marginBottom: 0, opacity: selectedProvider.key !== 'custom' ? 0.6 : 1 }} />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addAccount} disabled={adding} style={{
                    flex: 1, padding: 8, background: colors.primaryDim, border: `1px solid ${colors.primary}`,
                    color: colors.primary, fontSize: 10, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>{adding ? 'CONNECTING...' : 'CONNECT'}</button>
                  <button onClick={resetForm} style={{
                    padding: '8px 14px', background: 'transparent', border: `1px solid ${colors.border}`,
                    color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>CANCEL</button>
                </div>
                {error && <div style={{ color: error.includes('Requires') ? colors.warning : colors.danger, fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', padding: 8, marginTop: 8,
            background: 'transparent', border: `1px solid ${colors.border}`,
            color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>+ ADD EMAIL ACCOUNT</button>
        )}
      </div>
    </Section>
  )
}

function Section({ title, children }) {
  return (
    <div style={{
      background: colors.surfaceLight,
      border: `1px solid ${colors.border}`,
      marginBottom: 10, overflow: 'hidden', borderRadius: 10,
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.primaryDim,
      }}>
        <h3 style={{
          color: colors.textMuted, fontSize: 13, fontWeight: 600,
          letterSpacing: 1,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '12px 14px',
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.text,
  fontSize: 14,
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 0,
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  borderRadius: 8,
}
const smBtn = {
  padding: '12px 16px',
  background: colors.primaryDim,
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
  fontSize: 11, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: 'nowrap', letterSpacing: 1,
  borderRadius: 8, minHeight: 44,
}
