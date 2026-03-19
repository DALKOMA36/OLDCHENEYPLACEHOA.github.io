import { json, error, parseBody } from './_helpers'

// POST /api/ai-app - Generate custom app schema from description
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { description } = body

  if (!description?.trim()) return error('description required')

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'no_api_key' })

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
        max_tokens: 1024,
        system: `You are an app builder AI. Given a description, generate a custom mini-app schema. Return ONLY valid JSON:
{
  "name": "App Name",
  "icon": "single emoji",
  "fields": [
    { "label": "Field Name", "type": "text" },
    { "label": "Amount", "type": "number" },
    { "label": "Category", "type": "select", "options": ["Option 1", "Option 2", "Option 3"] },
    { "label": "Date", "type": "date" }
  ]
}
Available field types: text, number, select, date. Generate 3-6 relevant fields based on the description. Pick an appropriate emoji icon. Return ONLY JSON.`,
        messages: [{ role: 'user', content: description }],
      }),
    })

    if (!response.ok) return json({ error: 'api_error' })

    const result = await response.json()
    const text = result.content?.[0]?.text || '{}'

    try {
      return json(JSON.parse(text.trim()))
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { return json(JSON.parse(match[0])) } catch {}
      }
      return json({ error: 'parse_error' })
    }
  } catch {
    return json({ error: 'network_error' })
  }
}
