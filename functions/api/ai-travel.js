import { json, error, parseBody } from './_helpers'

// POST /api/ai-travel - Generate travel itinerary with Claude
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { destination, startDate, endDate, travelers, style, interests, budget } = body

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'no_api_key' })

  const numDays = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1)
    : 5

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
        system: `You are a travel planning AI. Generate detailed, realistic travel itineraries. Return ONLY valid JSON:
{
  "destination": "City, Country",
  "days": [
    { "day": 1, "title": "Day Title", "activities": ["Activity 1 with specific venue/location", "Activity 2", "Activity 3", "Dinner recommendation"] }
  ],
  "packing": ["item1", "item2"],
  "budget": "$X,XXX estimated total",
  "tips": ["Local tip 1", "Local tip 2"]
}
Be specific with real venues, restaurants, and attractions. Include morning, afternoon, and evening activities. Return ONLY JSON.`,
        messages: [{
          role: 'user',
          content: `Plan a ${numDays}-day trip to ${destination || 'a surprise destination'}. ${travelers ? `${travelers} travelers.` : ''} ${style ? `Style: ${style}.` : ''} ${interests?.length ? `Interests: ${interests.join(', ')}.` : ''} ${budget ? `Budget: ${budget}.` : ''}`,
        }],
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
