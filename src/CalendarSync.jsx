import { useEffect, useRef } from 'react'
import { loadState, saveState } from './constants'
import { db } from './db'

// Background ICS calendar sync
// Polls saved ICS URLs every 30 minutes to auto-import events
// One-way pull only — JARVIS never sends data to Google/Apple

const SYNC_INTERVAL = 30 * 60 * 1000 // 30 minutes
const STORAGE_KEY = 'jarvis_ics_feeds'
const LAST_SYNC_KEY = 'jarvis_ics_last_sync'

export function getICSFeeds() {
  return loadState('ics_feeds', [])
  // Each feed: { id, name, url, provider, lastSync, eventCount }
}

export function saveICSFeeds(feeds) {
  saveState('ics_feeds', feeds)
}

export function addICSFeed(name, url, provider = 'custom') {
  const feeds = getICSFeeds()
  feeds.push({
    id: Date.now().toString(),
    name,
    url,
    provider, // google, apple, outlook, custom
    lastSync: null,
    eventCount: 0,
  })
  saveICSFeeds(feeds)
  return feeds
}

export function removeICSFeed(id) {
  const feeds = getICSFeeds().filter(f => f.id !== id)
  saveICSFeeds(feeds)
  return feeds
}

async function syncFeed(feed) {
  try {
    const result = await db.ics.import(feed.url)
    return {
      ...feed,
      lastSync: new Date().toISOString(),
      eventCount: result.imported || result.count || 0,
      error: null,
    }
  } catch (err) {
    return {
      ...feed,
      lastSync: new Date().toISOString(),
      error: err.message,
    }
  }
}

async function syncAllFeeds() {
  const feeds = getICSFeeds()
  if (feeds.length === 0) return

  const updated = []
  for (const feed of feeds) {
    const result = await syncFeed(feed)
    updated.push(result)
  }

  saveICSFeeds(updated)
  saveState('ics_last_sync', new Date().toISOString())
}

// React component — runs as invisible background process
export default function CalendarSync() {
  const intervalRef = useRef(null)

  useEffect(() => {
    // Sync on mount if last sync was > 30 min ago
    const lastSync = loadState('ics_last_sync', null)
    const now = Date.now()
    if (!lastSync || now - new Date(lastSync).getTime() > SYNC_INTERVAL) {
      syncAllFeeds()
    }

    // Set up polling interval
    intervalRef.current = setInterval(syncAllFeeds, SYNC_INTERVAL)

    return () => clearInterval(intervalRef.current)
  }, [])

  // Invisible component — no UI
  return null
}
