import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const CHANNELS = [
  { id: 'sms', name: 'SMS', icon: '💬', color: colors.success, desc: 'Send & receive texts' },
  { id: 'email', name: 'Email', icon: '📧', color: colors.primary, desc: 'Gmail, Outlook integration' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', color: '#25D366', desc: 'WhatsApp messaging' },
  { id: 'slack', name: 'Slack', icon: '⊶', color: '#E01E5A', desc: 'Workspace messaging' },
  { id: 'phone', name: 'Phone', icon: '📞', color: colors.warning, desc: 'Make & receive calls' },
]

const DEMO_MESSAGES = {
  sms: [
    { from: 'Mom', text: "Don't forget dinner tonight at 7!", time: '2:15 PM', unread: true },
    { from: 'John', text: 'Can you pick up the kids from practice?', time: '1:30 PM', unread: true },
    { from: 'Dentist Office', text: 'Reminder: Your appointment is tomorrow at 10am.', time: '11:00 AM', unread: false },
  ],
  email: [
    { from: 'sarah@work.com', subject: 'Q2 Planning', text: 'Hey, can we move the meeting to Thursday?', time: '3:00 PM', unread: true },
    { from: 'school@district.edu', subject: 'Spring Break Schedule', text: 'Please see the attached schedule for spring break activities...', time: '12:30 PM', unread: true },
    { from: 'noreply@bank.com', subject: 'Statement Ready', text: 'Your monthly statement is now available.', time: '9:00 AM', unread: false },
  ],
  whatsapp: [
    { from: 'Family Group', text: "Who's coming to Sunday brunch?", time: '4:00 PM', unread: true },
    { from: 'Coach Mike', text: 'Practice moved to Field B tomorrow', time: '2:45 PM', unread: false },
  ],
  slack: [
    { from: '#general', text: 'Team lunch is at the new Italian place!', time: '12:00 PM', unread: true },
    { from: '@boss', text: 'Great work on the presentation!', time: '10:15 AM', unread: false },
  ],
  phone: [
    { from: 'Unknown (555-0123)', text: 'Missed call', time: '1:45 PM', unread: true },
    { from: 'Dr. Smith Office', text: 'Voicemail: Calling about your test results', time: '11:30 AM', unread: true },
  ],
}

export default function Channels({ user, addMemory }) {
  const [activeChannel, setActiveChannel] = useState(null)
  const [compose, setCompose] = useState(false)
  const [composeData, setComposeData] = useState({ to: '', message: '', channel: 'sms' })
  const [drafts, setDrafts] = useState([])
  const [sentMessages, setSentMessages] = useState([])

  useEffect(() => {
    db.channels.getSent().then(setSentMessages).catch(() => setSentMessages(loadState('sentMessages', [])))
    db.channels.getDrafts().then(setDrafts).catch(() => setDrafts(loadState('drafts', [])))
  }, [])

  const totalUnread = Object.values(DEMO_MESSAGES).reduce((sum, msgs) => sum + msgs.filter(m => m.unread).length, 0)

  const sendMessage = async () => {
    if (!composeData.to.trim() || !composeData.message.trim()) return
    const msg = { ...composeData, id: Date.now(), sentAt: new Date().toISOString() }
    const updated = [msg, ...sentMessages]
    setSentMessages(updated)
    try {
      await db.channels.send(msg)
    } catch {
      saveState('sentMessages', updated)
    }
    addMemory(`Sent ${composeData.channel} to ${composeData.to}: ${composeData.message.slice(0, 50)}`)
    setComposeData({ to: '', message: '', channel: 'sms' })
    setCompose(false)
  }

  const generateDraft = () => {
    const drafts_options = [
      { to: 'Mom', message: "Hi Mom! Just confirming dinner tonight at 7. Should I bring anything?" },
      { to: 'John', message: "Hey John, I can pick up the kids at 4:30. Does that work?" },
      { to: 'sarah@work.com', message: "Hi Sarah, Thursday works perfectly for the Q2 planning meeting. I'll update the calendar invite." },
    ]
    const draft = drafts_options[Math.floor(Math.random() * drafts_options.length)]
    setComposeData({ ...composeData, ...draft })
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Channels</h2>
          <p style={{ color: colors.textSecondary, fontSize: 12 }}>{totalUnread} unread across all channels</p>
        </div>
        <button onClick={() => setCompose(true)} style={{
          padding: '8px 16px', background: colors.gradient1, color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Compose</button>
      </div>

      {/* Proxy Actions Banner */}
      <div style={{
        padding: 14, background: `${colors.accent}10`, border: `1px solid ${colors.accent}25`,
        borderRadius: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 18, color: colors.accent }}>◉</span>
        <div>
          <div style={{ color: colors.accent, fontSize: 11, fontWeight: 600 }}>PROXY ACTIONS</div>
          <div style={{ color: colors.textSecondary, fontSize: 12 }}>Jarvis can send texts, emails, and make calls on your behalf. You approve before anything is sent.</div>
        </div>
      </div>

      {!activeChannel ? (
        /* Channel List */
        <div>
          {CHANNELS.map(ch => {
            const msgs = DEMO_MESSAGES[ch.id] || []
            const unread = msgs.filter(m => m.unread).length
            return (
              <button key={ch.id} onClick={() => setActiveChannel(ch.id)} style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 16,
                background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: `${ch.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                }}>{ch.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: 15, fontWeight: 500 }}>{ch.name}</div>
                  <div style={{ color: colors.textSecondary, fontSize: 12 }}>{ch.desc}</div>
                </div>
                {unread > 0 && (
                  <span style={{
                    minWidth: 22, height: 22, borderRadius: 11, background: colors.accent,
                    color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                  }}>{unread}</span>
                )}
              </button>
            )
          })}

          {/* Recent Sent */}
          {sentMessages.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>RECENTLY SENT</h3>
              {sentMessages.slice(0, 3).map(m => (
                <div key={m.id} style={{
                  padding: 12, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 8, marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: colors.primaryLight, fontSize: 12 }}>To: {m.to}</span>
                    <span style={{ color: colors.textMuted, fontSize: 10 }}>{m.channel}</span>
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: 12 }}>{m.message.slice(0, 60)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Channel Messages */
        <div>
          <button onClick={() => setActiveChannel(null)} style={{
            background: 'none', border: 'none', color: colors.primaryLight, fontSize: 13,
            cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
          }}>‹ Back to Channels</button>

          <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            {CHANNELS.find(c => c.id === activeChannel)?.name} Messages
          </h3>

          {(DEMO_MESSAGES[activeChannel] || []).map((msg, i) => (
            <div key={i} style={{
              padding: 14, background: msg.unread ? `${colors.primary}08` : colors.surfaceLight,
              border: `1px solid ${msg.unread ? colors.primary + '30' : colors.border}`,
              borderRadius: 10, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: colors.text, fontSize: 14, fontWeight: msg.unread ? 600 : 400 }}>{msg.from}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {msg.unread && <span style={{ width: 6, height: 6, borderRadius: 3, background: colors.accent }} />}
                  <span style={{ color: colors.textMuted, fontSize: 11 }}>{msg.time}</span>
                </div>
              </div>
              {msg.subject && <div style={{ color: colors.primaryLight, fontSize: 12, marginBottom: 2 }}>{msg.subject}</div>}
              <div style={{ color: colors.textSecondary, fontSize: 13 }}>{msg.text}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => { setCompose(true); setComposeData({ ...composeData, to: msg.from, channel: activeChannel }) }} style={replyBtn}>Reply</button>
                <button style={{ ...replyBtn, background: `${colors.secondary}15`, color: colors.secondary, borderColor: colors.secondary + '30' }}>AI Draft</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compose Modal */}
      {compose && (
        <div style={modalOverlay} onClick={() => setCompose(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600 }}>New Message</h3>
              <button onClick={generateDraft} style={{
                padding: '6px 12px', background: `${colors.primary}15`, border: `1px solid ${colors.primary}30`,
                borderRadius: 8, color: colors.primaryLight, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>◉ AI Draft</button>
            </div>
            <select value={composeData.channel} onChange={e => setComposeData({ ...composeData, channel: e.target.value })} style={inputStyle}>
              {CHANNELS.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
            <input
              value={composeData.to}
              onChange={e => setComposeData({ ...composeData, to: e.target.value })}
              placeholder="To (name, phone, or email)"
              style={inputStyle}
            />
            <textarea
              value={composeData.message}
              onChange={e => setComposeData({ ...composeData, message: e.target.value })}
              placeholder="Your message..."
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCompose(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={sendMessage} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Send via {CHANNELS.find(c => c.id === composeData.channel)?.name}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const replyBtn = {
  padding: '4px 12px', background: `${colors.primary}15`, border: `1px solid ${colors.primary}30`,
  borderRadius: 6, color: colors.primaryLight, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
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
