import { json, error, parseBody } from './_helpers'

// POST /api/sms - Send SMS via Telnyx
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { to, message } = body

  if (!to || !message) return error('to and message required')

  const apiKey = env.TELNYX_API_KEY
  const fromNumber = env.TELNYX_PHONE_NUMBER
  if (!apiKey || !fromNumber) {
    return json({ success: false, error: 'SMS not configured' })
  }

  // Clean phone number
  let phone = to.replace(/\D/g, '')
  if (phone.length === 10) phone = '1' + phone
  if (!phone.startsWith('+')) phone = '+' + phone

  try {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromNumber,
        to: phone,
        text: message,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Telnyx error:', JSON.stringify(result))
      return json({ success: false, error: result.errors?.[0]?.detail || 'SMS send failed' })
    }

    // Store sent message in D1
    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(data.userId, to, message, 'sms', new Date().toISOString()).run()

    return json({ success: true, messageId: result.data?.id })
  } catch (err) {
    console.error('SMS send error:', err)
    return json({ success: false, error: err.message })
  }
}

// PUT /api/sms - Inbound SMS webhook (called by Telnyx)
// This does NOT require auth - it's called by Telnyx's servers
export async function onRequestPut({ env, request }) {
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Handle Telnyx webhook
  const eventType = body.data?.event_type
  const payload = body.data?.payload

  if (eventType === 'message.received' && payload) {
    const from = payload.from?.phone_number || 'unknown'
    const text = payload.text || ''

    if (!text) return json({ success: true })

    // Find the user (for now, first user)
    const user = await env.DB.prepare('SELECT id, name FROM users LIMIT 1').first()
    const userId = user?.id || 'default'

    // Store inbound message
    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, from, text, 'sms_inbound', new Date().toISOString()).run()

    // Generate AI response
    const apiKey = env.ANTHROPIC_API_KEY
    if (apiKey) {
      try {
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: `You are JARVIS, a personal AI assistant. Someone texted your user${user?.name ? ` (${user.name})` : ''}. Generate a helpful, brief response (under 160 chars for SMS). Be friendly but concise.`,
            messages: [{ role: 'user', content: `Incoming text from ${from}: "${text}"` }],
          }),
        })

        if (aiResponse.ok) {
          const result = await aiResponse.json()
          const reply = result.content?.[0]?.text

          if (reply) {
            // Auto-reply via Telnyx
            const telnyxKey = env.TELNYX_API_KEY
            const fromNum = env.TELNYX_PHONE_NUMBER
            if (telnyxKey && fromNum) {
              await fetch('https://api.telnyx.com/v2/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${telnyxKey}`,
                },
                body: JSON.stringify({
                  from: fromNum,
                  to: from,
                  text: reply.slice(0, 160),
                }),
              })

              // Store the auto-reply
              await env.DB.prepare(
                'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
              ).bind(userId, from, reply.slice(0, 160), 'sms_auto', new Date().toISOString()).run()
            }
          }
        }
      } catch (err) {
        console.error('AI auto-reply error:', err)
      }
    }

    return json({ success: true })
  }

  // Acknowledge other webhook events
  return json({ success: true })
}
