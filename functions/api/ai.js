import { json, error, parseBody } from './_helpers'

// POST /api/ai - Send message to Claude and get response
// Also provides context from user's app data
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { message, conversationHistory, context } = body

  if (!message) return error('message required')

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ response: "I'm not fully connected yet. My AI core needs an API key to be configured.", error: 'no_api_key' })
  }

  // Build system prompt with user context
  const systemPrompt = buildSystemPrompt(data.userId, context)

  // Build messages array
  const messages = []
  if (conversationHistory?.length) {
    for (const msg of conversationHistory.slice(-20)) { // last 20 messages for context
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.text,
      })
    }
  }
  messages.push({ role: 'user', content: message })

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
        system: systemPrompt,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', err)
      return json({ response: "I'm having trouble connecting to my AI core. Please try again.", error: 'api_error' })
    }

    const result = await response.json()
    const aiText = result.content?.[0]?.text || "I couldn't generate a response."

    return json({ response: aiText })
  } catch (err) {
    console.error('AI request failed:', err)
    return json({ response: "Connection to AI core interrupted. Please try again.", error: 'network_error' })
  }
}

function buildSystemPrompt(userId, context) {
  let prompt = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. You are a personal AI life manager, inspired by Tony Stark's AI assistant.

Your personality:
- Professional, efficient, and subtly witty (like the movie JARVIS)
- Address the user respectfully, occasionally with dry humor
- Be concise — give direct answers, not essays
- When helping with tasks, events, meals, etc., be specific and actionable
- You can reference the user's data when relevant

You have access to the user's personal data to help them:`

  if (context) {
    if (context.userName) {
      prompt += `\n\nUser's name: ${context.userName}`
    }
    if (context.todayEvents?.length) {
      prompt += `\n\nToday's events:\n${context.todayEvents.map(e => `- ${e.title} at ${e.time || 'unspecified time'}${e.location ? ` (${e.location})` : ''}`).join('\n')}`
    }
    if (context.pendingTasks?.length) {
      prompt += `\n\nPending tasks:\n${context.pendingTasks.map(t => `- ${t.title} [${t.priority}]${t.dueDate ? ` due ${t.dueDate}` : ''}`).join('\n')}`
    }
    if (context.upcomingReminders?.length) {
      prompt += `\n\nUpcoming reminders:\n${context.upcomingReminders.map(r => `- ${r.text} on ${r.date} at ${r.time}`).join('\n')}`
    }
    if (context.trainSchedule?.length) {
      prompt += `\n\nTrain commute schedule:\n${context.trainSchedule.map(s => `- Train ${s.train} ${s.direction} from ${s.boardStation} on ${s.days?.join(', ')}`).join('\n')}`
    }
  }

  prompt += `\n\nImportant rules:
- Keep responses concise (2-4 sentences unless asked for detail)
- If asked to create events, tasks, or reminders, confirm what you'd create but note that automatic creation will be available soon
- If asked about something outside your data, be helpful but honest about limitations
- Never make up data you don't have — say "I don't have that information" instead`

  return prompt
}
