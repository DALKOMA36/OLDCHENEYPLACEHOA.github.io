import { useState, useRef, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// ---- Deep link launchers ----

const launchers = {
  youtubeSearch: (q) => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank'),
  youtubeMusic: (q) => window.open(`https://music.youtube.com/search?q=${encodeURIComponent(q)}`, '_blank'),
  spotify: (q) => window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, '_blank'),
  googleMaps: (dest) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`, '_blank'),
  waze: (dest) => window.open(`https://waze.com/ul?navigate=yes&q=${encodeURIComponent(dest)}`, '_blank'),
  podcastAddict: (q) => window.open(`https://podcastaddict.com/search?q=${encodeURIComponent(q)}`, '_blank'),
}

// ---- Podcast RSS parser ----

async function fetchPodcastFeed(url) {
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
    const text = await res.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(text, 'text/xml')
    const channel = xml.querySelector('channel')
    const title = channel?.querySelector('title')?.textContent || 'Podcast'
    const desc = channel?.querySelector('description')?.textContent || ''
    const image = channel?.querySelector('image url')?.textContent
      || channel?.querySelector('itunes\\:image, image')?.getAttribute('href') || ''
    const items = Array.from(xml.querySelectorAll('item')).slice(0, 20).map(item => ({
      title: item.querySelector('title')?.textContent || '',
      date: item.querySelector('pubDate')?.textContent || '',
      duration: item.querySelector('itunes\\:duration')?.textContent || '',
      audioUrl: item.querySelector('enclosure')?.getAttribute('url') || '',
      description: item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
    }))
    return { title, desc, image, items }
  } catch (err) {
    throw new Error(`Failed to load feed: ${err.message}`)
  }
}

