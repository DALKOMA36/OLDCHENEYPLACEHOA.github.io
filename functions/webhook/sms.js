// POST /webhook/sms - Telnyx inbound SMS webhook
// NO auth required — called directly by Telnyx servers

export async function onRequestPost({ env, request }) {
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const eventType = body.data?.event_type
  const payload = body.data?.payload

  // Handle message.received events
  if (eventType === 'message.received' && payload) {
    const from = payload.from?.phone_number || 'unknown'
    const text = payload.text || ''

    if (!text) return Response.json({ success: true })

    // Find user
    const user = await env.DB.prepare('SELECT id, name FROM users LIMIT 1').first()
    const userId = user?.id || 'default'

    // Store inbound message
    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, from, text, 'sms_inbound', new Date().toISOString()).run()

    // AI auto-reply
    const apiKey = env.ANTHROPIC_API_KEY
    const telnyxKey = env.TELNYX_API_KEY
    const fromNum = env.TELNYX_PHONE_NUMBER

    if (apiKey && telnyxKey && fromNum) {
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
            system: `You are JARVIS, a personal AI assistant for ${user?.name || 'sir'}. Someone texted the JARVIS phone number. Generate a helpful, concise reply (under 160 chars). Be friendly and professional, like Tony Stark's JARVIS.`,
            messages: [{ role: 'user', content: `Incoming text from ${from}: "${text}"` }],
          }),
        })

        if (aiResponse.ok) {
          const result = await aiResponse.json()
          const reply = result.content?.[0]?.text

          if (reply) {
            // Send auto-reply
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

            // Store auto-reply
            await env.DB.prepare(
              'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
            ).bind(userId, from, reply.slice(0, 160), 'sms_auto', new Date().toISOString()).run()
          }
        }
      } catch (err) {
        console.error('AI auto-reply error:', err)
      }
    }

    return Response.json({ success: true })
  }

  // Acknowledge other events
  return Response.json({ success: true })
}
