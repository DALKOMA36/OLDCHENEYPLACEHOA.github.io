import { useState, useEffect, useCallback, useRef } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// ── JARVIS Message Templates ── Stark-approved quick responses
const MESSAGE_TEMPLATES = [
  { id: 'late', label: 'RUNNING LATE', body: 'Running late, be there shortly.' },
  { id: 'omw', label: 'ON MY WAY', body: 'On my way now.' },
  { id: 'callme', label: 'CALL ME', body: 'Call me when you get a chance.' },
  { id: 'thanks', label: 'FOLLOW UP', body: 'Thanks, will follow up on this.' },
  { id: 'busy', label: 'IN A MEETING', body: 'In a meeting right now. Will get back to you soon.' },
  { id: 'confirm', label: 'CONFIRMED', body: 'Got it. Confirmed.' },
]

// ── Contacts helpers ──
const CONTACTS_KEY = 'jarvis_contacts'
const loadContacts = () => {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || [] } catch { return [] }
}
const persistContacts = (list) => localStorage.setItem(CONTACTS_KEY, JSON.stringify(list))

// ── Scheduled messages helpers ──
const SCHEDULE_KEY = 'jarvis_scheduled_messages'
const loadScheduled = () => {
  try { return JSON.parse(localStorage.getItem(SCHEDULE_KEY)) || [] } catch { return [] }
}
const persistScheduled = (list) => localStorage.setItem(SCHEDULE_KEY, JSON.stringify(list))

