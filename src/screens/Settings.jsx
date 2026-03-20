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
        color: colors.primary, fontSize: 12, fontWeight: 600, marginBottom: 20,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 3, textTransform: 'uppercase',
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
                  background: 'none', border: 'none', color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
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
              flex: 1, padding: '8px 0',
              background: theme === t ? colors.primaryDim : 'transparent',
              border: `1px solid ${theme === t ? colors.primary : colors.border}`,
              color: theme === t ? colors.primary : colors.textMuted,
              fontSize: 10, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>{label}</button>
          ))}
        </div>
        <div style={{
          padding: '4px 14px 10px', color: colors.textMuted, fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Auto detects system preference. Sun mode for outdoor readability.
        </div>
      </Section>

      {/* Circle / Family */}
      <Section title="TRUSTED CONTACTS">
        <div style={{ padding: '8px 14px' }}>
          <p style={{
            color: colors.textMuted, fontSize: 11, marginBottom: 12,
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
                padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace",
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
      <Section title="BRIEFING SCHEDULE">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              color: colors.textMuted, fontSize: 10,
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
                padding: '5px 10px',
                background: briefingDays.includes(day) ? colors.primaryDim : 'transparent',
                border: `1px solid ${briefingDays.includes(day) ? colors.primary : colors.border}`,
                color: briefingDays.includes(day) ? colors.primary : colors.textMuted,
                fontSize: 10, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 0.5,
                transition: 'all 0.15s ease',
              }}>{day}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* Integrations */}
      <Section title="EXTERNAL LINKS">
        {integrations.map(int => (
          <div key={int.key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <span style={{
              fontSize: 10, width: 24, textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              color: colors.textMuted, fontWeight: 600,
            }}>{int.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{int.name}</div>
              <div style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{int.desc}</div>
            </div>
            <button onClick={() => toggleIntegration(int.key)} style={{
              width: 40, height: 20, border: 'none', cursor: 'pointer',
              background: user.integrations?.[int.key]
                ? `linear-gradient(90deg, ${colors.primary}40, ${colors.primary})`
                : `rgba(255,255,255,0.05)`,
              position: 'relative', transition: 'background 0.2s',
              outline: `1px solid ${user.integrations?.[int.key] ? colors.primary : colors.border}`,
            }}>
              <span style={{
                position: 'absolute', top: 2,
                left: user.integrations?.[int.key] ? 22 : 2,
                width: 16, height: 16,
                background: user.integrations?.[int.key] ? colors.primary : colors.textMuted,
                transition: 'left 0.2s',
                boxShadow: user.integrations?.[int.key] ? `0 0 6px ${colors.primary}` : 'none',
              }} />
            </button>
          </div>
        ))}
      </Section>

      {/* AI Memory */}
      <Section title="MEMORY BANK">
        <div style={{ padding: '10px 14px' }}>
          <p style={{
            color: colors.textMuted, fontSize: 10, marginBottom: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            System learns preferences and routines. {user.memory.length} entries stored.
          </p>
          <button onClick={() => setShowMemory(!showMemory)} style={{
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            padding: '6px 14px', color: colors.textSecondary, fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1,
            transition: 'all 0.15s ease',
          }}>
            {showMemory ? 'COLLAPSE' : 'EXPAND'} LOG
          </button>
          {showMemory && (
            <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
              {user.memory.length === 0 ? (
                <div style={{
                  color: colors.textMuted, fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>No entries. System will learn from usage.</div>
              ) : (
                user.memory.map((m, i) => (
                  <div key={i} style={{
                    padding: '5px 0', borderBottom: `1px solid ${colors.border}`,
                    fontSize: 10, color: colors.textSecondary,
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
                color: colors.textMuted, fontSize: 10, cursor: 'pointer', padding: '6px 14px',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
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
              width: '100%', padding: 10,
              background: colors.primaryDim,
              border: `1px solid ${colors.primary}`,
              color: colors.primary, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            }}>ENABLE NOTIFICATIONS</button>
          )}
        </div>
      </Section>

      {/* Security */}
      <Section title="ACCESS CONTROL">
        <div style={{ padding: '10px 14px' }}>
          {!showChangePin ? (
            <button onClick={() => setShowChangePin(true)} style={{
              width: '100%', padding: 10,
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 11, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 1,
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
                  flex: 1, padding: 10,
                  background: colors.primaryDim,
                  color: colors.primary,
                  border: `1px solid ${colors.primary}`,
                  fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1,
                }}>CONFIRM</button>
                <button onClick={() => { setShowChangePin(false); setCurrentPin(''); setNewPin(''); setPinMsg('') }} style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  color: colors.textMuted,
                  border: `1px solid ${colors.border}`,
                  fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 1,
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
            width: '100%', padding: 10,
            background: 'transparent',
            border: `1px solid ${colors.danger}30`,
            color: colors.danger, fontSize: 11, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1,
            transition: 'all 0.15s ease',
          }}>PURGE ALL DATA</button>
        </div>
      </Section>

      {/* About */}
      <div style={{
        textAlign: 'center', padding: '24px 0 40px',
        color: colors.textMuted, fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 1,
      }}>
        <div style={{ marginBottom: 4 }}>J.A.R.V.I.S. v1.0</div>
        <div>Just A Rather Very Intelligent System</div>
        <div style={{
          marginTop: 8, width: 30, height: 1,
          background: colors.border, margin: '8px auto 0',
        }} />
      </div>
    </div>
  )
}

function EmailAccounts() {
  const [accounts, setAccounts] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newAccount, setNewAccount] = useState({ email: '', password: '', display_name: '', imap_host: '', imap_port: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    db.email.accounts().then(setAccounts).catch(() => {})
  }, [])

  const addAccount = async () => {
    if (!newAccount.email || !newAccount.password) { setError('Email and password required'); return }
    setAdding(true)
    setError('')
    try {
      const result = await db.email.addAccount(newAccount)
      if (result.success) {
        const updated = await db.email.accounts()
        setAccounts(updated)
        setNewAccount({ email: '', password: '', display_name: '', imap_host: '', imap_port: '' })
        setShowAdd(false)
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
              <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
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
            <input value={newAccount.email} onChange={e => setNewAccount(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Email address" type="email"
              style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
            <input value={newAccount.password} onChange={e => setNewAccount(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Password or app password" type="password"
              style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
            <input value={newAccount.display_name} onChange={e => setNewAccount(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="Display name (optional)"
              style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
            <input value={newAccount.imap_host} onChange={e => setNewAccount(prev => ({ ...prev, imap_host: e.target.value }))}
              placeholder="IMAP server (auto-detected)"
              style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={addAccount} disabled={adding} style={{
                flex: 1, padding: 8, background: colors.primaryDim, border: `1px solid ${colors.primary}`,
                color: colors.primary, fontSize: 10, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{adding ? 'CONNECTING...' : 'CONNECT'}</button>
              <button onClick={() => { setShowAdd(false); setError('') }} style={{
                padding: '8px 14px', background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}>CANCEL</button>
            </div>
            {error && <div style={{ color: error.includes('Requires') ? colors.warning : colors.danger, fontSize: 9, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>}
            <div style={{ color: colors.textMuted, fontSize: 8, marginTop: 6, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>
              IMAP auto-detected for Outlook, Gmail, Yahoo, iCloud, ProtonMail. Use app-specific passwords for accounts with 2FA.
            </div>
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
      marginBottom: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.primaryDim,
      }}>
        <h3 style={{
          color: colors.textMuted, fontSize: 9, fontWeight: 600,
          letterSpacing: 2,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '8px 10px',
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.text,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 0,
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}
const smBtn = {
  padding: '8px 14px',
  background: colors.primaryDim,
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
  fontSize: 10, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: 'nowrap', letterSpacing: 1,
}
