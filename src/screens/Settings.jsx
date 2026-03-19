import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../App'
import { db } from '../db'

export default function Settings({ user, updateUser, addMemory }) {
  const [editName, setEditName] = useState(false)
  const [name, setName] = useState(user.name)
  const [showMemory, setShowMemory] = useState(false)
  const [showCircle, setShowCircle] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', phone: '', role: 'family' })
  const [briefingTime, setBriefingTime] = useState(() => loadState('briefingTime', '07:00'))
  const [briefingDays, setBriefingDays] = useState(() => loadState('briefingDays', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']))

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

  const clearAllData = () => {
    if (confirm('This will delete all your data. Are you sure?')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  const integrations = [
    { key: 'google', name: 'Google Calendar', desc: 'Sync events from Google', icon: '📅' },
    { key: 'apple', name: 'Apple Calendar', desc: 'Sync iCloud Calendar', icon: '🍎' },
    { key: 'outlook', name: 'Outlook', desc: 'Microsoft calendar & email', icon: '📧' },
    { key: 'slack', name: 'Slack', desc: 'Workspace messaging', icon: '⊶' },
    { key: 'whatsapp', name: 'WhatsApp', desc: 'Chat messaging', icon: '📱' },
    { key: 'instacart', name: 'Instacart', desc: 'Grocery delivery', icon: '🛒' },
  ]

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Settings</h2>

      {/* Profile */}
      <Section title="PROFILE">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: colors.gradient1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, fontWeight: 700,
          }}>{(user.name || 'U')[0].toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            {editName ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveName()} />
                <button onClick={saveName} style={smBtn}>Save</button>
              </div>
            ) : (
              <>
                <div style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>{user.name}</div>
                <button onClick={() => setEditName(true)} style={{ background: 'none', border: 'none', color: colors.primaryLight, fontSize: 12, cursor: 'pointer' }}>
                  Edit name
                </button>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* Circle / Family */}
      <Section title="YOUR CIRCLE">
        <div style={{ padding: '8px 14px' }}>
          <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
            Add people to delegate tasks and share calendars. They get notified via SMS.
          </p>
          {user.circle.map(member => (
            <div key={member.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: `${colors.secondary}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.secondary, fontSize: 14, fontWeight: 600,
              }}>{member.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: colors.text, fontSize: 13 }}>{member.name}</div>
                <div style={{ color: colors.textMuted, fontSize: 11 }}>{member.phone} · {member.role}</div>
              </div>
              <button onClick={() => removeCircleMember(member.id)} style={{
                background: 'none', border: 'none', color: colors.textMuted, fontSize: 14, cursor: 'pointer',
              }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })}
              placeholder="Name" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <input value={newMember.phone} onChange={e => setNewMember({ ...newMember, phone: e.target.value })}
              placeholder="Phone" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <button onClick={addCircleMember} style={smBtn}>Add</button>
          </div>
        </div>
      </Section>

      {/* Morning Briefing */}
      <Section title="MORNING BRIEFING">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ color: colors.textSecondary, fontSize: 13 }}>Time:</span>
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
                padding: '6px 10px', borderRadius: 6,
                background: briefingDays.includes(day) ? colors.primary : colors.surfaceLight,
                border: `1px solid ${briefingDays.includes(day) ? colors.primary : colors.border}`,
                color: briefingDays.includes(day) ? '#fff' : colors.textSecondary,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>{day}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* Integrations */}
      <Section title="INTEGRATIONS">
        {integrations.map(int => (
          <div key={int.key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <span style={{ fontSize: 18 }}>{int.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 13 }}>{int.name}</div>
              <div style={{ color: colors.textMuted, fontSize: 11 }}>{int.desc}</div>
            </div>
            <button onClick={() => toggleIntegration(int.key)} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: user.integrations?.[int.key] ? colors.success : colors.surfaceHover,
              position: 'relative', transition: 'background 0.2s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: user.integrations?.[int.key] ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        ))}
      </Section>

      {/* AI Memory */}
      <Section title="AI MEMORY">
        <div style={{ padding: '10px 14px' }}>
          <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
            Jarvis learns your preferences and routines over time. {user.memory.length} memories stored.
          </p>
          <button onClick={() => setShowMemory(!showMemory)} style={{
            background: 'none', border: `1px solid ${colors.border}`, borderRadius: 8,
            padding: '6px 14px', color: colors.primaryLight, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {showMemory ? 'Hide' : 'View'} Memories
          </button>
          {showMemory && (
            <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
              {user.memory.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 12 }}>No memories yet. Use the app and I'll learn!</div>
              ) : (
                user.memory.map((m, i) => (
                  <div key={i} style={{
                    padding: '6px 0', borderBottom: `1px solid ${colors.border}`,
                    fontSize: 11, color: colors.textSecondary,
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

      {/* Danger Zone */}
      <Section title="DATA">
        <div style={{ padding: '10px 14px' }}>
          <button onClick={clearAllData} style={{
            width: '100%', padding: 12, background: 'transparent',
            border: `1px solid ${colors.danger}40`, borderRadius: 8,
            color: colors.danger, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Reset All Data</button>
        </div>
      </Section>

      {/* About */}
      <div style={{ textAlign: 'center', padding: '24px 0 40px', color: colors.textMuted, fontSize: 11 }}>
        <div style={{ marginBottom: 4 }}>Jarvis v1.0</div>
        <div>Your Personal AI Life Manager</div>
        <div style={{ marginTop: 4 }}>Your AI, your way.</div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{
      background: colors.surfaceLight, border: `1px solid ${colors.border}`,
      borderRadius: 12, marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.border}` }}>
        <h3 style={{ color: colors.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '8px 10px', background: colors.surfaceHover,
  border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text,
  fontSize: 13, fontFamily: 'inherit', marginBottom: 0,
}
const smBtn = {
  padding: '8px 14px', background: colors.primary, color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}
