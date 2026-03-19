import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const CARRIERS = [
  { id: 'verizon', name: 'Verizon' },
  { id: 'att', name: 'AT&T' },
  { id: 'tmobile', name: 'T-Mobile' },
  { id: 'sprint', name: 'Sprint' },
  { id: 'uscellular', name: 'US Cellular' },
  { id: 'metro', name: 'Metro' },
  { id: 'boost', name: 'Boost' },
  { id: 'cricket', name: 'Cricket' },
  { id: 'googlefi', name: 'Google Fi' },
  { id: 'mint', name: 'Mint Mobile' },
  { id: 'visible', name: 'Visible' },
]

export default function Channels({ user, addMemory }) {
  const [sentMessages, setSentMessages] = useState([])
  const [inboundMessages, setInboundMessages] = useState([])
  const [view, setView] = useState('compose')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [compose, setCompose] = useState({
    to: '',
    carrier: loadState('defaultCarrier', ''),
    message: '',
  })
  const [drafting, setDrafting] = useState(false)

  useEffect(() => {
    db.channels.getSent().then(msgs => {
      setSentMessages(msgs)
      setInboundMessages(msgs.filter(m => m.channel === 'sms_inbound'))
    }).catch(() => {
      const cached = loadState('sentMessages', [])
      setSentMessages(cached)
    })
  }, [])

  const sendSMS = async () => {
    if (!compose.to || !compose.message || !compose.carrier) return
    setSending(true)
    setSendResult(null)

    try {
      const result = await db.sms.send(compose.to, compose.message, compose.carrier)
      if (result.success) {
        setSendResult({ type: 'success', text: 'Message sent via SMS gateway' })
        addMemory(`Sent SMS to ${compose.to}: "${compose.message.slice(0, 50)}"`)
        saveState('defaultCarrier', compose.carrier)
        const msgs = await db.channels.getSent().catch(() => [])
        setSentMessages(msgs)
        setCompose(prev => ({ ...prev, message: '' }))
      } else {
        setSendResult({ type: 'error', text: result.error || 'Failed to send' })
      }
    } catch (err) {
      setSendResult({ type: 'error', text: err.message })
    }
    setSending(false)
  }

  const aiDraft = async () => {
    if (!compose.to) return
    setDrafting(true)
    try {
      const result = await db.ai.chat(
        `Draft a brief, friendly text message to ${compose.to}. Just give me the message text, nothing else.`,
        [], { userName: user.name }
      )
      setCompose(prev => ({ ...prev, message: result.response }))
    } catch {}
    setDrafting(false)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 11, fontWeight: 600, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3,
      }}>Communications</h2>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['compose', 'COMPOSE'], ['sent', `SENT (${sentMessages.filter(m => m.channel !== 'sms_inbound').length})`], ['inbox', `INBOX (${inboundMessages.length})`]].map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); setSendResult(null) }} style={{
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
            <label style={labelStyle}>RECIPIENT PHONE</label>
            <input
              value={compose.to}
              onChange={e => setCompose(prev => ({ ...prev, to: e.target.value }))}
              placeholder="(555) 123-4567"
              type="tel" inputMode="tel"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>CARRIER</label>
            <select
              value={compose.carrier}
              onChange={e => setCompose(prev => ({ ...prev, carrier: e.target.value }))}
              style={{
                ...inputStyle, width: '100%', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b8aaa' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}
            >
              <option value="">Select carrier...</option>
              {CARRIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={labelStyle}>MESSAGE ({160 - compose.message.length})</label>
              <button onClick={aiDraft} disabled={drafting} style={{
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 9, cursor: 'pointer', padding: '2px 8px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{drafting ? 'DRAFTING...' : 'AI DRAFT'}</button>
            </div>
            <textarea
              value={compose.message}
              onChange={e => setCompose(prev => ({ ...prev, message: e.target.value.slice(0, 160) }))}
              placeholder="Type your message..."
              maxLength={160}
              style={{ ...inputStyle, width: '100%', minHeight: 80, resize: 'vertical' }}
            />
          </div>

          <button onClick={sendSMS} disabled={!compose.to || !compose.message || !compose.carrier || sending} style={{
            width: '100%', padding: 12,
            background: compose.to && compose.message && compose.carrier && !sending ? colors.primaryDim : 'transparent',
            border: `1px solid ${compose.to && compose.message && compose.carrier && !sending ? colors.primary : colors.border}`,
            color: compose.to && compose.message && compose.carrier && !sending ? colors.primary : colors.textMuted,
            fontSize: 11, cursor: compose.to && compose.message && compose.carrier && !sending ? 'pointer' : 'default',
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

          <div style={{
            marginTop: 16, padding: 10,
            border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.8,
          }}>
            SMS via email-to-carrier gateway. Free. Requires carrier selection. 160 char limit.
          </div>
        </div>
      )}

      {/* Sent */}
      {view === 'sent' && (
        <div>
          {sentMessages.filter(m => m.channel !== 'sms_inbound').length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>
              No transmitted messages
            </div>
          ) : (
            sentMessages.filter(m => m.channel !== 'sms_inbound').map((msg, i) => (
              <div key={msg.id || i} style={{ padding: '10px 14px', marginBottom: 4, border: `1px solid ${colors.border}`, background: 'rgba(15, 25, 45, 0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>TO: {msg.recipient}</span>
                  <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{msg.channel?.toUpperCase()}</span>
                </div>
                <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
                <div style={{ color: colors.textMuted, fontSize: 9, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Inbox */}
      {view === 'inbox' && (
        <div>
          {inboundMessages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                No incoming transmissions
              </div>
              <div style={{
                color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.8, textAlign: 'left', padding: 12, border: `1px solid ${colors.border}`,
              }}>
                INBOUND SMS SETUP:<br/>
                1. Google Voice → Settings → Forward SMS to email<br/>
                2. Gmail → Google Apps Script → watch for GV emails<br/>
                3. Script POSTs to /api/sms webhook<br/>
                4. JARVIS AI reads and processes incoming texts
              </div>
            </div>
          ) : (
            inboundMessages.map((msg, i) => (
              <div key={msg.id || i} style={{ padding: '10px 14px', marginBottom: 4, border: `1px solid ${colors.border}`, background: 'rgba(15, 25, 45, 0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: colors.success, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>FROM: {msg.recipient}</span>
                  <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>INBOUND</span>
                </div>
                <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
              </div>
            ))
          )}
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
