import { json, error, parseBody } from './_helpers'

// Carrier email-to-SMS gateways
const CARRIERS = {
  verizon: '@vtext.com',
  att: '@txt.att.net',
  tmobile: '@tmomail.net',
  sprint: '@messaging.sprintpcs.com',
  uscellular: '@email.uscc.net',
  metro: '@mymetropcs.com',
  boost: '@sms.myboostmobile.com',
  cricket: '@sms.cricketwireless.net',
  googlefi: '@msg.fi.google.com',
  mint: '@tmomail.net', // runs on T-Mobile
  visible: '@vtext.com', // runs on Verizon
}

// POST /api/sms/send - Send SMS via email-to-SMS gateway
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { to, message, carrier } = body

  if (!to || !message) return error('to and message required')
  if (!carrier) return error('carrier required (verizon, att, tmobile, sprint, etc.)')

  const gateway = CARRIERS[carrier.toLowerCase()]
  if (!gateway) return error(`Unknown carrier: ${carrier}. Supported: ${Object.keys(CARRIERS).join(', ')}`)

  // Clean phone number to digits only
  const phone = to.replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) return error('Invalid phone number')

  const emailTo = phone + gateway

  // Use Cloudflare's email sending or MailChannels (free on CF Workers)
  // MailChannels allows sending email from Workers for free
  try {
    const emailResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: emailTo }],
        }],
        from: {
          email: env.FROM_EMAIL || 'jarvis@jarvis-app-45l.pages.dev',
          name: 'JARVIS',
        },
        subject: '', // SMS gateways ignore subject
        content: [{
          type: 'text/plain',
          value: message.slice(0, 160), // SMS limit
        }],
      }),
    })

    if (!emailResponse.ok) {
      const err = await emailResponse.text()
      console.error('Email-to-SMS failed:', err)
      // Fallback: store as pending
      await env.DB.prepare(
        'INSERT INTO sent_messages (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)'
      ).bind(data.userId, to, message, 'sms_pending').run()
      return json({ success: false, error: 'SMS gateway unavailable', stored: true })
    }

    // Store the sent message
    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel) VALUES (?, ?, ?, ?)'
    ).bind(data.userId, to, message, 'sms').run()

    return json({ success: true, sentTo: emailTo })
  } catch (err) {
    console.error('SMS send error:', err)
    return json({ success: false, error: err.message })
  }
}

// POST /api/sms/inbound - Webhook for incoming SMS (from Google Voice via Gmail/Apps Script)
// This endpoint does NOT require auth (it's called by Google Apps Script)
export async function onRequestPut({ env, request }) {
  const body = await request.json().catch(() => ({}))
  const { from, message, timestamp, webhookSecret } = body

  // Simple webhook auth
  if (env.WEBHOOK_SECRET && webhookSecret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!from || !message) return error('from and message required')

  // Find user by checking if this is a known contact
  // For now store with a default lookup
  const users = await env.DB.prepare('SELECT id FROM users LIMIT 1').first()
  const userId = users?.id || 'default'

  // Store inbound message
  await env.DB.prepare(
    'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, from, message, 'sms_inbound', timestamp || new Date().toISOString()).run()

  // Generate AI response to the inbound message
  const apiKey = env.ANTHROPIC_API_KEY
  let aiResponse = null

  if (apiKey) {
    try {
      // Get user context
      const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first()

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `You are JARVIS, a personal AI assistant. Someone sent a text message to your user ${user?.name || 'sir'}. Summarize what they want and suggest a response. Be concise — this will be displayed as a notification.`,
          messages: [{ role: 'user', content: `From ${from}: "${message}"` }],
        }),
      })

      if (response.ok) {
        const result = await response.json()
        aiResponse = result.content?.[0]?.text
      }
    } catch {}
  }

  return json({ success: true, aiResponse })
}
