import { json, error, parseBody } from './_helpers'

// POST /api/ics - Import events from an ICS calendar URL
export async function onRequestPost({ env, request, data }) {
  const body = await parseBody(request)
  const { url } = body

  if (!url) return error('ICS URL required')

  try {
    const response = await fetch(url)
    if (!response.ok) return error('Failed to fetch ICS feed')

    const icsText = await response.text()
    const events = parseICS(icsText)

    if (events.length === 0) return json({ success: true, imported: 0, message: 'No events found in feed' })

    // Import events to D1 — skip duplicates by checking title+date
    let imported = 0
    for (const event of events) {
      const existing = await env.DB.prepare(
        'SELECT id FROM events WHERE user_id = ? AND title = ? AND date = ?'
      ).bind(data.userId, event.title, event.date).first()

      if (!existing) {
        await env.DB.prepare(
          'INSERT INTO events (user_id, title, date, time, location, calendar, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(data.userId, event.title, event.date, event.time || '', event.location || '', 'synced', '#0077b6').run()
        imported++
      }
    }

    return json({ success: true, imported, total: events.length })
  } catch (err) {
    return json({ success: false, error: err.message })
  }
}

function parseICS(text) {
  const events = []
  const lines = text.replace(/\r\n /g, '').split(/\r?\n/)
  let inEvent = false
  let event = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      event = {}
    } else if (line === 'END:VEVENT') {
      inEvent = false
      if (event.title && event.date) {
        events.push(event)
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:') || line.startsWith('SUMMARY;')) {
        event.title = line.split(':').slice(1).join(':').trim()
      } else if (line.startsWith('DTSTART')) {
        const val = line.split(':').pop().trim()
        const parsed = parseICSDate(val)
        if (parsed) {
          event.date = parsed.date
          event.time = parsed.time
        }
      } else if (line.startsWith('LOCATION:') || line.startsWith('LOCATION;')) {
        event.location = line.split(':').slice(1).join(':').trim()
      } else if (line.startsWith('DESCRIPTION:') || line.startsWith('DESCRIPTION;')) {
        event.description = line.split(':').slice(1).join(':').trim()
      }
    }
  }

  return events
}

function parseICSDate(val) {
  // Formats: 20260315T140000Z, 20260315T140000, 20260315
  try {
    if (val.length >= 8) {
      const y = val.slice(0, 4)
      const m = val.slice(4, 6)
      const d = val.slice(6, 8)
      const date = `${y}-${m}-${d}`

      let time = ''
      if (val.length >= 15) {
        const h = val.slice(9, 11)
        const min = val.slice(11, 13)
        const hour = parseInt(h)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
        time = `${h12}:${min} ${ampm}`
      }

      return { date, time }
    }
  } catch {}
  return null
}
