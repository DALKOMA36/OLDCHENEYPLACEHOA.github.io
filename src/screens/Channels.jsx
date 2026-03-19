import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

export default function Channels({ user, addMemory }) {
  const [sentMessages, setSentMessages] = useState([])
  const [inboundMessages, setInboundMessages] = useState([])
  const [view, setView] = useState('compose')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [drafting, setDrafting] = useState(false)

  useEffect(() => {
    db.channels.getSent().then(msgs => {
      setSentMessages(msgs.filter(m => m.channel !== 'sms_inbound'))
      setInboundMessages(msgs.filter(m => m.channel === 'sms_inbound'))
    }).catch(() => {})
  }, [])

  const refreshMessages = async () => {
    try {
      const msgs = await db.channels.getSent()
      setSentMessages(msgs.filter(m => m.channel !== 'sms_inbound'))
      setInboundMessages(msgs.filter(m => m.channel === 'sms_inbound'))
    } catch {}
  }

  const sendSMS = async () => {
    if (!to || !message) return
    setSending(true)
    setSendResult(null)

    try {
      const result = await db.sms.send(to, message)
      if (result.success) {
        setSendResult({ type: 'success', text: 'Message transmitted' })
        addMemory(`Sent SMS to ${to}: "${message.slice(0, 50)}"`)
        setMessage('')
        refreshMessages()
      } else {
        setSendResult({ type: 'error', text: result.error || 'Transmission failed' })
      }
    } catch (err) {
      setSendResult({ type: 'error', text: err.message })
    }
    setSending(false)
  }

  const aiDraft = async () => {
    setDrafting(true)
    try {
      const result = await db.ai.chat(
        `Draft a brief, friendly text message${to ? ` to ${to}` : ''}. Just the message text, nothing else. Keep it under 160 characters.`,
        [], { userName: user.name }
      )
      setMessage(result.response?.slice(0, 160) || '')
    } catch {}
    setDrafting(false)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 11, fontWeight: 600, marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
      }}>Communications</h2>
      <p style={{
        color: colors.textMuted, fontSize: 10, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Real SMS via JARVIS number +1 (402) 585-0056</p>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['compose', 'COMPOSE'], ['sent', `SENT (${sentMessages.length})`], ['inbox', `INBOX (${inboundMessages.length})`]].map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); setSendResult(null); if (v === 'inbox') refreshMessages() }} style={{
            flex: 1, padding: '8px 0',
            background: view === v ? colors.primaryDim : 'transparent',
            color: view === v ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: view === v ? `1px solid ${colors.primary}` : '1px solid transparent',
            fontSize: 10, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Compose */}
      {view === 'compose' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>RECIPIENT</label>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="Phone number"
              type="tel" inputMode="tel"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={labelStyle}>MESSAGE</label>
              <button onClick={aiDraft} disabled={drafting} style={{
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 9, cursor: 'pointer', padding: '2px 8px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{drafting ? 'DRAFTING...' : 'AI DRAFT'}</button>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message..."
              style={{ ...inputStyle, width: '100%', minHeight: 80, resize: 'vertical' }}
            />
          </div>

          <button onClick={sendSMS} disabled={!to || !message || sending} style={{
            width: '100%', padding: 12,
            background: to && message && !sending ? colors.primaryDim : 'transparent',
            border: `1px solid ${to && message && !sending ? colors.primary : colors.border}`,
            color: to && message && !sending ? colors.primary : colors.textMuted,
            fontSize: 11, cursor: to && message && !sending ? 'pointer' : 'default',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>{sending ? 'TRANSMITTING...' : 'SEND SMS'}</button>

          {sendResult && (
            <div style={{
              marginTop: 8, padding: 10,
              border: `1px solid ${sendResult.type === 'success' ? colors.success : colors.danger}`,
              color: sendResult.type === 'success' ? colors.success : colors.danger,
              fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            }}>{sendResult.text}</div>
          )}
        </div>
      )}

      {/* Sent */}
      {view === 'sent' && (
        <div>
          {sentMessages.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>
              No transmitted messages
            </div>
          ) : sentMessages.map((msg, i) => (
            <div key={msg.id || i} style={{ padding: '10px 14px', marginBottom: 4, border: `1px solid ${colors.border}`, background: 'rgba(15, 25, 45, 0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>TO: {msg.recipient}</span>
                <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                  {msg.channel === 'sms_auto' ? 'AUTO-REPLY' : 'SMS'}
                </span>
              </div>
              <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
              <div style={{ color: colors.textMuted, fontSize: 9, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inbox */}
      {view === 'inbox' && (
        <div>
          <button onClick={refreshMessages} style={{
            marginBottom: 12, padding: '6px 14px',
            background: 'transparent', border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 9, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>REFRESH</button>

          {inboundMessages.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>
              No incoming transmissions
            </div>
          ) : inboundMessages.map((msg, i) => (
            <div key={msg.id || i} style={{ padding: '10px 14px', marginBottom: 4, border: `1px solid ${colors.border}`, background: 'rgba(15, 25, 45, 0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: colors.success, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>FROM: {msg.recipient}</span>
                <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>INBOUND</span>
              </div>
              <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
              <div style={{ color: colors.textMuted, fontSize: 9, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  color: colors.textMuted, fontSize: 9,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: 1, display: 'block', marginBottom: 4,
}

const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(10, 18, 32, 0.8)',
  border: `1px solid ${colors.border}`,
  color: colors.text, fontSize: 13,
  fontFamily: "'Exo 2', sans-serif",
}
