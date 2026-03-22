import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// Proxy through our backend — API key stays server-side
async function aeroFetch(path) {
  const token = localStorage.getItem('jarvis_token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`/api/flights?path=${encodeURIComponent(path)}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Flight API error: ${res.status}`)
  }
  return res.json()
}

export default function FlightTracker({ user }) {
  const [tab, setTab] = useState('search') // search, tracked, airports
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [trackedFlights, setTrackedFlights] = useState(() => loadState('tracked_flights', []))
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [airportQuery, setAirportQuery] = useState('')
  const [airportData, setAirportData] = useState(null)

  useEffect(() => { saveState('tracked_flights', trackedFlights) }, [trackedFlights])

  // API key is now server-side (Cloudflare env var)

  // Search flight by number (e.g., UA123, DAL456)
  const searchFlight = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const data = await aeroFetch(`/flights/${query.trim().toUpperCase()}`)
      setResults(data.flights || [])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Get flight details
  const getFlightDetail = async (faFlightId) => {
    // auth handled server-side
    setLoading(true)
    setError('')
    try {
      const [flight, track] = await Promise.all([
        aeroFetch(`/flights/${faFlightId}`).catch(() => null),
        aeroFetch(`/flights/${faFlightId}/track`).catch(() => null),
      ])
      setSelectedFlight({ ...(flight?.flights?.[0] || {}), track: track?.positions || [] })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Track a flight
  const trackFlight = (flight) => {
    const entry = {
      id: flight.fa_flight_id || flight.ident || Date.now().toString(),
      ident: flight.ident || flight.flight_number,
      origin: flight.origin?.code_iata || flight.origin?.code || '???',
      destination: flight.destination?.code_iata || flight.destination?.code || '???',
      status: flight.status || 'Unknown',
      departure: flight.scheduled_out || flight.actual_out,
      arrival: flight.scheduled_in || flight.actual_in,
      addedAt: new Date().toISOString(),
    }
    if (!trackedFlights.find(f => f.id === entry.id)) {
      setTrackedFlights(prev => [entry, ...prev])
    }
  }

  const removeTracked = (id) => {
    setTrackedFlights(prev => prev.filter(f => f.id !== id))
  }

  // Refresh tracked flights
  const refreshTracked = async () => {
    if (trackedFlights.length === 0) return
    setLoading(true)
    for (const flight of trackedFlights) {
      try {
        const data = await aeroFetch(`/flights/${flight.ident}`)
        const latest = data.flights?.[0]
        if (latest) {
          setTrackedFlights(prev => prev.map(f => f.id === flight.id ? {
            ...f,
            status: latest.status || f.status,
            departure: latest.actual_out || latest.scheduled_out || f.departure,
            arrival: latest.actual_in || latest.scheduled_in || f.arrival,
          } : f))
        }
      } catch {}
    }
    setLoading(false)
  }

  // Airport search
  const searchAirport = async () => {
    if (!airportQuery.trim()) return
    setLoading(true)
    setError('')
    setAirportData(null)
    try {
      const code = airportQuery.trim().toUpperCase()
      const [info, flights] = await Promise.all([
        aeroFetch(`/airports/${code}`).catch(() => null),
        aeroFetch(`/airports/${code}/flights?type=departures`).catch(() => null),
      ])
      setAirportData({
        info: info,
        departures: flights?.departures?.slice(0, 15) || [],
      })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // No API key — show setup
  // Flight detail view
  if (selectedFlight) {
    const f = selectedFlight
    return (
      <div style={{ padding: 16 }}>
        <button onClick={() => setSelectedFlight(null)} style={{
          background: 'rgba(0,212,255,0.08)', border: `1px solid ${colors.border}`,
          borderRadius: 10, color: colors.primary, fontSize: 14,
          padding: '10px 16px', marginBottom: 16, cursor: 'pointer',
          minHeight: 44, touchAction: 'manipulation',
          fontFamily: "'Exo 2', sans-serif",
        }}>← Back</button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            color: colors.primary, fontSize: 28, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{f.ident}</div>
          <div style={{
            color: colors.text, fontSize: 16, marginTop: 8,
            fontFamily: "'Exo 2', sans-serif",
          }}>
            {f.origin?.code_iata || '???'} → {f.destination?.code_iata || '???'}
          </div>
          <div style={{
            display: 'inline-block', marginTop: 8, padding: '6px 16px',
            background: f.status === 'Arrived' ? 'rgba(0,230,118,0.15)' :
              f.status === 'En Route' ? 'rgba(0,212,255,0.15)' :
              f.status === 'Cancelled' ? 'rgba(255,77,77,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${f.status === 'Arrived' ? colors.success :
              f.status === 'En Route' ? colors.primary :
              f.status === 'Cancelled' ? colors.danger : colors.border}`,
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: f.status === 'Arrived' ? colors.success :
              f.status === 'En Route' ? colors.primary :
              f.status === 'Cancelled' ? colors.danger : colors.text,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{f.status || 'Unknown'}</div>
        </div>

        {/* Flight info cards */}
        {[
          ['Origin', f.origin?.name || f.origin?.code || '—', f.origin?.city],
          ['Destination', f.destination?.name || f.destination?.code || '—', f.destination?.city],
          ['Departure', f.actual_out || f.scheduled_out || '—', f.actual_out ? 'Actual' : 'Scheduled'],
          ['Arrival', f.actual_in || f.scheduled_in || '—', f.actual_in ? 'Actual' : 'Estimated'],
          ['Aircraft', f.aircraft_type || '—', f.registration],
          ['Altitude', f.last_position?.altitude ? `${f.last_position.altitude} ft` : '—', null],
          ['Speed', f.last_position?.groundspeed ? `${f.last_position.groundspeed} kts` : '—', null],
        ].map(([label, value, sub]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 14, marginBottom: 6, borderRadius: 10,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          }}>
            <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                {typeof value === 'string' && value.includes('T') ? new Date(value).toLocaleString() : value}
              </div>
              {sub && <div style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</div>}
            </div>
          </div>
        ))}

        {/* Track on Flightradar24 */}
        <button onClick={() => window.open(`https://www.flightradar24.com/${f.ident?.replace(/\s/g, '')}`, '_blank')} style={{
          width: '100%', padding: 14, marginTop: 12, borderRadius: 10,
          background: 'rgba(246, 190, 0, 0.08)',
          border: `1px solid rgba(246, 190, 0, 0.3)`,
          color: '#f6be00', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'Exo 2', sans-serif", minHeight: 48,
        }}>View on Flightradar24 →</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{
        color: colors.primary, fontSize: 15, fontWeight: 600, marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
      }}>Flight Tracker</h2>
      <p style={{
        color: colors.textMuted, fontSize: 12, marginBottom: 16,
        fontFamily: "'Exo 2', sans-serif",
      }}>Real-time flight tracking via FlightAware</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['search', '🔍 Search'], ['tracked', `📌 Tracked (${trackedFlights.length})`], ['airports', '🏢 Airports']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px 8px', borderRadius: 10,
            background: tab === t ? colors.primaryDim : 'rgba(255,255,255,0.02)',
            border: `1px solid ${tab === t ? colors.primary : colors.border}`,
            color: tab === t ? colors.primary : colors.textMuted,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            fontFamily: "'Exo 2', sans-serif",
            minHeight: 48, touchAction: 'manipulation',
          }}>{label}</button>
        ))}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>}

      {/* Search tab */}
      {tab === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Flight number (e.g. UA123)"
              onKeyDown={e => e.key === 'Enter' && searchFlight()}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 16, fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button onClick={searchFlight} disabled={loading || !query.trim()} style={{
              padding: '12px 20px', borderRadius: 10,
              background: query.trim() ? colors.primaryDim : 'transparent',
              border: `1px solid ${query.trim() ? colors.primary : colors.border}`,
              color: query.trim() ? colors.primary : colors.textMuted,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              minHeight: 48, touchAction: 'manipulation',
            }}>{loading ? '...' : 'Track'}</button>
          </div>

          {results && results.map((f, i) => (
            <button key={i} onClick={() => getFlightDetail(f.fa_flight_id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: 16, marginBottom: 8, borderRadius: 12,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              cursor: 'pointer', touchAction: 'manipulation',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: colors.primary, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {f.ident}
                </span>
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: f.status === 'Arrived' ? 'rgba(0,230,118,0.15)' : f.status === 'En Route' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)',
                  color: f.status === 'Arrived' ? colors.success : f.status === 'En Route' ? colors.primary : colors.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{f.status || '—'}</span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                {f.origin?.code_iata || '???'} → {f.destination?.code_iata || '???'}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); trackFlight(f) }} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11,
                  background: 'rgba(0,230,118,0.1)', border: `1px solid ${colors.success}`,
                  color: colors.success, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>+ TRACK</button>
              </div>
            </button>
          ))}

          {results && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: colors.textMuted, fontSize: 14 }}>
              No flights found for "{query}"
            </div>
          )}
        </div>
      )}

      {/* Tracked flights tab */}
      {tab === 'tracked' && (
        <div>
          {trackedFlights.length > 0 && (
            <button onClick={refreshTracked} disabled={loading} style={{
              width: '100%', padding: 12, marginBottom: 12, borderRadius: 10,
              background: colors.primaryDim, border: `1px solid ${colors.primary}`,
              color: colors.primary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Exo 2', sans-serif", minHeight: 44,
            }}>{loading ? 'Refreshing...' : 'Refresh All'}</button>
          )}

          {trackedFlights.map(f => (
            <div key={f.id} style={{
              padding: 16, marginBottom: 8, borderRadius: 12,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: colors.primary, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {f.ident}
                </span>
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  background: f.status === 'Arrived' ? 'rgba(0,230,118,0.15)' : 'rgba(0,212,255,0.1)',
                  color: f.status === 'Arrived' ? colors.success : colors.primary,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{f.status}</span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, marginTop: 4, fontFamily: "'Exo 2', sans-serif" }}>
                {f.origin} → {f.destination}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => window.open(`https://www.flightradar24.com/${f.ident?.replace(/\s/g, '')}`, '_blank')} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(246,190,0,0.08)', border: `1px solid rgba(246,190,0,0.3)`,
                  color: '#f6be00', fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>FR24</button>
                <button onClick={() => removeTracked(f.id)} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'transparent', border: `1px solid ${colors.danger}`,
                  color: colors.danger, fontSize: 11, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Remove</button>
              </div>
            </div>
          ))}

          {trackedFlights.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: colors.textMuted, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
              No tracked flights. Search for a flight and tap "+ TRACK".
            </div>
          )}
        </div>
      )}

      {/* Airport tab */}
      {tab === 'airports' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={airportQuery}
              onChange={e => setAirportQuery(e.target.value)}
              placeholder="Airport code (e.g. LAX, ORD)"
              onKeyDown={e => e.key === 'Enter' && searchAirport()}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 16, fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button onClick={searchAirport} disabled={loading} style={{
              padding: '12px 20px', borderRadius: 10,
              background: airportQuery.trim() ? colors.primaryDim : 'transparent',
              border: `1px solid ${airportQuery.trim() ? colors.primary : colors.border}`,
              color: airportQuery.trim() ? colors.primary : colors.textMuted,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 48,
            }}>{loading ? '...' : 'Search'}</button>
          </div>

          {airportData?.info && (
            <div style={{
              padding: 16, marginBottom: 12, borderRadius: 12,
              background: colors.primaryDim, border: `1px solid ${colors.borderBright}`,
            }}>
              <div style={{ color: colors.primary, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {airportData.info.code_iata || airportData.info.code_icao}
              </div>
              <div style={{ color: colors.text, fontSize: 15, fontFamily: "'Exo 2', sans-serif", marginTop: 4 }}>
                {airportData.info.name}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: "'Exo 2', sans-serif" }}>
                {airportData.info.city}, {airportData.info.state} {airportData.info.country_code}
              </div>
            </div>
          )}

          {airportData?.departures?.length > 0 && (
            <div>
              <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, fontWeight: 600, fontFamily: "'Exo 2', sans-serif" }}>
                DEPARTURES
              </div>
              {airportData.departures.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 12, marginBottom: 4, borderRadius: 8,
                  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                }}>
                  <div>
                    <div style={{ color: colors.primary, fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.ident}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'Exo 2', sans-serif" }}>
                      → {f.destination?.code_iata || '???'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: colors.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.scheduled_out ? new Date(f.scheduled_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                    <div style={{
                      color: f.status === 'En Route' ? colors.success : colors.textMuted,
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                    }}>{f.status || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <button onClick={() => window.open('https://www.flightradar24.com', '_blank')} style={{
          flex: 1, padding: 14, borderRadius: 10,
          background: 'rgba(246,190,0,0.06)', border: `1px solid rgba(246,190,0,0.2)`,
          color: '#f6be00', fontSize: 12, cursor: 'pointer',
          fontFamily: "'Exo 2', sans-serif", minHeight: 44,
        }}>Flightradar24</button>
        <button onClick={() => window.open('https://www.flightaware.com', '_blank')} style={{
          flex: 1, padding: 14, borderRadius: 10,
          background: 'rgba(0,132,200,0.06)', border: '1px solid rgba(0,132,200,0.2)',
          color: '#0084c8', fontSize: 12, cursor: 'pointer',
          fontFamily: "'Exo 2', sans-serif", minHeight: 44,
        }}>FlightAware</button>
      </div>
    </div>
  )
}