export default function MediaHub({ user }) {
  const [tab, setTab] = useState('launch') // launch, podcasts, navigate
  const [query, setQuery] = useState('')

  // Podcast state
  const [podFeeds, setPodFeeds] = useState(() => loadState('podcast_feeds', []))
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [feedData, setFeedData] = useState(null)
  const [playing, setPlaying] = useState(null) // { title, audioUrl }
  const [audioPaused, setAudioPaused] = useState(false)
  const audioRef = useRef(null)
  const [error, setError] = useState('')

  // Navigation state
  const [destination, setDestination] = useState('')
  const [savedPlaces, setSavedPlaces] = useState(() => loadState('saved_places', [
    { name: 'Home', address: '' },
    { name: 'Work', address: '' },
  ]))

  useEffect(() => { saveState('podcast_feeds', podFeeds) }, [podFeeds])
  useEffect(() => { saveState('saved_places', savedPlaces) }, [savedPlaces])

  // Load from D1
  useEffect(() => {
    db.media.feeds().then(rows => { if (rows?.length) setPodFeeds(rows) }).catch(() => {})
    db.media.places().then(rows => { if (rows?.length) setSavedPlaces(rows) }).catch(() => {})
  }, [])

  // Load feed when selected
  useEffect(() => {
    if (!selectedFeed) { setFeedData(null); return }
    setLoadingFeed(true)
    fetchPodcastFeed(selectedFeed.url)
      .then(data => setFeedData(data))
      .catch(err => setError(err.message))
      .finally(() => setLoadingFeed(false))
  }, [selectedFeed])

  const addPodFeed = async () => {
    if (!newFeedUrl.trim()) return
    setLoadingFeed(true)
    setError('')
    try {
      const data = await fetchPodcastFeed(newFeedUrl.trim())
      const feed = { id: Date.now().toString(), url: newFeedUrl.trim(), title: data.title, image: data.image }
      setPodFeeds(prev => [...prev, feed])
      db.media.addFeed(feed).catch(() => {})
      setNewFeedUrl('')
      setSelectedFeed(feed)
      setFeedData(data)
    } catch (err) {
      setError(err.message)
    }
    setLoadingFeed(false)
  }

  const playEpisode = (episode) => {
    if (audioRef.current) { audioRef.current.pause() }
    const audio = new Audio(episode.audioUrl)
    audioRef.current = audio
    audio.play()
    setPlaying(episode)
    setAudioPaused(false)
    audio.onended = () => { setPlaying(null); setAudioPaused(false) }
  }

  const togglePause = () => {
    if (!audioRef.current) return
    if (audioPaused) { audioRef.current.play(); setAudioPaused(false) }
    else { audioRef.current.pause(); setAudioPaused(true) }
  }

  const stopPlayback = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPlaying(null)
    setAudioPaused(false)
  }

  const updatePlace = (index, field, value) => {
    setSavedPlaces(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  // Cleanup
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 13, fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 4,
      }}>Media & Navigation</h2>
      <p style={{
        color: colors.textMuted, fontSize: 12, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Music, podcasts, and directions — all in one place</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['launch', 'QUICK LAUNCH'], ['podcasts', 'PODCASTS'], ['navigate', 'NAVIGATE']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', fontSize: 11, minHeight: 44,
            background: tab === t ? colors.primaryDim : 'transparent',
            color: tab === t ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: tab === t ? `1px solid ${colors.primary}` : '1px solid transparent',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Now Playing bar */}
      {playing && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: 14, marginBottom: 12, borderRadius: 10,
          background: colors.primaryDim, border: `1px solid ${colors.primary}`,
        }}>
          <button onClick={togglePause} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: colors.primary, border: 'none', color: '#fff',
            fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{audioPaused ? '\u25B6' : '\u2016'}</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: colors.text, fontSize: 14, fontWeight: 500,
              fontFamily: "'Exo 2', sans-serif",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{playing.title}</div>
            <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              NOW PLAYING
            </div>
          </div>
          <button onClick={stopPlayback} style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: 14, cursor: 'pointer',
          }}>\u25A0</button>
        </div>
      )}

      {/* ---- Quick Launch ---- */}
      {tab === 'launch' && (
        <div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or type a destination..."
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 12, minHeight: 44, borderRadius: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['YouTube', 'Search videos', '#ff0000', () => launchers.youtubeSearch(query || 'trending')],
              ['YT Music', 'Play music', '#ff0000', () => launchers.youtubeMusic(query || 'my mix')],
              ['Spotify', 'Stream music', '#1db954', () => launchers.spotify(query || 'discover weekly')],
              ['Google Maps', 'Get directions', '#4285f4', () => launchers.googleMaps(query || '')],
              ['Waze', 'Navigate', '#33ccff', () => launchers.waze(query || '')],
              ['Podcast Addict', 'Find podcasts', '#f0a500', () => launchers.podcastAddict(query || 'top podcasts')],
            ].map(([name, desc, col, action]) => (
              <button key={name} onClick={action} style={{
                padding: 16, background: 'transparent', borderRadius: 10, minHeight: 44,
                border: `1px solid ${colors.border}`, textAlign: 'left',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}>
                <div style={{
                  color: col, fontSize: 14, fontWeight: 600, marginBottom: 4,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{name}</div>
                <div style={{
                  color: colors.textMuted, fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{query ? `"${query}"` : desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Podcasts ---- */}
      {tab === 'podcasts' && (
        <div>
          {!selectedFeed ? (
            <div>
              {/* Feed list */}
              {podFeeds.map(feed => (
                <button key={feed.id} onClick={() => setSelectedFeed(feed)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: 14, marginBottom: 10, textAlign: 'left', borderRadius: 10, minHeight: 44,
                  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                }}>
                  {feed.image && <img src={feed.image} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />}
                  <div>
                    <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>{feed.title}</div>
                  </div>
                </button>
              ))}

              {/* Add feed */}
              <div style={{ marginTop: 10 }}>
                <div style={{
                  color: colors.textMuted, fontSize: 12, marginBottom: 6,
                  fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
                }}>
                  Add a podcast RSS feed URL. Find it on the podcast's website or search "[podcast name] RSS feed".
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={newFeedUrl}
                    onChange={e => setNewFeedUrl(e.target.value)}
                    placeholder="https://feeds.example.com/podcast.xml"
                    onKeyDown={e => e.key === 'Enter' && addPodFeed()}
                    style={{
                      flex: 1, padding: '12px 14px', minHeight: 44, borderRadius: 8,
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
                    }}
                  />
                  <button onClick={addPodFeed} disabled={loadingFeed || !newFeedUrl.trim()} style={{
                    padding: '12px 16px', minHeight: 44, borderRadius: 8,
                    background: newFeedUrl.trim() ? colors.primaryDim : 'transparent',
                    border: `1px solid ${newFeedUrl.trim() ? colors.primary : colors.border}`,
                    color: newFeedUrl.trim() ? colors.primary : colors.textMuted,
                    fontSize: 12, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{loadingFeed ? '...' : 'ADD'}</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Feed detail */}
              <button onClick={() => setSelectedFeed(null)} style={linkBtn}>← BACK TO FEEDS</button>

              {loadingFeed ? (
                <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                  Loading episodes...
                </div>
              ) : feedData && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center',
                  }}>
                    {feedData.image && <img src={feedData.image} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />}
                    <div>
                      <div style={{ color: colors.text, fontSize: 15, fontWeight: 600, fontFamily: "'Exo 2', sans-serif" }}>
                        {feedData.title}
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                        {feedData.items.length} episodes
                      </div>
                    </div>
                  </div>

                  {feedData.items.map((ep, i) => (
                    <div key={i} style={{
                      padding: 14, marginBottom: 10, borderRadius: 10,
                      background: playing?.audioUrl === ep.audioUrl ? colors.primaryDim : colors.surfaceLight,
                      border: `1px solid ${playing?.audioUrl === ep.audioUrl ? colors.primary : colors.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: colors.text, fontSize: 14, fontWeight: 500,
                            fontFamily: "'Exo 2', sans-serif", marginBottom: 2,
                          }}>{ep.title}</div>
                          <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                            {ep.duration && `${ep.duration} // `}{ep.date ? new Date(ep.date).toLocaleDateString() : ''}
                          </div>
                        </div>
                        {ep.audioUrl && (
                          <button onClick={() => playEpisode(ep)} style={{
                            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                            background: colors.primaryDim, border: `1px solid ${colors.primary}`,
                            color: colors.primary, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{'\u25B6'}</button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Delete feed */}
                  <button onClick={() => {
                    setPodFeeds(prev => prev.filter(f => f.id !== selectedFeed.id))
                    db.media.deleteFeed(selectedFeed.id).catch(() => {})
                    setSelectedFeed(null)
                  }} style={{
                    width: '100%', padding: '12px 16px', marginTop: 10, minHeight: 44, borderRadius: 8,
                    background: 'transparent', border: `1px solid ${colors.danger}`,
                    color: colors.danger, fontSize: 12, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>REMOVE PODCAST</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Navigate ---- */}
      {tab === 'navigate' && (
        <div>
          {/* Quick destination */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="Where to?"
              onKeyDown={e => e.key === 'Enter' && destination && launchers.googleMaps(destination)}
              style={{
                flex: 1, padding: '12px 14px', minHeight: 44, borderRadius: 8,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
              }}
            />
          </div>

          {destination && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => launchers.googleMaps(destination)} style={navAppBtn('#4285f4')}>
                GOOGLE MAPS
              </button>
              <button onClick={() => launchers.waze(destination)} style={navAppBtn('#33ccff')}>
                WAZE
              </button>
            </div>
          )}

          {/* Saved places */}
          <div style={{
            color: colors.textMuted, fontSize: 13, marginBottom: 8,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>SAVED PLACES</div>

          {savedPlaces.map((place, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10,
              padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`, borderRadius: 10,
            }}>
              <input
                value={place.name}
                onChange={e => updatePlace(i, 'name', e.target.value)}
                style={{
                  width: 70, padding: '8px 10px', minHeight: 44, borderRadius: 8,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  color: colors.primary, fontSize: 14, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <input
                value={place.address}
                onChange={e => updatePlace(i, 'address', e.target.value)}
                placeholder="Enter address..."
                style={{
                  flex: 1, padding: '8px 10px', minHeight: 44, borderRadius: 8,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
                }}
              />
              {place.address && (
                <>
                  <button onClick={() => launchers.googleMaps(place.address)} style={tinyBtn}>MAP</button>
                  <button onClick={() => launchers.waze(place.address)} style={tinyBtn}>WAZE</button>
                </>
              )}
            </div>
          ))}

          <button onClick={() => setSavedPlaces(prev => [...prev, { name: '', address: '' }])} style={{
            width: '100%', padding: '12px 16px', marginTop: 4, minHeight: 44, borderRadius: 8,
            background: 'transparent', border: `1px dashed ${colors.border}`,
            color: colors.textMuted, fontSize: 12, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}>+ ADD PLACE</button>
        </div>
      )}

      {error && (
        <div style={{ color: colors.danger, fontSize: 10, marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}
    </div>
  )
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 12, cursor: 'pointer', padding: '8px 12px', minHeight: 44,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const tinyBtn = {
  padding: '8px 12px', fontSize: 11, cursor: 'pointer', minHeight: 36, borderRadius: 8,
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace",
}

const navAppBtn = (col) => ({
  flex: 1, padding: '12px 16px', fontSize: 12, cursor: 'pointer', minHeight: 44, borderRadius: 8,
  background: `${col}15`, border: `1px solid ${col}`,
  color: col, fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
})
