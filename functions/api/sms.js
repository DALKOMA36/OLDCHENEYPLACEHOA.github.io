import { json, error, parseBody } from './_helpers'

// POST /api/sms - Send SMS via Telnyx (authenticated)
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { to, message } = body

  if (!to || !message) return error('to and message required')

  const apiKey = env.TELNYX_API_KEY
  const fromNumber = env.TELNYX_PHONE_NUMBER
  if (!apiKey || !fromNumber) {
    return json({ success: false, error: 'SMS not configured' })
  }

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

    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(data.userId, to, message, 'sms', new Date().toISOString()).run()

    return json({ success: true, messageId: result.data?.id })
  } catch (err) {
    console.error('SMS send error:', err)
    return json({ success: false, error: err.message })
  }
}
