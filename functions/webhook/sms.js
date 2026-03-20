// POST /webhook/sms - Telnyx inbound SMS webhook
// NO auth required — called directly by Telnyx servers

async function log(env, source, message, data) {
  try {
    await env.DB.prepare('INSERT INTO debug_log (source, message, data) VALUES (?, ?, ?)')
      .bind(source, message, typeof data === 'string' ? data : JSON.stringify(data)).run()
  } catch {}
}

export async function onRequestPost({ env, request }) {
  let rawBody
  try {
    rawBody = await request.text()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  await log(env, 'webhook/sms', 'Received webhook', rawBody.slice(0, 2000))

  let body
  try {
    body = JSON.parse(rawBody)
  } catch (e) {
    await log(env, 'webhook/sms', 'JSON parse error', e.message)
    return new Response('Bad request', { status: 400 })
  }

  const eventType = body.data?.event_type
  const payload = body.data?.payload

  await log(env, 'webhook/sms', `Event type: ${eventType}`, JSON.stringify(payload || {}).slice(0, 1000))

  if (eventType === 'message.received' && payload) {
    const from = payload.from?.phone_number || 'unknown'
    const text = payload.text || ''

    await log(env, 'webhook/sms', `Inbound SMS from ${from}`, text)

    if (!text) return Response.json({ success: true })

    // Find user
    const user = await env.DB.prepare('SELECT id, name FROM users LIMIT 1').first()
    const userId = user?.id || 'default'

    await log(env, 'webhook/sms', `Found user: ${userId}`, user?.name || 'none')

    // Store inbound message
    await env.DB.prepare(
      'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, from, text, 'sms_inbound', new Date().toISOString()).run()

    await log(env, 'webhook/sms', 'Stored inbound message', '')

    // AI auto-reply
    const apiKey = env.ANTHROPIC_API_KEY
    const telnyxKey = env.TELNYX_API_KEY
    const fromNum = env.TELNYX_PHONE_NUMBER

    await log(env, 'webhook/sms', 'Config check', `apiKey: ${apiKey ? 'YES' : 'NO'}, telnyxKey: ${telnyxKey ? 'YES' : 'NO'}, fromNum: ${fromNum || 'MISSING'}`)

    if (apiKey && telnyxKey && fromNum) {
      try {
        await log(env, 'webhook/sms', 'Calling Claude AI', '')

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

        const aiResult = await aiResponse.json()
        await log(env, 'webhook/sms', `Claude response status: ${aiResponse.status}`, JSON.stringify(aiResult).slice(0, 500))

        if (aiResponse.ok) {
          const reply = aiResult.content?.[0]?.text

          if (reply) {
            await log(env, 'webhook/sms', 'Sending reply via Telnyx', `from: ${fromNum}, to: ${from}, text: ${reply.slice(0, 100)}`)

            const sendResponse = await fetch('https://api.telnyx.com/v2/messages', {
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

            const sendResult = await sendResponse.json()
            await log(env, 'webhook/sms', `Telnyx send status: ${sendResponse.status}`, JSON.stringify(sendResult).slice(0, 500))

            if (sendResponse.ok) {
              await env.DB.prepare(
                'INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)'
              ).bind(userId, from, reply.slice(0, 160), 'sms_auto', new Date().toISOString()).run()
              await log(env, 'webhook/sms', 'Auto-reply sent and stored', '')
            }
          }
        }
      } catch (err) {
        await log(env, 'webhook/sms', 'Error in auto-reply', err.message || String(err))
      }
    }

    return Response.json({ success: true })
  }

  return Response.json({ success: true })
}
