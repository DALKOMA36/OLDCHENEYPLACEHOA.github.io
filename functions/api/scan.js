import { json, error, parseBody } from './_helpers'

// POST /api/scan - Use Claude to extract structured data from text
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { text, source } = body

  if (!text?.trim()) return error('text required')

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ error: 'no_api_key', items: [] })
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
        max_tokens: 1024,
        system: `You are a document analysis AI. Extract structured data from the text provided. Return ONLY valid JSON with this format:
{
  "type": "document type (e.g. Email, Flyer, Recipe, Invoice, Letter, Note)",
  "items": [
    { "kind": "event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM AM/PM", "location": "..." },
    { "kind": "task", "title": "...", "priority": "low|medium|high" },
    { "kind": "deadline", "title": "...", "date": "YYYY-MM-DD" },
    { "kind": "reminder", "title": "...", "date": "YYYY-MM-DD" },
    { "kind": "recipe", "title": "...", "servings": "...", "prepTime": "...", "cookTime": "..." },
    { "kind": "grocery", "items": ["item1", "item2"] },
    { "kind": "contact", "name": "...", "phone": "...", "email": "..." },
    { "kind": "info", "title": "...", "detail": "..." }
  ]
}
Only include items actually found in the text. Use today's year (2026) for dates without a year. Return ONLY the JSON, no markdown fences.`,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude scan error:', err)
      return json({ type: 'Unknown', items: [], error: 'api_error' })
    }

    const result = await response.json()
    const aiText = result.content?.[0]?.text || '{}'

    // Parse the JSON response
    try {
      const parsed = JSON.parse(aiText.trim())
      return json(parsed)
    } catch {
      // Try to extract JSON from the response
      const match = aiText.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return json(JSON.parse(match[0]))
        } catch {}
      }
      return json({ type: 'Unknown', items: [{ kind: 'info', title: 'Extracted text', detail: aiText }] })
    }
  } catch (err) {
    console.error('Scan request failed:', err)
    return json({ type: 'Unknown', items: [], error: 'network_error' })
  }
}
