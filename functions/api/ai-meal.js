import { json, error, parseBody } from './_helpers'

// POST /api/ai-meal - Generate meal plan with Claude
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { diet, days, preferences } = body

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
        max_tokens: 2048,
        system: `You are a meal planning AI. Generate practical, realistic meal plans. Return ONLY valid JSON with this exact format:
{
  "meals": {
    "Mon_breakfast": { "name": "Meal Name", "time": "8:00 AM", "cal": 350, "ingredients": ["item1", "item2"] },
    "Mon_lunch": { "name": "...", "time": "12:00 PM", "cal": 500, "ingredients": [...] },
    "Mon_dinner": { "name": "...", "time": "6:30 PM", "cal": 600, "ingredients": [...] }
  }
}
Use the day abbreviations: Mon, Tue, Wed, Thu, Fri, Sat, Sun. Each day should have breakfast, lunch, and dinner. Keep meals simple, practical, and varied. Calorie counts should be realistic. Return ONLY the JSON.`,
        messages: [{
          role: 'user',
          content: `Generate a meal plan for ${days || 'Mon through Fri'}. ${diet ? `Diet/preferences: ${diet}.` : ''} ${preferences || 'Keep it practical and varied.'}`,
        }],
      }),
    })

    if (!response.ok) return json({ error: 'api_error' })

    const result = await response.json()
    const text = result.content?.[0]?.text || '{}'

    try {
      const parsed = JSON.parse(text.trim())
      return json(parsed)
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
