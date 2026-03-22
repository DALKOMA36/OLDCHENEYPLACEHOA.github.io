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

// Helper: seconds to friendly minutes string
function delayToMinutes(seconds) {
  if (seconds == null || seconds === 0) return null
  const mins = Math.round(seconds / 60)
  return mins > 0 ? `+${mins} min` : `${mins} min`
}

// Helper: format gate/terminal string
function formatGateTerminal(gate, terminal) {
  const parts = []
  if (terminal) parts.push(`Terminal ${terminal}`)
  if (gate) parts.push(`Gate ${gate}`)
  return parts.length > 0 ? parts.join(' / ') : null
}

export default function FlightTracker({ user }) {
  const [tab, setTab] = useState('search') // search, tracked, airports, route
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [trackedFlights, setTrackedFlights] = useState(() => loadState('tracked_flights', []))
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [flightMapImg, setFlightMapImg] = useState(null)
  const [airportQuery, setAirportQuery] = useState('')
  const [airportData, setAirportData] = useState(null)
  const [boardType, setBoardType] = useState('departures') // departures, arrivals, scheduled

  // Route search state
  const [routeOrigin, setRouteOrigin] = useState('')
  const [routeDest, setRouteDest] = useState('')
  const [routeResults, setRouteResults] = useState(null)

  // API usage state
  const [showUsage, setShowUsage] = useState(false)
  const [usageData, setUsageData] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)

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
    setLoading(true)
    setError('')
    setFlightMapImg(null)
    try {
      const [flight, track] = await Promise.all([
        aeroFetch(`/flights/${faFlightId}`).catch(() => null),
        aeroFetch(`/flights/${faFlightId}/track`).catch(() => null),
      ])
      const flightData = { ...(flight?.flights?.[0] || {}), track: track?.positions || [] }
      setSelectedFlight(flightData)

      // Fetch flight map in background
      aeroFetch(`/flights/${faFlightId}/map?width=640&height=400&show_airports=true&airports_expand_view=true`)
        .then(mapData => {
          if (mapData?.map) setFlightMapImg(mapData.map)
        })
        .catch(() => {}) // silently ignore map errors
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
      const [info, deps, arrs, schedDeps, weather, delays] = await Promise.all([
        aeroFetch(`/airports/${code}`).catch(() => null),
        aeroFetch(`/airports/${code}/flights/departures`).catch(() => null),
        aeroFetch(`/airports/${code}/flights/arrivals`).catch(() => null),
        aeroFetch(`/airports/${code}/flights/scheduled_departures`).catch(() => null),
        aeroFetch(`/airports/${code}/weather/observations?temperature_units=F`).catch(() => null),
        aeroFetch(`/airports/${code}/delays`).catch(() => null),
      ])
      setAirportData({
        info,
        departures: deps?.departures?.slice(0, 20) || [],
        arrivals: arrs?.arrivals?.slice(0, 20) || [],
        scheduled: schedDeps?.scheduled_departures?.slice(0, 20) || [],
        weather: weather?.observations?.[0] || null,
        delays,
      })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Route search
  const searchRoute = async () => {
    if (!routeOrigin.trim() || !routeDest.trim()) return
    setLoading(true)
    setError('')
    setRouteResults(null)
    try {
      const origin = routeOrigin.trim().toUpperCase()
      const dest = routeDest.trim().toUpperCase()
      const data = await aeroFetch(`/airports/${origin}/flights/to/${dest}`)
      setRouteResults(data.flights || [])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // API Usage
  const fetchUsage = async () => {
    if (usageData) { setShowUsage(!showUsage); return }
    setUsageLoading(true)
    try {
      const data = await aeroFetch('/account/usage')
      setUsageData(data)
      setShowUsage(true)
    } catch {
      setUsageData({ error: true })
      setShowUsage(true)
    }
    setUsageLoading(false)
  }

  // Flight detail view
  if (selectedFlight) {
    const f = selectedFlight
    const depDelay = delayToMinutes(f.departure_delay)
    const arrDelay = delayToMinutes(f.arrival_delay)
    const originGateTerminal = formatGateTerminal(f.gate_origin, f.terminal_origin)
    const destGateTerminal = formatGateTerminal(f.gate_destination, f.terminal_destination)

    // Build info cards array — existing fields + new fields
    const infoCards = [
      ['Origin', f.origin?.name || f.origin?.code || '\u2014', f.origin?.city],
      ['Destination', f.destination?.name || f.destination?.code || '\u2014', f.destination?.city],
      ['Departure', f.actual_out || f.scheduled_out || '\u2014', f.actual_out ? 'Actual' : 'Scheduled'],
      ['Arrival', f.actual_in || f.scheduled_in || '\u2014', f.actual_in ? 'Actual' : 'Estimated'],
      ['Aircraft', f.aircraft_type || '\u2014', f.registration],
      ['Altitude', f.last_position?.altitude ? `${f.last_position.altitude} ft` : '\u2014', null],
      ['Speed', f.last_position?.groundspeed ? `${f.last_position.groundspeed} kts` : '\u2014', null],
    ]

    // New fields from AeroAPI
    if (originGateTerminal) {
      infoCards.push(['Origin Gate', originGateTerminal, null])
    }
    if (destGateTerminal) {
      infoCards.push(['Dest Gate', destGateTerminal, null])
    }
    if (f.baggage_claim) {
      infoCards.push(['Baggage Claim', f.baggage_claim, null])
    }
    if (f.route_distance) {
      infoCards.push(['Route Distance', `${f.route_distance} mi`, null])
    }
    if (f.filed_altitude) {
      infoCards.push(['Filed Altitude', `${f.filed_altitude * 100} ft`, null])
    }

    return (
      <div style={{ padding: 16 }}>
        <button onClick={() => { setSelectedFlight(null); setFlightMapImg(null) }} style={{
          background: 'rgba(0,212,255,0.08)', border: `1px solid ${colors.border}`,
          borderRadius: 10, color: colors.primary, fontSize: 14,
          padding: '10px 16px', marginBottom: 16, cursor: 'pointer',
          minHeight: 44, touchAction: 'manipulation',
          fontFamily: "'Exo 2', sans-serif",
        }}>{'\u2190'} Back</button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            color: colors.primary, fontSize: 28, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{f.ident}</div>
          <div style={{
            color: colors.text, fontSize: 16, marginTop: 8,
            fontFamily: "'Exo 2', sans-serif",
          }}>
            {f.origin?.code_iata || '???'} {'\u2192'} {f.destination?.code_iata || '???'}
          </div>

          {/* Status badge + Diverted/Cancelled badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-block', padding: '6px 16px',
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

            {f.diverted && (
              <div style={{
                display: 'inline-block', padding: '6px 16px',
                background: 'rgba(255,77,77,0.15)',
                border: `1px solid ${colors.danger}`,
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                color: colors.danger,
                fontFamily: "'JetBrains Mono', monospace",
              }}>DIVERTED</div>
            )}

            {f.cancelled && (
              <div style={{
                display: 'inline-block', padding: '6px 16px',
                background: 'rgba(255,77,77,0.15)',
                border: `1px solid ${colors.danger}`,
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                color: colors.danger,
                fontFamily: "'JetBrains Mono', monospace",
              }}>CANCELLED</div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {f.progress_percent != null && (
          <div style={{
            marginBottom: 16, padding: 14, borderRadius: 10,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginBottom: 8,
            }}>
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                PROGRESS
              </span>
              <span style={{ color: colors.primary, fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {f.progress_percent}%
              </span>
            </div>
            <div style={{
              width: '100%', height: 10, borderRadius: 5,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${colors.border}`,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, f.progress_percent))}%`,
                height: '100%', borderRadius: 5,
                background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryLight})`,
                boxShadow: `0 0 8px ${colors.primary}`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Delay indicators */}
        {(depDelay || arrDelay) && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 12,
          }}>
            {depDelay && (
              <div style={{
                flex: 1, padding: 12, borderRadius: 10,
                background: f.departure_delay > 0 ? 'rgba(255,77,77,0.1)' : 'rgba(0,230,118,0.1)',
                border: `1px solid ${f.departure_delay > 0 ? colors.danger : colors.success}`,
              }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
                  DEP DELAY
                </div>
                <div style={{
                  color: f.departure_delay > 0 ? colors.danger : colors.success,
                  fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                }}>{depDelay}</div>
              </div>
            )}
            {arrDelay && (
              <div style={{
                flex: 1, padding: 12, borderRadius: 10,
                background: f.arrival_delay > 0 ? 'rgba(255,77,77,0.1)' : 'rgba(0,230,118,0.1)',
                border: `1px solid ${f.arrival_delay > 0 ? colors.danger : colors.success}`,
              }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
                  ARR DELAY
                </div>
                <div style={{
                  color: f.arrival_delay > 0 ? colors.danger : colors.success,
                  fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                }}>{arrDelay}</div>
              </div>
            )}
          </div>
        )}

        {/* Flight info cards */}
        {infoCards.map(([label, value, sub]) => (
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

        {/* Codeshares */}
        {f.codeshares_iata && f.codeshares_iata.length > 0 && (
          <div style={{
            padding: 14, marginBottom: 6, borderRadius: 10,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          }}>
            <div style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
              CODESHARES
            </div>
            <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
              Also: {f.codeshares_iata.join(', ')}
            </div>
          </div>
        )}

        {/* Flight map */}
        {flightMapImg && (
          <div style={{
            marginTop: 12, marginBottom: 12, borderRadius: 12,
            overflow: 'hidden', border: `1px solid ${colors.border}`,
          }}>
            <div style={{
              padding: '8px 14px', background: colors.surfaceLight,
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                FLIGHT MAP
              </span>
            </div>
            <img
              src={`data:image/png;base64,${flightMapImg}`}
              alt="Flight map"
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        )}

        {/* Track on Flightradar24 */}
        <button onClick={() => window.open(`https://www.flightradar24.com/${f.ident?.replace(/\s/g, '')}`, '_blank')} style={{
          width: '100%', padding: 14, marginTop: 12, borderRadius: 10,
          background: 'rgba(246, 190, 0, 0.08)',
          border: `1px solid rgba(246, 190, 0, 0.3)`,
          color: '#f6be00', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'Exo 2', sans-serif", minHeight: 48,
        }}>View on Flightradar24 {'\u2192'}</button>
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
        {[
          ['search', 'Search'],
          ['tracked', `Tracked (${trackedFlights.length})`],
          ['airports', 'Airport'],
          ['route', 'Route'],
        ].map(([t, label]) => (
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
                }}>{f.status || '\u2014'}</span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                {f.origin?.code_iata || '???'} {'\u2192'} {f.destination?.code_iata || '???'}
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
                {f.origin} {'\u2192'} {f.destination}
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

              {/* Airport weather */}
              {airportData.weather && (
                <div style={{
                  display: 'flex', gap: 16, marginTop: 12, paddingTop: 10,
                  borderTop: `1px solid ${colors.border}`,
                }}>
                  {airportData.weather.temp_air && (
                    <div>
                      <div style={{ color: colors.text, fontSize: 18, fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>
                        {Math.round(airportData.weather.temp_air)}{'\u00B0'}F
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>TEMP</div>
                    </div>
                  )}
                  {airportData.weather.wind_speed && (
                    <div>
                      <div style={{ color: colors.text, fontSize: 18, fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>
                        {airportData.weather.wind_speed}kt
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>WIND</div>
                    </div>
                  )}
                  {airportData.weather.visibility && (
                    <div>
                      <div style={{ color: colors.text, fontSize: 18, fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>
                        {airportData.weather.visibility}mi
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>VIS</div>
                    </div>
                  )}
                  {airportData.weather.cloud_friendly && (
                    <div>
                      <div style={{ color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif" }}>
                        {airportData.weather.cloud_friendly}
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>SKY</div>
                    </div>
                  )}
                </div>
              )}

              {/* Delays */}
              {airportData.delays && (
                <div style={{
                  marginTop: 8, padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(255,190,48,0.1)', border: `1px solid rgba(255,190,48,0.3)`,
                  color: colors.warning, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {airportData.delays.delay_index != null
                    ? `Delay index: ${airportData.delays.delay_index} // ${airportData.delays.delay_index > 3 ? 'Significant delays' : airportData.delays.delay_index > 1 ? 'Minor delays' : 'Running smoothly'}`
                    : 'No delay data'}
                </div>
              )}
            </div>
          )}

          {/* Board type toggle */}
          {airportData?.info && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['departures', 'Departures'], ['arrivals', 'Arrivals'], ['scheduled', 'Scheduled']].map(([t, label]) => (
                <button key={t} onClick={() => setBoardType(t)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8,
                  background: boardType === t ? colors.primaryDim : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${boardType === t ? colors.primary : colors.border}`,
                  color: boardType === t ? colors.primary : colors.textMuted,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'Exo 2', sans-serif", minHeight: 44,
                }}>{label} ({(airportData[t] || []).length})</button>
              ))}
            </div>
          )}

          {(airportData?.[boardType]?.length > 0) && (
            <div>
              {airportData[boardType].map((f, i) => (
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
                      {boardType === 'arrivals'
                        ? `from ${f.origin?.code_iata || '???'}`
                        : `${'\u2192'} ${f.destination?.code_iata || '???'}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: colors.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(f.scheduled_out || f.scheduled_in || f.estimated_out || f.estimated_in)
                        ? new Date(f.scheduled_out || f.scheduled_in || f.estimated_out || f.estimated_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '\u2014'}
                    </div>
                    <div style={{
                      color: f.status === 'En Route' ? colors.success : f.status === 'Arrived' ? colors.primary : colors.textMuted,
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                    }}>{f.status || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Route tab */}
      {tab === 'route' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={routeOrigin}
              onChange={e => setRouteOrigin(e.target.value)}
              placeholder="Origin (e.g. LAX)"
              onKeyDown={e => e.key === 'Enter' && searchRoute()}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 16, fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <input
              value={routeDest}
              onChange={e => setRouteDest(e.target.value)}
              placeholder="Dest (e.g. JFK)"
              onKeyDown={e => e.key === 'Enter' && searchRoute()}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 16, fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button onClick={searchRoute} disabled={loading || !routeOrigin.trim() || !routeDest.trim()} style={{
              padding: '12px 16px', borderRadius: 10,
              background: (routeOrigin.trim() && routeDest.trim()) ? colors.primaryDim : 'transparent',
              border: `1px solid ${(routeOrigin.trim() && routeDest.trim()) ? colors.primary : colors.border}`,
              color: (routeOrigin.trim() && routeDest.trim()) ? colors.primary : colors.textMuted,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              minHeight: 48, touchAction: 'manipulation',
            }}>{loading ? '...' : 'Find'}</button>
          </div>

          {routeResults && routeResults.length > 0 && (
            <div style={{
              marginBottom: 8, padding: '8px 14px', borderRadius: 8,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            }}>
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                {routeResults.length} flight{routeResults.length !== 1 ? 's' : ''} found: {routeOrigin.trim().toUpperCase()} {'\u2192'} {routeDest.trim().toUpperCase()}
              </span>
            </div>
          )}

          {routeResults && routeResults.map((f, i) => (
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
                }}>{f.status || '\u2014'}</span>
              </div>
              <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                {f.origin?.code_iata || '???'} {'\u2192'} {f.destination?.code_iata || '???'}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {(f.scheduled_out || f.estimated_out)
                  ? new Date(f.scheduled_out || f.estimated_out).toLocaleString()
                  : ''}
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

          {routeResults && routeResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: colors.textMuted, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
              No flights found between {routeOrigin.trim().toUpperCase()} and {routeDest.trim().toUpperCase()}
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

      {/* API Usage link */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={fetchUsage} disabled={usageLoading} style={{
          background: 'none', border: 'none',
          color: colors.textMuted, fontSize: 11, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
          textDecoration: 'underline', padding: '8px 12px',
        }}>{usageLoading ? 'Loading...' : 'API Usage'}</button>

        {showUsage && usageData && (
          <div style={{
            marginTop: 8, padding: 12, borderRadius: 10,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            textAlign: 'left',
          }}>
            {usageData.error ? (
              <div style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                Unable to fetch usage data
              </div>
            ) : (
              <>
                <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                  AEROAPI USAGE THIS MONTH
                </div>
                {usageData.total_calls != null && (
                  <div style={{ color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif", marginBottom: 4 }}>
                    Total API calls: <span style={{ color: colors.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{usageData.total_calls?.toLocaleString()}</span>
                  </div>
                )}
                {usageData.total_cost != null && (
                  <div style={{ color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif" }}>
                    Total cost: <span style={{ color: colors.warning, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${usageData.total_cost?.toFixed(2)}</span>
                  </div>
                )}
                {usageData.api_calls_made != null && (
                  <div style={{ color: colors.text, fontSize: 13, fontFamily: "'Exo 2', sans-serif", marginBottom: 4 }}>
                    API calls: <span style={{ color: colors.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{usageData.api_calls_made?.toLocaleString()}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
