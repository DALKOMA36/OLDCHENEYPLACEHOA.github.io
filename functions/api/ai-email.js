import { json, error, parseBody } from './_helpers'

// POST /api/ai-email - AI email operations (summarize, draft reply, etc.)
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { action, subject, from, emailBody, context } = body

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'no_api_key' })

  let prompt
  if (action === 'summarize') {
    prompt = `Summarize this email in 1-2 sentences. Be concise.\n\nFrom: ${from}\nSubject: ${subject}\n\n${emailBody}`
  } else if (action === 'draft_reply') {
    prompt = `Draft a professional reply to this email. Keep it concise and appropriate. Just the reply text, no subject line or greeting format.\n\nFrom: ${from}\nSubject: ${subject}\n\n${emailBody}\n\n${context ? `Additional context: ${context}` : ''}`
  } else if (action === 'categorize') {
    prompt = `Categorize this email into one of: important, action_needed, informational, spam, personal, work. Return ONLY the category word.\n\nFrom: ${from}\nSubject: ${subject}\n\n${(emailBody || '').slice(0, 500)}`
  } else {
    return error('action required: summarize, draft_reply, categorize')
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: 'You are JARVIS, a personal AI assistant. Be concise and professional.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) return json({ error: 'api_error' })

    const result = await response.json()
    return json({ response: result.content?.[0]?.text || '' })
  } catch {
    return json({ error: 'network_error' })
  }
}
