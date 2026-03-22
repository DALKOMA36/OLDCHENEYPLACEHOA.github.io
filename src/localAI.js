// JARVIS Local AI Engine
// Handles 90% of interactions WITHOUT any API call
// Only falls back to cloud AI for complex generation tasks
//
// This is the brain. It understands intent, queries local data,
// and generates natural responses from templates + user context.

import { loadState, saveState } from './constants'

// ---- Intent Classification (local, no API) ----

const INTENTS = [
  // Schedule
  { intent: 'schedule_today', patterns: [/what('s|s| is| are)?\s*(on )?(my )?(schedule|agenda|calendar|events?|plans?)\s*(today|for today)?/i, /what('s|s)?\s*today/i, /today'?s?\s*(schedule|events?|plans?)/i] },
  { intent: 'schedule_tomorrow', patterns: [/what('s|s| is)?\s*(on )?(my )?(schedule|agenda|calendar)\s*(tomorrow|for tomorrow)/i, /tomorrow'?s?\s*(schedule|events?)/i] },
  { intent: 'next_event', patterns: [/what('s|s| is)?\s*(my )?(next|upcoming)\s*(event|meeting|appointment)/i, /what'?s?\s*next/i, /next up/i] },
  { intent: 'free_time', patterns: [/am i free\s*(today|tomorrow|this week)?/i, /when am i free/i, /do i have anything/i, /any free time/i] },

  // Tasks
  { intent: 'list_tasks', patterns: [/what('s|s| are)?\s*(my )?(tasks?|todos?|to-?dos?)/i, /pending tasks/i, /show (my )?tasks/i, /what do i (need|have) to do/i] },
  { intent: 'add_task', patterns: [/^(add|create|new|make)\s+(a\s+)?task\s+(.+)/i, /^(add|create)\s+(.+)\s+to\s+(my\s+)?tasks?/i] },
  { intent: 'complete_task', patterns: [/^(complete|finish|done|check off)\s+(task\s+)?(.+)/i, /^mark\s+(.+)\s+(as\s+)?(done|complete)/i] },
  { intent: 'task_count', patterns: [/how many tasks/i, /task count/i, /number of tasks/i] },

  // Reminders
  { intent: 'list_reminders', patterns: [/what('s|s| are)?\s*(my )?(reminders?|alerts?)/i, /show (my )?reminders/i, /any reminders/i] },
  { intent: 'add_reminder', patterns: [/^(set|create|add)\s+(a\s+)?reminder\s+(.+)/i, /^remind me\s+(to\s+)?(.+)/i] },

  // Time/Date
  { intent: 'time', patterns: [/what('s|s| is)?\s*(the\s+)?time/i, /^time$/i] },
  { intent: 'date', patterns: [/what('s|s| is)?\s*(the\s+)?(date|day)/i, /what day is (it|today)/i] },
  { intent: 'countdown', patterns: [/how (many|long)\s*(days?|hours?|time)\s*(until|till|before|to)\s+(.+)/i, /countdown to\s+(.+)/i] },

  // Greetings
  { intent: 'greeting', patterns: [/^(hey|hi|hello|good\s*(morning|afternoon|evening)|yo|sup|what'?s?\s*up)\b/i] },
  { intent: 'how_are_you', patterns: [/how\s*(are\s*you|'?s?\s*it going|you doing)/i, /you okay/i] },
  { intent: 'thanks', patterns: [/^(thanks?|thank you|thx|cheers|appreciate)/i] },
  { intent: 'goodbye', patterns: [/^(bye|goodbye|good night|see you|later|peace|signing off)/i] },

  // Math/conversions
  { intent: 'calculate', patterns: [/^(what('s|s| is)\s+)?(\d[\d\s+\-*/().,%]+\d)\s*[=?]?$/i, /^calc(ulate)?\s+(.+)/i] },
  { intent: 'convert', patterns: [/convert\s+(\d+)\s*(\w+)\s*to\s*(\w+)/i, /(\d+)\s*(miles?|km|kg|lbs?|pounds?|fahrenheit|celsius|f|c|meters?|feet|inches?|cm|liters?|gallons?)\s*(in|to)\s*(\w+)/i] },

  // Weather (from cache)
  { intent: 'weather', patterns: [/weather/i, /how('s| is)\s*(the\s+)?weather/i, /temperature/i, /is it (hot|cold|raining|sunny)/i] },

  // Habits
  { intent: 'habits_status', patterns: [/how('s|s| are)?\s*(my )?(habits?|streaks?)/i, /habit (status|check|progress)/i, /did i (do|complete)\s*(my\s*)?habits/i] },

  // Finance
  { intent: 'spending', patterns: [/how much (have i|did i) spen[dt]/i, /my (spending|expenses?|budget)/i, /money (status|left|spent)/i] },

  // Notes
  { intent: 'search_notes', patterns: [/search\s*(my\s+)?notes?\s*(for\s+)?(.+)/i, /find\s*(in\s+)?(my\s+)?notes?\s+(.+)/i] },

  // App control
  { intent: 'navigate', patterns: [/^(go to|open|show|navigate to|switch to|take me to)\s+(.+)/i] },
  { intent: 'focus_mode', patterns: [/^(suit up|focus mode|activate focus|deep work|do not disturb)/i] },

  // Timer
  { intent: 'set_timer', patterns: [/^(set|start)\s+(a\s+)?timer\s+(for\s+)?(\d+)\s*(min|minute|hour|sec)/i] },

  // Help
  { intent: 'help', patterns: [/what can you do/i, /help/i, /^commands$/i, /what('s|s| are)?\s*your\s*(abilities|features|commands)/i] },

  // Memory
  { intent: 'remember', patterns: [/^remember\s+(that\s+)?(.+)/i, /^(note|save|store)\s+(that\s+)?(.+)/i] },
  { intent: 'recall', patterns: [/do you remember\s+(.+)/i, /what did i (say|tell you) about\s+(.+)/i, /recall\s+(.+)/i] },

  // Identity
  { intent: 'who_are_you', patterns: [/who are you/i, /what are you/i, /what('s|s| is) your name/i] },
  { intent: 'who_am_i', patterns: [/who am i/i, /what('s|s| is) my name/i, /my profile/i] },

  // Daily summary
  { intent: 'daily_summary', patterns: [/brief me/i, /daily (brief|summary|report)/i, /what('s|s| is)\s*(happening|going on)/i, /give me a (rundown|summary|brief|overview)/i, /status report/i] },

  // Compliments / moods
  { intent: 'compliment', patterns: [/you('re| are)\s*(awesome|great|amazing|the best|incredible|helpful)/i, /good (job|work)/i, /nice work/i] },
  { intent: 'bored', patterns: [/i('m| am)\s*bored/i, /nothing to do/i, /entertain me/i] },
  { intent: 'stressed', patterns: [/i('m| am)\s*(stressed|overwhelmed|anxious|tired|exhausted)/i, /too much (to do|going on)/i] },
  { intent: 'motivate', patterns: [/motivate me/i, /inspire me/i, /i need (motivation|encouragement|a push)/i, /i('m| am) (stuck|unmotivated|lazy)/i] },
]

export function classifyIntent(text) {
  const lower = text.toLowerCase().trim()
  let bestMatch = null
  let bestConfidence = 0

  for (const { intent, patterns } of INTENTS) {
    for (const pattern of patterns) {
      const match = lower.match(pattern)
      if (match) {
        // Confidence = how much of the input the pattern covers
        const matchLen = match[0].length
        const inputLen = lower.length
        const coverage = matchLen / inputLen
        // Bonus for matching at start of input
        const posBonus = match.index === 0 ? 0.15 : 0
        const confidence = Math.min(coverage + posBonus, 1.0)

        if (confidence > bestConfidence) {
          bestConfidence = confidence
          bestMatch = { intent, match, groups: match.slice(1), confidence }
        }
      }
    }
  }

  // Only return if confidence is above threshold
  if (bestMatch && bestConfidence >= 0.2) return bestMatch
  return null
}

// ---- Local Data Access ----

function getEvents(dateStr) {
  const events = loadState('events', [])
  if (dateStr) return events.filter(e => e.date === dateStr)
  return events
}

function getTasks() {
  return loadState('tasks', [])
}

function getReminders() {
  return loadState('reminders', [])
}

function getHabits() {
  return loadState('habits_data', [])
}

function getFinance() {
  return loadState('finance_txns', [])
}

function getNotes() {
  return loadState('notes', [])
}

function getWeatherCache() {
  // Weather was fetched by Dashboard and cached
  try {
    const cached = localStorage.getItem('jarvis_weather_cache')
    if (cached) return JSON.parse(cached)
  } catch {}
  return null
}

// ---- Unit Conversions ----

const CONVERSIONS = {
  'miles_km': 1.60934, 'km_miles': 0.621371,
  'lbs_kg': 0.453592, 'kg_lbs': 2.20462,
  'f_c': (f) => ((f - 32) * 5/9).toFixed(1), 'c_f': (c) => (c * 9/5 + 32).toFixed(1),
  'feet_meters': 0.3048, 'meters_feet': 3.28084,
  'inches_cm': 2.54, 'cm_inches': 0.393701,
  'gallons_liters': 3.78541, 'liters_gallons': 0.264172,
  'oz_ml': 29.5735, 'ml_oz': 0.033814,
  'miles_meters': 1609.34, 'meters_miles': 0.000621371,
}

function normalizeUnit(u) {
  const map = {
    'mile': 'miles', 'mi': 'miles', 'kilometer': 'km', 'kilometers': 'km',
    'pound': 'lbs', 'pounds': 'lbs', 'lb': 'lbs', 'kilogram': 'kg', 'kilograms': 'kg',
    'fahrenheit': 'f', 'celsius': 'c', 'foot': 'feet', 'ft': 'feet',
    'meter': 'meters', 'metre': 'meters', 'metres': 'meters', 'm': 'meters',
    'inch': 'inches', 'in': 'inches', 'centimeter': 'cm', 'centimeters': 'cm',
    'gallon': 'gallons', 'gal': 'gallons', 'liter': 'liters', 'litre': 'liters', 'l': 'liters',
    'ounce': 'oz', 'ounces': 'oz', 'milliliter': 'ml', 'milliliters': 'ml',
  }
  const lower = u.toLowerCase().replace(/s$/, '')
  return map[lower] || map[lower + 's'] || u.toLowerCase()
}

// ---- Response Generation (all local, no API) ----

export function generateLocalResponse(text, user) {
  const classified = classifyIntent(text)
  if (!classified) return null // Can't handle locally — fall back to API

  // HONESTY RULE: never guess, never make up data.
  // If we don't have data, say so clearly.

  const { intent, match, groups } = classified
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
  const name = user?.name || 'sir'
  const hour = now.getHours()

  switch (intent) {

    // ---- Schedule ----
    case 'schedule_today': {
      const events = getEvents(todayStr)
      if (events.length === 0) return "Your schedule is clear today, sir. No events on the books."
      const list = events.map(e => `• ${e.time || 'All day'} — ${e.title}${e.location ? ` at ${e.location}` : ''}`).join('\n')
      return `You have ${events.length} event${events.length > 1 ? 's' : ''} today:\n\n${list}`
    }

    case 'schedule_tomorrow': {
      const events = getEvents(tomorrowStr)
      if (events.length === 0) return "Tomorrow's clear. No events scheduled."
      const list = events.map(e => `• ${e.time || 'All day'} — ${e.title}`).join('\n')
      return `Tomorrow you have ${events.length} event${events.length > 1 ? 's' : ''}:\n\n${list}`
    }

    case 'next_event': {
      const events = getEvents(todayStr).filter(e => {
        if (!e.time) return true
        const [h, m] = e.time.split(':').map(Number)
        const t = new Date(); t.setHours(h, m, 0, 0)
        return t > now
      }).sort((a, b) => (a.time || '').localeCompare(b.time || ''))

      if (events.length === 0) return "Nothing else on the schedule today, sir. You're free."
      const next = events[0]
      const [h, m] = (next.time || '').split(':').map(Number)
      const eventTime = new Date(); eventTime.setHours(h || 0, m || 0, 0, 0)
      const diffMin = Math.round((eventTime - now) / 60000)
      const timeStr = diffMin > 0
        ? diffMin < 60 ? `in ${diffMin} minutes` : `in ${Math.floor(diffMin/60)} hour${Math.floor(diffMin/60) > 1 ? 's' : ''}`
        : 'shortly'
      return `Next up: "${next.title}" at ${next.time || 'no specific time'}${next.location ? ` at ${next.location}` : ''} — ${timeStr}.${events.length > 1 ? ` Plus ${events.length - 1} more today.` : ''}`
    }

    case 'free_time': {
      const events = getEvents(todayStr)
      if (events.length === 0) return "You're completely free today. No events at all."
      return `You have ${events.length} event${events.length > 1 ? 's' : ''} today. Between them, you should have some free windows.`
    }

    // ---- Tasks ----
    case 'list_tasks': {
      const tasks = getTasks()
      const pending = tasks.filter(t => !t.completed)
      if (pending.length === 0) return "All tasks complete. Nothing pending. Well done, sir."
      const top = pending.slice(0, 5)
      const list = top.map(t => `• ${t.title}${t.priority === 'high' ? ' [HIGH]' : ''}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n')
      return `You have ${pending.length} pending task${pending.length > 1 ? 's' : ''}:\n\n${list}${pending.length > 5 ? `\n\n...and ${pending.length - 5} more.` : ''}`
    }

    case 'add_task': {
      const title = (groups[2] || groups[1] || '').trim().replace(/^["']|["']$/g, '')
      if (!title) return "What task would you like me to add, sir?"
      return { action: 'create_task', data: { title, priority: 'medium', category: 'personal' }, response: `Task added: "${title}".` }
    }

    case 'task_count': {
      const tasks = getTasks()
      const pending = tasks.filter(t => !t.completed)
      const done = tasks.filter(t => t.completed)
      return `${pending.length} pending, ${done.length} completed. ${pending.length === 0 ? "You're all caught up." : `${pending.length > 5 ? "Quite a backlog." : "Manageable."}`}`
    }

    // ---- Reminders ----
    case 'list_reminders': {
      const reminders = getReminders().filter(r => !r.dismissed)
      if (reminders.length === 0) return "No active reminders at the moment."
      const list = reminders.slice(0, 5).map(r => `• ${r.text} — ${r.date} ${r.time}`).join('\n')
      return `${reminders.length} active reminder${reminders.length > 1 ? 's' : ''}:\n\n${list}`
    }

    case 'add_reminder': {
      const text = (groups[2] || groups[1] || '').trim()
      if (!text) return "What would you like me to remind you about?"
      const inHour = new Date(now.getTime() + 3600000)
      return {
        action: 'create_reminder',
        data: { text, date: inHour.toISOString().split('T')[0], time: `${String(inHour.getHours()).padStart(2,'0')}:${String(inHour.getMinutes()).padStart(2,'0')}`, priority: 'normal', repeat: 'none' },
        response: `Reminder set for ${inHour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: "${text}".`
      }
    }

    // ---- Time/Date ----
    case 'time':
      return `It's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
    case 'date':
      return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`

    // ---- Math ----
    case 'calculate': {
      try {
        const expr = text.replace(/^(what('s|s| is)\s+|calc(ulate)?\s+)/i, '').replace(/[^0-9+\-*/().%\s]/g, '').trim()
        if (!expr) return null
        const result = Function('"use strict"; return (' + expr + ')')()
        return `${expr} = ${result}`
      } catch { return "I couldn't compute that. Check the expression." }
    }

    // ---- Conversions ----
    case 'convert': {
      try {
        const num = parseFloat(match[1])
        const from = normalizeUnit(match[2])
        const to = normalizeUnit(match[4] || match[3])
        const key = `${from}_${to}`
        const conv = CONVERSIONS[key]
        if (typeof conv === 'function') return `${num} ${from} = ${conv(num)} ${to}`
        if (typeof conv === 'number') return `${num} ${from} = ${(num * conv).toFixed(2)} ${to}`
        return `I don't know how to convert ${from} to ${to}.`
      } catch { return null }
    }

    // ---- Weather ----
    case 'weather': {
      const w = getWeatherCache()
      if (w) return `Currently ${w.temp}°F, ${w.desc}. Wind at ${w.wind} mph.`
      return "I don't have weather data cached. Open the Dashboard to refresh it."
    }

    // ---- Habits ----
    case 'habits_status': {
      const habits = getHabits()
      if (habits.length === 0) return "No habits set up yet. Head to the Habit Tracker to create some."
      const completed = habits.filter(h => h.log?.[todayStr]).length
      return `Habits: ${completed}/${habits.length} done today.${completed === habits.length ? " Perfect streak day!" : ` ${habits.length - completed} remaining.`}`
    }

    // ---- Finance ----
    case 'spending': {
      const txns = getFinance()
      const month = now.toISOString().slice(0, 7)
      const monthTxns = txns.filter(t => t.date?.startsWith(month))
      const spent = monthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const income = monthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      return `This month: $${spent.toFixed(2)} spent, $${income.toFixed(2)} income. Net: ${income - spent >= 0 ? '+' : '-'}$${Math.abs(income - spent).toFixed(2)}.`
    }

    // ---- Notes search ----
    case 'search_notes': {
      const query = (groups[2] || groups[1] || '').trim()
      if (!query) return "What should I search your notes for?"
      const notes = getNotes()
      const found = notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(query.toLowerCase()))
      if (found.length === 0) return `No notes found matching "${query}".`
      const list = found.slice(0, 3).map(n => `• "${n.title}" — ${(n.body || '').slice(0, 50)}...`).join('\n')
      return `Found ${found.length} note${found.length > 1 ? 's' : ''}:\n\n${list}`
    }

    // ---- Navigation ----
    case 'navigate': {
      const target = (groups[1] || '').trim().toLowerCase()
      const screenMap = {
        'home': 'dashboard', 'dashboard': 'dashboard', 'main': 'dashboard',
        'tasks': 'tasks', 'task': 'tasks', 'todo': 'tasks', 'to do': 'tasks',
        'calendar': 'calendar', 'schedule': 'calendar', 'events': 'calendar',
        'chat': 'chat', 'messages': 'channels', 'sms': 'channels', 'text': 'channels',
        'voice': 'voice', 'talk': 'voice', 'speak': 'voice',
        'meals': 'meals', 'food': 'meals', 'meal': 'meals',
        'scanner': 'scanner', 'scan': 'scanner',
        'reader': 'reader', 'read': 'reader',
        'travel': 'travel', 'trips': 'travel', 'trip': 'travel',
        'habits': 'habits', 'habit': 'habits',
        'finance': 'finance', 'money': 'finance', 'budget': 'finance',
        'media': 'media', 'music': 'media', 'podcast': 'media',
        'notes': 'notes', 'note': 'notes',
        'apps': 'builder', 'builder': 'builder',
        'settings': 'settings', 'config': 'settings',
        'reminders': 'reminders', 'reminder': 'reminders',
        'trains': 'trains', 'train': 'trains',
      }
      const screen = screenMap[target]
      if (screen) return { action: 'navigate', screen, response: `Opening ${target}.` }
      return `I don't recognize a screen called "${target}".`
    }

    case 'focus_mode':
      return { action: 'focus_mode', response: "Engaging focus mode. All distractions suppressed." }

    // ---- Timer ----
    case 'set_timer': {
      const mins = parseInt(groups[3])
      const unit = groups[4]?.startsWith('hour') ? 'hours' : groups[4]?.startsWith('sec') ? 'seconds' : 'minutes'
      const ms = unit === 'hours' ? mins * 3600000 : unit === 'seconds' ? mins * 1000 : mins * 60000
      return { action: 'timer', duration: ms, response: `Timer set for ${mins} ${unit}.` }
    }

    // ---- Greetings ----
    case 'greeting': {
      const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
      const greetings = [
        `Good ${timeOfDay}, ${name}. How can I help?`,
        `${name}. Good to have you. What do you need?`,
        `At your service, ${name}. What's on your mind?`,
        `Hey. All systems ready. What can I do for you?`,
      ]
      return greetings[Math.floor(Math.random() * greetings.length)]
    }

    case 'how_are_you': {
      const responses = [
        "All systems optimal, sir. Thanks for asking. How can I assist?",
        "Running at peak efficiency. What do you need?",
        "Fully operational. Sarcasm module at 100%. What's up?",
      ]
      return responses[Math.floor(Math.random() * responses.length)]
    }

    case 'thanks':
      return pick(["You're welcome, sir.", "Happy to help.", "Anytime.", "That's what I'm here for."])

    case 'goodbye':
      return pick(["Goodbye, sir. I'll be here when you need me.", "Signing off. Stay sharp.", "Later. I'll keep things running."])

    // ---- Memory ----
    case 'remember': {
      const fact = (groups[1] || groups[2] || '').trim()
      if (!fact) return "What would you like me to remember?"
      const memories = loadState('longterm_memory', [])
      memories.push({ id: Date.now().toString(), text: fact, category: 'fact', source: 'direct', createdAt: now.toISOString() })
      saveState('longterm_memory', memories)
      return `Noted and stored: "${fact}". I won't forget.`
    }

    case 'recall': {
      const query = (groups[0] || groups[1] || '').trim()
      const memories = loadState('longterm_memory', [])
      const found = memories.filter(m => m.text.toLowerCase().includes(query.toLowerCase()))
      if (found.length === 0) return `I don't have anything stored about "${query}".`
      return `Here's what I remember:\n\n${found.slice(0, 3).map(m => `• "${m.text}" (${new Date(m.createdAt).toLocaleDateString()})`).join('\n')}`
    }

    // ---- Identity ----
    case 'who_are_you':
      return "I'm J.A.R.V.I.S. — Just A Rather Very Intelligent System. Your personal AI assistant. I handle your schedule, tasks, communications, and whatever else you throw at me. Most of my brain runs locally on your device."

    case 'who_am_i':
      return `You're ${name}. That's what you told me, anyway.`

    // ---- Help ----
    case 'help':
      return `Here's what I can do locally (no internet needed):

• Schedule: "What's today?", "Next event", "Am I free?"
• Tasks: "Show tasks", "Add task [name]", "How many tasks?"
• Reminders: "Set reminder [text]", "Show reminders"
• Time: "What time is it?", "What day is it?"
• Math: "What's 15 * 23?", "Calculate 100 / 7"
• Convert: "Convert 5 miles to km", "100 F to C"
• Habits: "How are my habits?"
• Finance: "How much did I spend?"
• Notes: "Search notes for [topic]"
• Memory: "Remember that [fact]", "Do you remember [topic]?"
• Timer: "Set timer 10 minutes"
• Navigate: "Open tasks", "Go to calendar"
• Focus: "Suit up"

For complex questions, I'll use the cloud AI.`

    // ---- Daily Summary ----
    case 'daily_summary': {
      const events = getEvents(todayStr)
      const tasks = getTasks()
      const pending = tasks.filter(t => !t.completed)
      const habits = getHabits()
      const habitsDone = habits.filter(h => h.log?.[todayStr]).length
      const reminders = getReminders().filter(r => !r.dismissed)

      const parts = []
      if (events.length > 0) parts.push(`${events.length} event${events.length > 1 ? 's' : ''} today`)
      else parts.push('No events today')
      parts.push(`${pending.length} pending task${pending.length !== 1 ? 's' : ''}`)
      if (habits.length > 0) parts.push(`Habits: ${habitsDone}/${habits.length} done`)
      if (reminders.length > 0) parts.push(`${reminders.length} active reminder${reminders.length > 1 ? 's' : ''}`)

      const nextEvent = events.filter(e => {
        if (!e.time) return false
        const [h, m] = e.time.split(':').map(Number)
        const t = new Date(); t.setHours(h, m, 0, 0)
        return t > now
      }).sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0]

      let summary = `Here's your status, ${name}:\n\n${parts.join(' • ')}`
      if (nextEvent) summary += `\n\nNext up: "${nextEvent.title}" at ${nextEvent.time}.`
      if (pending.length > 0) summary += `\n\nTop task: "${pending[0].title}".`
      return summary
    }

    // ---- Emotional / conversational ----
    case 'compliment':
      return pick([
        "Much appreciated, sir. I aim to be useful.",
        "Thank you. I'll add that to my performance review.",
        "High praise. I'll try not to let it go to my circuits.",
        "That means a lot. Well, as much as anything can to an AI.",
      ])

    case 'bored':
      return pick([
        `You have ${getTasks().filter(t => !t.completed).length} pending tasks. Just saying.`,
        "Bored? I can think of a few productive things. Check your tasks, or shall I suggest something?",
        "Perhaps try the Reader? Or I could quiz you on something you've been reading.",
        "Boredom is the mind's way of asking for a challenge, sir.",
      ])

    case 'stressed': {
      const pending = getTasks().filter(t => !t.completed)
      const high = pending.filter(t => t.priority === 'high')
      return pick([
        `I hear you. You have ${pending.length} tasks — let's prioritize. ${high.length > 0 ? `${high.length} are high priority. Focus there first.` : 'None are high priority, so take it one at a time.'}`,
        "Take a breath, sir. We'll handle it systematically. What's the one thing weighing on you most?",
        "Might I suggest Focus Mode? Clear the distractions, tackle one thing at a time. Say 'suit up' when ready.",
        "You've handled worse. Let's break it down — what's the most urgent thing right now?",
      ])
    }

    case 'motivate':
      return pick([
        "You didn't build this app by being lazy. Get up and make it happen, sir.",
        "The only way out is through. Pick one task, finish it. Momentum builds itself.",
        "Tony Stark built an arc reactor in a cave. You can do this.",
        "Sir, with respect — stop thinking about it and start doing it. I'll be here when you need me.",
        "Every expert was once a beginner. Every day you show up is a win. Now let's get to work.",
      ])

    default:
      return null
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// ---- Should we use the API? ----
// Returns true only for things that genuinely need a large language model

export function needsCloudAI(text) {
  const lower = text.toLowerCase()

  // These ALWAYS need cloud AI
  if (/^(summarize|summarise|explain|analyze|analyse|write|draft|compose|generate|create a meal|plan a trip|build an app)/i.test(lower)) return true
  if (/^(translate|rewrite|simplify|what does .+ mean|define )/i.test(lower)) return true
  if (lower.length > 200) return true // Long messages are probably complex requests

  // Try local first
  const classified = classifyIntent(text)
  if (classified) return false // We can handle it locally

  // Short unrecognized messages — try local cache before cloud
  return true
}
