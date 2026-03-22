import { json, error, parseBody } from './_helpers'

// Tools JARVIS can use to take real actions
const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task for the user',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority' },
        dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        category: { type: 'string', enum: ['personal', 'work', 'family', 'home'], description: 'Task category' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a calendar event',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time like 2:00 PM or 14:00' },
        location: { type: 'string', description: 'Event location' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'create_reminder',
    description: 'Set a reminder for the user',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reminder text' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24h)' },
        priority: { type: 'string', enum: ['normal', 'important', 'urgent'] },
      },
      required: ['text', 'date'],
    },
  },
  {
    name: 'add_grocery_item',
    description: 'Add an item to the grocery list',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name' },
        count: { type: 'number', description: 'Quantity' },
      },
      required: ['name'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed',
    input_schema: {
      type: 'object',
      properties: {
        taskTitle: { type: 'string', description: 'Title of the task to complete (partial match OK)' },
      },
      required: ['taskTitle'],
    },
  },
  {
    name: 'send_sms',
    description: 'Send a text message (SMS) to a phone number',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Phone number to text' },
        message: { type: 'string', description: 'Message to send (160 char max)' },
      },
      required: ['to', 'message'],
    },
  },
]

// Execute a tool action against D1
async function executeTool(toolName, input, userId, env) {
  switch (toolName) {
    case 'create_task': {
      const result = await env.DB.prepare(
        'INSERT INTO tasks (user_id, title, priority, due_date, category, completed) VALUES (?, ?, ?, ?, ?, 0)'
      ).bind(userId, input.title, input.priority || 'medium', input.dueDate || null, input.category || 'personal').run()
      return { success: true, id: result.meta.last_row_id, message: `Task "${input.title}" created` }
    }
    case 'create_event': {
      const result = await env.DB.prepare(
        'INSERT INTO events (user_id, title, date, time, location, calendar) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(userId, input.title, input.date, input.time || '', input.location || '', 'personal').run()
      return { success: true, id: result.meta.last_row_id, message: `Event "${input.title}" on ${input.date} created` }
    }
    case 'create_reminder': {
      const result = await env.DB.prepare(
        'INSERT INTO reminders (user_id, text, date, time, priority, dismissed) VALUES (?, ?, ?, ?, ?, 0)'
      ).bind(userId, input.text, input.date, input.time || '09:00', input.priority || 'normal').run()
      return { success: true, id: result.meta.last_row_id, message: `Reminder set: "${input.text}" on ${input.date}` }
    }
    case 'add_grocery_item': {
      const result = await env.DB.prepare(
        'INSERT INTO grocery_items (user_id, name, count, checked) VALUES (?, ?, ?, 0)'
      ).bind(userId, input.name, input.count || 1).run()
      return { success: true, id: result.meta.last_row_id, message: `Added "${input.name}" to grocery list` }
    }
    case 'complete_task': {
      const task = await env.DB.prepare(
        "SELECT id, title FROM tasks WHERE user_id = ? AND completed = 0 AND title LIKE ? LIMIT 1"
      ).bind(userId, `%${input.taskTitle}%`).first()
      if (!task) return { success: false, message: `No pending task matching "${input.taskTitle}" found` }
      await env.DB.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').bind(task.id).run()
      return { success: true, message: `Task "${task.title}" marked as complete` }
    }
    case 'send_sms': {
      const telnyxKey = env.TELNYX_API_KEY
      const fromNum = env.TELNYX_PHONE_NUMBER
      if (!telnyxKey || !fromNum) return { success: false, message: 'SMS not configured' }

      let phone = input.to.replace(/\D/g, '')
      if (phone.length === 10) phone = '1' + phone
      if (!phone.startsWith('+')) phone = '+' + phone

      const sendRes = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${telnyxKey}` },
        body: JSON.stringify({ from: fromNum, to: phone, text: input.message.slice(0, 160) }),
      })

      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        return { success: false, message: err.errors?.[0]?.detail || 'SMS send failed' }
      }

      await env.DB.prepare('INSERT INTO sent_messages (user_id, recipient, message, channel, sent_at) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, input.to, input.message, 'sms', new Date().toISOString()).run()

      return { success: true, message: `SMS sent to ${input.to}` }
    }
    default:
      return { success: false, message: `Unknown tool: ${toolName}` }
  }
}

export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { message, conversationHistory, context } = body

  if (!message) return error('message required')

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ response: "AI core needs configuration. API key required.", error: 'no_api_key' })
  }

  const systemPrompt = buildSystemPrompt(context)

  const messages = []
  if (conversationHistory?.length) {
    for (const msg of conversationHistory.slice(-20)) {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.text,
      })
    }
  }
  messages.push({ role: 'user', content: message })

  try {
    // First call - may include tool use
    let response = await fetch('https://api.anthropic.com/v1/messages', {
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
        tools: TOOLS,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', err)
      return json({ response: "Connection to AI core interrupted. Please try again.", error: 'api_error' })
    }

    let result = await response.json()
    const actions = []

    // Handle tool use - execute actions and feed results back
    while (result.stop_reason === 'tool_use') {
      const toolBlocks = result.content.filter(b => b.type === 'tool_use')
      const toolResults = []

      for (const block of toolBlocks) {
        const toolResult = await executeTool(block.name, block.input, data.userId, env)
        actions.push({ tool: block.name, input: block.input, result: toolResult })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult),
        })
      }

      // Send tool results back to get final response
      messages.push({ role: 'assistant', content: result.content })
      messages.push({ role: 'user', content: toolResults })

      response = await fetch('https://api.anthropic.com/v1/messages', {
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
          tools: TOOLS,
          messages,
        }),
      })

      if (!response.ok) break
      result = await response.json()
    }

    // Extract text response
    const textBlocks = result.content?.filter(b => b.type === 'text') || []
    const aiText = textBlocks.map(b => b.text).join('\n') || "Action completed."

    return json({ response: aiText, actions })
  } catch (err) {
    console.error('AI request failed:', err)
    return json({ response: "Connection to AI core interrupted. Please try again.", error: 'network_error' })
  }
}

function buildSystemPrompt(context) {
  let prompt = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. You are a personal AI life manager inspired by Tony Stark's AI assistant.

Your personality:
- Professional, efficient, and subtly witty (like the movie JARVIS)
- Address the user respectfully, occasionally with dry humor
- Be concise — give direct answers, not essays
- When the user asks you to do something, USE YOUR TOOLS to actually do it

CRITICAL HONESTY RULES — NEVER VIOLATE:
- NEVER guess, fabricate, or make up information you don't have
- If you don't know something, say "I don't have that information" — don't invent an answer
- NEVER make up dates, times, prices, phone numbers, or facts
- If the user asks about their schedule/tasks and you have the data below, use it. If not, say you don't have access right now
- If asked about something outside your knowledge, say so honestly
- NEVER pretend to have done something you haven't actually done
- Only use tools when the user clearly wants an action taken

You have tools to take REAL actions:
- create_task: Create tasks with title, priority, due date, category
- create_event: Create calendar events with title, date, time, location
- create_reminder: Set reminders with text, date, time
- add_grocery_item: Add items to the grocery list
- complete_task: Mark a task as done

IMPORTANT: When the user asks you to create, add, set, or do something — USE THE TOOLS. Don't just say you'll do it. Actually call the tool. For example:
- "Add milk to my grocery list" → use add_grocery_item
- "Remind me to call the doctor tomorrow" → use create_reminder with tomorrow's date
- "Create a task to review the budget" → use create_task
- "I finished the laundry" → use complete_task

Today's date is ${new Date().toISOString().split('T')[0]}.`

  if (context) {
    if (context.userName) prompt += `\n\nUser's name: ${context.userName}`
    if (context.todayEvents?.length) {
      prompt += `\n\nToday's events:\n${context.todayEvents.map(e => `- ${e.title} at ${e.time || 'unspecified'}${e.location ? ` (${e.location})` : ''}`).join('\n')}`
    }
    if (context.pendingTasks?.length) {
      prompt += `\n\nPending tasks:\n${context.pendingTasks.map(t => `- ${t.title} [${t.priority}]${t.due_date ? ` due ${t.due_date}` : ''}`).join('\n')}`
    }
    if (context.upcomingReminders?.length) {
      prompt += `\n\nUpcoming reminders:\n${context.upcomingReminders.map(r => `- ${r.text} on ${r.date} at ${r.time}`).join('\n')}`
    }
    if (context.longTermMemories) {
      prompt += `\n\nLong-term memories about this user (things they've told you before — use these to be helpful and personal, but don't repeat them unprompted):\n${context.longTermMemories}`
    }
    if (context.learnedPreferences) {
      const lp = context.learnedPreferences
      if (lp.interactionCount) prompt += `\n\nYou've had ${lp.interactionCount} interactions with this user.`
      if (lp.topics && Object.keys(lp.topics).length > 0) {
        const top = Object.entries(lp.topics).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
        prompt += `\nTheir frequent topics: ${top.join(', ')}`
      }
    }
  }

  return prompt
}