export default function Channels({ user, addMemory }) {
  const [sentMessages, setSentMessages] = useState([])
  const [inboundMessages, setInboundMessages] = useState([])
  const [view, setView] = useState('compose')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [drafting, setDrafting] = useState(false)

  // ── Contacts state ──
  const [contacts, setContacts] = useState(loadContacts)
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [editingContactId, setEditingContactId] = useState(null)
  const [contactSearch, setContactSearch] = useState('')
  const [showContactPicker, setShowContactPicker] = useState(false)

  // ── Email state ──
  const [emails, setEmails] = useState([])
  const [emailAccounts, setEmailAccounts] = useState([])
  const [emailLoading, setEmailLoading] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState(null)

  // ── Threads state ──
  const [expandedThread, setExpandedThread] = useState(null)

  // ── Schedule send state ──
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduledMessages, setScheduledMessages] = useState(loadScheduled)

  const scheduleTimerRef = useRef(null)

  // ── Load messages on mount ──
  useEffect(() => {
    db.channels.getSent().then(msgs => {
      setSentMessages(msgs.filter(m => m.channel !== 'sms_inbound'))
      setInboundMessages(msgs.filter(m => m.channel === 'sms_inbound'))
    }).catch(() => {})
  }, [])

  // ── Schedule queue processor — every 60s check for due messages ──
  const processScheduledQueue = useCallback(async () => {
    const queue = loadScheduled()
    const now = Date.now()
    const due = queue.filter(m => m.sendAt <= now)
    const remaining = queue.filter(m => m.sendAt > now)

    for (const item of due) {
      try {
        await db.sms.send(item.to, item.message)
        addMemory(`Scheduled SMS sent to ${item.to}: "${item.message.slice(0, 50)}"`)
      } catch {}
    }

    if (due.length > 0) {
      persistScheduled(remaining)
      setScheduledMessages(remaining)
      refreshMessages()
    }
  }, [addMemory])

  useEffect(() => {
    processScheduledQueue()
    scheduleTimerRef.current = setInterval(processScheduledQueue, 60000)
    return () => clearInterval(scheduleTimerRef.current)
  }, [processScheduledQueue])

  const refreshMessages = async () => {
    try {
      const msgs = await db.channels.getSent()
      setSentMessages(msgs.filter(m => m.channel !== 'sms_inbound'))
      setInboundMessages(msgs.filter(m => m.channel === 'sms_inbound'))
    } catch {}
  }

  // ── Send SMS ──
  const sendSMS = async () => {
    if (!to || !message) return
    setSending(true)
    setSendResult(null)

    try {
      const result = await db.sms.send(to, message)
      if (result.success) {
        setSendResult({ type: 'success', text: 'Transmission successful, sir.' })
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

  // ── Schedule a message for later ──
  const scheduleSMS = () => {
    if (!to || !message || !scheduleDate || !scheduleTime) return
    const sendAt = new Date(`${scheduleDate}T${scheduleTime}`).getTime()
    if (sendAt <= Date.now()) {
      setSendResult({ type: 'error', text: 'Cannot schedule in the past, sir.' })
      return
    }
    const entry = { id: Date.now().toString(), to, message, sendAt, createdAt: Date.now() }
    const updated = [...scheduledMessages, entry]
    persistScheduled(updated)
    setScheduledMessages(updated)
    setSendResult({ type: 'success', text: `Queued for ${new Date(sendAt).toLocaleString()}. JARVIS will handle it.` })
    setMessage('')
    setShowSchedule(false)
    setScheduleDate('')
    setScheduleTime('')
    addMemory(`Scheduled SMS to ${to} for ${new Date(sendAt).toLocaleString()}`)
  }

  const cancelScheduled = (id) => {
    const updated = scheduledMessages.filter(m => m.id !== id)
    persistScheduled(updated)
    setScheduledMessages(updated)
  }

  // ── AI Draft ──
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

  // ── Contacts CRUD ──
  const saveContact = () => {
    if (!contactForm.name) return
    let updated
    if (editingContactId) {
      updated = contacts.map(c => c.id === editingContactId ? { ...contactForm, id: editingContactId } : c)
    } else {
      updated = [...contacts, { ...contactForm, id: Date.now().toString() }]
    }
    persistContacts(updated)
    setContacts(updated)
    setContactForm({ name: '', phone: '', email: '', notes: '' })
    setEditingContactId(null)
  }

  const deleteContact = (id) => {
    const updated = contacts.filter(c => c.id !== id)
    persistContacts(updated)
    setContacts(updated)
  }

  const editContact = (contact) => {
    setEditingContactId(contact.id)
    setContactForm({ name: contact.name, phone: contact.phone, email: contact.email, notes: contact.notes })
  }

  const selectContact = (contact) => {
    setTo(contact.phone || '')
    setShowContactPicker(false)
    setView('compose')
  }

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(contactSearch)) ||
    (c.email && c.email.toLowerCase().includes(contactSearch.toLowerCase()))
  )

  // ── Email fetch ──
  const fetchEmails = async () => {
    setEmailLoading(true)
    try {
      const [accts, msgs] = await Promise.all([
        db.email.accounts(),
        db.email.emails()
      ])
      setEmailAccounts(accts || [])
      setEmails(msgs || [])
    } catch {}
    setEmailLoading(false)
  }

  const markEmailRead = async (emailId) => {
    try {
      await db.email.markRead(emailId)
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, read: true } : e))
    } catch {}
  }

  // ── Conversation threading ──
  const getThreads = () => {
    const allMsgs = [...sentMessages, ...inboundMessages]
    const threadMap = {}
    allMsgs.forEach(msg => {
      const key = msg.recipient || 'unknown'
      if (!threadMap[key]) threadMap[key] = []
      threadMap[key].push(msg)
    })
    // Sort threads by most recent message
    return Object.entries(threadMap)
      .map(([phone, msgs]) => ({
        phone,
        messages: msgs.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0)),
        lastMessage: msgs.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0))[0],
        contactName: contacts.find(c => c.phone === phone)?.name || null,
      }))
      .sort((a, b) => new Date(b.lastMessage?.sent_at || 0) - new Date(a.lastMessage?.sent_at || 0))
  }

  // ── Tab config ──
  const tabs = [
    ['compose', 'COMPOSE'],
    ['threads', 'THREADS'],
    ['sent', `SENT (${sentMessages.length})`],
    ['inbox', `INBOX (${inboundMessages.length})`],
    ['email', 'EMAIL'],
    ['contacts', `CONTACTS (${contacts.length})`],
  ]

  if (scheduledMessages.length > 0) {
    tabs.push(['scheduled', `QUEUE (${scheduledMessages.length})`])
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 13, fontWeight: 600, marginBottom: 2,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
      }}>JARVIS COMMS ARRAY</h2>
      <p style={{
        color: colors.textMuted, fontSize: 12, marginBottom: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Secure multi-channel communications // +1 (402) 585-0056</p>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        border: `1px solid ${colors.border}`, overflow: 'hidden',
        flexWrap: 'wrap',
      }}>
        {tabs.map(([v, label]) => (
          <button key={v} onClick={() => {
            setView(v); setSendResult(null)
            if (v === 'inbox') refreshMessages()
            if (v === 'email') fetchEmails()
            if (v === 'threads') refreshMessages()
          }} style={{
            flex: '1 1 auto', padding: '10px 6px', minHeight: 44,
            background: view === v ? colors.primaryDim : 'transparent',
            color: view === v ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: view === v ? `2px solid ${colors.primary}` : '2px solid transparent',
            fontSize: 11, cursor: 'pointer', minWidth: 60, borderRadius: 0,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
            transition: 'all 0.15s ease',
          }}>{label}</button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          COMPOSE VIEW
         ════════════════════════════════════════════════ */}
      {view === 'compose' && (
        <div>
          {/* Recipient field with contact picker */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={labelStyle}>RECIPIENT</label>
              <button onClick={() => setShowContactPicker(!showContactPicker)} style={{
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.secondary, fontSize: 11, cursor: 'pointer', padding: '8px 12px', minHeight: 36, borderRadius: 8,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{showContactPicker ? 'CLOSE' : 'CONTACTS'}</button>
            </div>

            {/* Contact picker dropdown */}
            {showContactPicker && (
              <div style={{
                marginBottom: 8, border: `1px solid ${colors.border}`,
                background: colors.surface, maxHeight: 160, overflowY: 'auto',
              }}>
                {contacts.length === 0 ? (
                  <div style={{ padding: 10, color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                    No contacts in directory. Add some in the CONTACTS tab.
                  </div>
                ) : contacts.filter(c => c.phone).map(c => (
                  <div key={c.id} onClick={() => selectContact(c)} style={{
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: `1px solid ${colors.border}`,
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{c.name}</div>
                    <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{c.phone}</div>
                  </div>
                ))}
              </div>
            )}

            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="Phone number or select from contacts"
              type="tel" inputMode="tel"
              style={inputStyle}
            />
          </div>

          {/* Message body */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={labelStyle}>MESSAGE</label>
              <button onClick={aiDraft} disabled={drafting} style={{
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 11, cursor: 'pointer', padding: '8px 12px', minHeight: 36, borderRadius: 8,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{drafting ? 'JARVIS DRAFTING...' : 'AI DRAFT'}</button>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message..."
              style={{ ...inputStyle, width: '100%', minHeight: 80, resize: 'vertical' }}
            />
          </div>

          {/* ── Quick Templates ── */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, marginBottom: 6 }}>QUICK TEMPLATES</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {MESSAGE_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setMessage(t.body)} style={{
                  padding: '8px 12px', minHeight: 44, borderRadius: 8,
                  background: message === t.body ? colors.primaryDim : 'transparent',
                  border: `1px solid ${message === t.body ? colors.primary : colors.border}`,
                  color: message === t.body ? colors.primary : colors.textMuted,
                  fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  transition: 'all 0.15s ease',
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Send + Schedule buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={sendSMS} disabled={!to || !message || sending} style={{
              flex: 1, padding: '12px 16px', minHeight: 44, borderRadius: 8,
              background: to && message && !sending ? colors.primaryDim : 'transparent',
              border: `1px solid ${to && message && !sending ? colors.primary : colors.border}`,
              color: to && message && !sending ? colors.primary : colors.textMuted,
              fontSize: 12, cursor: to && message && !sending ? 'pointer' : 'default',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              transition: 'all 0.15s ease',
            }}>{sending ? 'TRANSMITTING...' : 'SEND NOW'}</button>

            <button onClick={() => setShowSchedule(!showSchedule)} disabled={!to || !message} style={{
              padding: '12px 16px', minHeight: 44, borderRadius: 8,
              background: showSchedule ? colors.secondaryDim : 'transparent',
              border: `1px solid ${to && message ? colors.secondary : colors.border}`,
              color: to && message ? colors.secondary : colors.textMuted,
              fontSize: 11, cursor: to && message ? 'pointer' : 'default',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              transition: 'all 0.15s ease',
            }}>SCHEDULE</button>
          </div>

          {/* ── Schedule send panel ── */}
          {showSchedule && (
            <div style={{
              padding: 12, marginBottom: 8,
              border: `1px solid ${colors.secondary}`,
              background: colors.surfaceLight,
            }}>
              <label style={{ ...labelStyle, color: colors.secondary }}>SCHEDULE TRANSMISSION</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              <button onClick={scheduleSMS} disabled={!scheduleDate || !scheduleTime} style={{
                width: '100%', padding: '12px 16px', minHeight: 44, borderRadius: 8,
                background: scheduleDate && scheduleTime ? colors.secondaryDim : 'transparent',
                border: `1px solid ${scheduleDate && scheduleTime ? colors.secondary : colors.border}`,
                color: scheduleDate && scheduleTime ? colors.secondary : colors.textMuted,
                fontSize: 12, cursor: scheduleDate && scheduleTime ? 'pointer' : 'default',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>CONFIRM SCHEDULED SEND</button>
            </div>
          )}

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

      {/* ════════════════════════════════════════════════
          THREADS VIEW — Conversations grouped by recipient
         ════════════════════════════════════════════════ */}
      {view === 'threads' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              CONVERSATION THREADS // GROUPED BY RECIPIENT
            </span>
            <button onClick={refreshMessages} style={refreshBtnStyle}>REFRESH</button>
          </div>

          {getThreads().length === 0 ? (
            <EmptyState text="No conversation threads yet" />
          ) : getThreads().map(thread => (
            <div key={thread.phone} style={{
              marginBottom: 10, border: `1px solid ${colors.border}`, borderRadius: 10,
              background: expandedThread === thread.phone ? colors.surfaceLight : 'transparent',
              transition: 'all 0.15s ease',
            }}>
              {/* Thread header */}
              <div
                onClick={() => setExpandedThread(expandedThread === thread.phone ? null : thread.phone)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ color: colors.primary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {thread.contactName || thread.phone}
                  </div>
                  {thread.contactName && (
                    <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{thread.phone}</div>
                  )}
                  <div style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "'Exo 2', sans-serif", marginTop: 2 }}>
                    {thread.lastMessage?.message?.slice(0, 60)}{(thread.lastMessage?.message?.length || 0) > 60 ? '...' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                    {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                    {thread.lastMessage?.sent_at ? new Date(thread.lastMessage.sent_at).toLocaleDateString() : ''}
                  </div>
                  <span style={{ color: colors.primary, fontSize: 10 }}>{expandedThread === thread.phone ? '\u25B2' : '\u25BC'}</span>
                </div>
              </div>

              {/* Expanded thread messages */}
              {expandedThread === thread.phone && (
                <div style={{ borderTop: `1px solid ${colors.border}`, padding: '8px 14px' }}>
                  {thread.messages.map((msg, i) => {
                    const isInbound = msg.channel === 'sms_inbound'
                    return (
                      <div key={msg.id || i} style={{
                        padding: '6px 10px', marginBottom: 4,
                        borderLeft: `2px solid ${isInbound ? colors.success : colors.primary}`,
                        background: colors.surface,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{
                            color: isInbound ? colors.success : colors.primary,
                            fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
                          }}>{isInbound ? 'INBOUND' : 'OUTBOUND'}</span>
                          <span style={{ color: colors.textMuted, fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                            {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
                      </div>
                    )
                  })}
                  <button onClick={() => { setTo(thread.phone); setView('compose') }} style={{
                    marginTop: 6, padding: '12px 16px', width: '100%', minHeight: 44, borderRadius: 8,
                    background: colors.primaryDim, border: `1px solid ${colors.primary}`,
                    color: colors.primary, fontSize: 12, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>REPLY TO {thread.contactName || thread.phone}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SENT VIEW
         ════════════════════════════════════════════════ */}
      {view === 'sent' && (
        <div>
          {sentMessages.length === 0 ? (
            <EmptyState text="No transmitted messages" />
          ) : sentMessages.map((msg, i) => (
            <div key={msg.id || i} style={{ padding: '14px 16px', marginBottom: 10, border: `1px solid ${colors.border}`, background: colors.surfaceLight, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: colors.primary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  TO: {contacts.find(c => c.phone === msg.recipient)?.name || msg.recipient}
                </span>
                <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                  {msg.channel === 'sms_auto' ? 'AUTO-REPLY' : 'SMS'}
                </span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
              <div style={{ color: colors.textMuted, fontSize: 9, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          INBOX VIEW
         ════════════════════════════════════════════════ */}
      {view === 'inbox' && (
        <div>
          <button onClick={refreshMessages} style={{ ...refreshBtnStyle, marginBottom: 12 }}>REFRESH</button>

          {inboundMessages.length === 0 ? (
            <EmptyState text="No incoming transmissions" />
          ) : inboundMessages.map((msg, i) => (
            <div key={msg.id || i} style={{ padding: '14px 16px', marginBottom: 10, border: `1px solid ${colors.border}`, background: colors.surfaceLight, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: colors.success, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  FROM: {contacts.find(c => c.phone === msg.recipient)?.name || msg.recipient}
                </span>
                <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>INBOUND</span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>{msg.message}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                  {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ''}
                </span>
                <button onClick={() => { setTo(msg.recipient); setView('compose') }} style={{
                  background: 'transparent', border: `1px solid ${colors.border}`,
                  color: colors.primary, fontSize: 11, cursor: 'pointer', padding: '8px 12px', minHeight: 36, borderRadius: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>REPLY</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          EMAIL VIEW
         ════════════════════════════════════════════════ */}
      {view === 'email' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              EMAIL INTERCEPT // {emailAccounts.length} ACCOUNT{emailAccounts.length !== 1 ? 'S' : ''} LINKED
            </span>
            <button onClick={fetchEmails} style={refreshBtnStyle}>
              {emailLoading ? 'SCANNING...' : 'REFRESH'}
            </button>
          </div>

          {/* Account badges */}
          {emailAccounts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
              {emailAccounts.map((acct, i) => (
                <span key={acct.id || i} style={{
                  padding: '6px 10px', fontSize: 11, borderRadius: 8,
                  border: `1px solid ${colors.success}`,
                  color: colors.success,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{acct.display_name || acct.email}</span>
              ))}
            </div>
          )}

          {emailLoading ? (
            <div style={{ color: colors.primary, fontSize: 11, textAlign: 'center', padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>
              Scanning email servers...
            </div>
          ) : emails.length === 0 ? (
            <EmptyState text="No emails intercepted. Link an account in Settings." />
          ) : (
            <div>
              {/* Selected email detail */}
              {selectedEmail && (
                <div style={{
                  marginBottom: 12, padding: 14,
                  border: `1px solid ${colors.primary}`,
                  background: colors.surfaceLight,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: colors.primary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      {selectedEmail.subject || '(No Subject)'}
                    </span>
                    <button onClick={() => setSelectedEmail(null)} style={{
                      background: 'transparent', border: 'none',
                      color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>CLOSE</button>
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
                    FROM: {selectedEmail.from || selectedEmail.sender || 'Unknown'}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                    {selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : ''}
                  </div>
                  <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif", lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {selectedEmail.body || selectedEmail.preview || selectedEmail.snippet || 'No content available.'}
                  </div>

                </div>
              )}

              {/* Email list */}
              {emails.map((email, i) => (
                <div key={email.id || i}
                  onClick={() => { setSelectedEmail(email); if (!email.read) markEmailRead(email.id) }}
                  style={{
                    padding: '10px 14px', marginBottom: 3, cursor: 'pointer',
                    border: `1px solid ${email.read ? colors.border : colors.primary}`,
                    background: email.read ? 'transparent' : colors.surfaceLight,
                    borderLeft: email.read ? `1px solid ${colors.border}` : `3px solid ${colors.primary}`,
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = email.read ? 'transparent' : colors.surfaceLight}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{
                      color: email.read ? colors.textMuted : colors.primary,
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: email.read ? 400 : 600,
                    }}>{email.from || email.sender || 'Unknown'}</span>
                    <span style={{ color: colors.textMuted, fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                      {email.date ? new Date(email.date).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div style={{
                    color: email.read ? colors.textSecondary : colors.text,
                    fontSize: 11, fontFamily: "'Exo 2', sans-serif",
                    fontWeight: email.read ? 400 : 600, marginBottom: 2,
                  }}>{email.subject || '(No Subject)'}</div>
                  <div style={{
                    color: colors.textMuted, fontSize: 10,
                    fontFamily: "'Exo 2', sans-serif",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{email.preview || email.snippet || ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          CONTACTS VIEW
         ════════════════════════════════════════════════ */}
      {view === 'contacts' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, color: colors.secondary }}>
              {editingContactId ? 'EDIT CONTACT' : 'NEW CONTACT'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Name *" style={inputStyle}
              />
              <input
                value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="Phone" type="tel" inputMode="tel" style={inputStyle}
              />
              <input
                value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="Email" type="email" style={inputStyle}
              />
              <input
                value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })}
                placeholder="Notes" style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveContact} disabled={!contactForm.name} style={{
                  flex: 1, padding: '12px 16px', minHeight: 44, borderRadius: 8,
                  background: contactForm.name ? colors.primaryDim : 'transparent',
                  border: `1px solid ${contactForm.name ? colors.primary : colors.border}`,
                  color: contactForm.name ? colors.primary : colors.textMuted,
                  fontSize: 12, cursor: contactForm.name ? 'pointer' : 'default',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                }}>{editingContactId ? 'UPDATE' : 'SAVE CONTACT'}</button>
                {editingContactId && (
                  <button onClick={() => { setEditingContactId(null); setContactForm({ name: '', phone: '', email: '', notes: '' }) }} style={{
                    padding: '10px 16px',
                    background: 'transparent', border: `1px solid ${colors.border}`,
                    color: colors.textMuted, fontSize: 10, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>CANCEL</button>
                )}
              </div>
            </div>
          </div>

          {/* Search contacts */}
          <div style={{ marginBottom: 12 }}>
            <input
              value={contactSearch} onChange={e => setContactSearch(e.target.value)}
              placeholder="Search contacts..."
              style={{ ...inputStyle, borderColor: contactSearch ? colors.primary : colors.border }}
            />
          </div>

          {/* Contact list */}
          {filteredContacts.length === 0 ? (
            <EmptyState text={contacts.length === 0 ? "Contact directory empty" : "No matches found"} />
          ) : filteredContacts.map(c => (
            <div key={c.id} style={{
              padding: '14px 16px', marginBottom: 10, borderRadius: 10,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceLight,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: colors.primary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{c.name}</div>
                  {c.phone && <div style={{ color: colors.textSecondary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{c.phone}</div>}
                  {c.email && <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{c.email}</div>}
                  {c.notes && <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic', marginTop: 2 }}>{c.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {c.phone && (
                    <button onClick={() => selectContact(c)} style={smallBtnStyle}>MSG</button>
                  )}
                  <button onClick={() => editContact(c)} style={smallBtnStyle}>EDIT</button>
                  <button onClick={() => deleteContact(c.id)} style={{ ...smallBtnStyle, borderColor: colors.danger, color: colors.danger }}>DEL</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SCHEDULED QUEUE VIEW
         ════════════════════════════════════════════════ */}
      {view === 'scheduled' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: colors.secondary, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              SCHEDULED TRANSMISSION QUEUE // CHECKED EVERY 60s
            </span>
          </div>

          {scheduledMessages.length === 0 ? (
            <EmptyState text="No scheduled transmissions" />
          ) : scheduledMessages
            .sort((a, b) => a.sendAt - b.sendAt)
            .map(item => (
              <div key={item.id} style={{
                padding: '10px 14px', marginBottom: 4,
                border: `1px solid ${colors.secondary}`,
                background: colors.surfaceLight,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: colors.secondary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                    TO: {contacts.find(c => c.phone === item.to)?.name || item.to}
                  </span>
                  <button onClick={() => cancelScheduled(item.id)} style={{
                    background: 'transparent', border: `1px solid ${colors.danger}`, borderRadius: 8,
                    color: colors.danger, fontSize: 11, cursor: 'pointer', padding: '8px 12px', minHeight: 36,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>CANCEL</button>
                </div>
                <div style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{item.message}</div>
                <div style={{ color: colors.secondary, fontSize: 9, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  FIRES AT: {new Date(item.sendAt).toLocaleString()}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ── Reusable empty state component ──
function EmptyState({ text }) {
  return (
    <div style={{
      color: colors.textMuted, fontSize: 11, textAlign: 'center', padding: 40,
      fontFamily: "'JetBrains Mono', monospace", border: `1px dashed ${colors.border}`,
    }}>{text}</div>
  )
}

// ── Style constants ──
const labelStyle = {
  color: colors.textMuted, fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: 1, display: 'block', marginBottom: 6,
}

const inputStyle = {
  width: '100%', padding: '12px 14px', minHeight: 44,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.text, fontSize: 14, borderRadius: 8,
  fontFamily: "'Exo 2', sans-serif",
  boxSizing: 'border-box',
}

const refreshBtnStyle = {
  padding: '12px 16px', minHeight: 44, borderRadius: 8,
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textMuted, fontSize: 11, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const smallBtnStyle = {
  padding: '8px 12px', minHeight: 36, borderRadius: 8,
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textMuted, fontSize: 11, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
}
