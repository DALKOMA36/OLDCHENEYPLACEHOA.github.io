import { useState, useEffect, useCallback } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const API_BASE = 'https://api-v3.amtraker.com/v3/trains'

const CZ_STATIONS = [
  { code: 'CHI', name: 'Chicago Union' },
  { code: 'NPV', name: 'Naperville' },
  { code: 'PRM', name: 'Princeton' },
  { code: 'GAL', name: 'Galesburg' },
  { code: 'BUR', name: 'Burlington' },
  { code: 'MTL', name: 'Mt. Pleasant' },
  { code: 'OTM', name: 'Ottumwa' },
  { code: 'OSC', name: 'Osceola' },
  { code: 'CRX', name: 'Creston' },
  { code: 'OMH', name: 'Omaha' },
  { code: 'LNK', name: 'Lincoln' },
  { code: 'HAS', name: 'Hastings' },
  { code: 'HOL', name: 'Holdrege' },
  { code: 'MCK', name: 'McCook' },
  { code: 'FMG', name: 'Fort Morgan' },
  { code: 'DEN', name: 'Denver Union' },
  { code: 'FRC', name: 'Fraser' },
  { code: 'GWS', name: 'Granby' },
  { code: 'GSC', name: 'Glenwood Springs' },
  { code: 'GJT', name: 'Grand Junction' },
  { code: 'GRR', name: 'Green River' },
  { code: 'HEL', name: 'Helper' },
  { code: 'PRC', name: 'Provo' },
  { code: 'SLC', name: 'Salt Lake City' },
  { code: 'EVS', name: 'Elko' },
  { code: 'WND', name: 'Winnemucca' },
  { code: 'RNO', name: 'Reno' },
  { code: 'TRU', name: 'Truckee' },
  { code: 'COL', name: 'Colfax' },
  { code: 'SAC', name: 'Sacramento' },
  { code: 'DAV', name: 'Davis' },
  { code: 'MTZ', name: 'Martinez' },
  { code: 'RIC', name: 'Richmond' },
  { code: 'EMY', name: 'Emeryville' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DEFAULT_SCHEDULE = [
  { id: 1, train: '6', direction: 'eastbound', boardStation: 'LNK', days: ['Mon', 'Wed', 'Fri'], note: 'Arrives LNK ~2 days after leaving EMY' },
  { id: 2, train: '5', direction: 'westbound', boardStation: 'OTM', exitStation: 'LNK', days: ['Mon', 'Wed', 'Fri'], note: 'Originates that day out of CHI headed west' },
]

function parseDelay(schTime, actTime) {
  if (!schTime || !actTime) return null
  const sch = new Date(schTime).getTime()
  const act = new Date(actTime).getTime()
  return Math.round((act - sch) / 60000)
}

function formatTime(isoStr) {
  if (!isoStr) return '--'
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch { return '--' }
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch { return '' }
}

function delayColor(mins) {
  if (mins === null || mins === undefined) return colors.textMuted
  if (mins <= 0) return colors.success
  if (mins <= 15) return colors.success
  if (mins <= 30) return colors.warning
  if (mins <= 60) return '#e67e22'
  return colors.danger
}

function delayText(mins) {
  if (mins === null || mins === undefined) return ''
  if (mins <= 0) return 'On time'
  if (mins < 60) return `${mins}m late`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m late` : `${h}h late`
}

export default function TrainTracker({ user, addMemory }) {
  const [trains, setTrains] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [schedule, setSchedule] = useState(() => loadState('trainSchedule', DEFAULT_SCHEDULE))
  const [view, setView] = useState('status') // status, schedule
  const [expandedTrain, setExpandedTrain] = useState(null)
  const [showEditSchedule, setShowEditSchedule] = useState(false)
  const [editItem, setEditItem] = useState(null)

  useEffect(() => {
    db.trains.list().then(data => {
      if (data.length > 0) { setSchedule(data); saveState('trainSchedule', data) }
    }).catch(() => {})
  }, [])

  const saveSchedule = (s) => {
    setSchedule(s)
    saveState('trainSchedule', s)
    // Sync to D1 - delete all then re-add
    Promise.all(s.map(item => {
      if (item._new) { delete item._new; return db.trains.add(item).catch(() => {}) }
      return db.trains.update(item).catch(() => {})
    })).catch(() => {})
  }

  const fetchTrains = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [res5, res6] = await Promise.all([
        fetch(`${API_BASE}/5`),
        fetch(`${API_BASE}/6`),
      ])
      if (!res5.ok || !res6.ok) throw new Error('API error')
      const [data5, data6] = await Promise.all([res5.json(), res6.json()])

      const parsed = {}
      // The API returns { "5": [...], "6": [...] }
      if (data5['5']) {
        parsed['5'] = data5['5']
      }
      if (data6['6']) {
        parsed['6'] = data6['6']
      }
      setTrains(parsed)
      setLastFetch(new Date())
    } catch (err) {
      setError(err.message || 'Failed to fetch train data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrains()
    const interval = setInterval(fetchTrains, 120000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [fetchTrains])

  const todayDay = DAYS[new Date().getDay()]
  const todaySchedule = schedule.filter(s => s.days.includes(todayDay))

  const getStationFromTrain = (trainData, stationCode) => {
    if (!trainData?.stations) return null
    return Object.values(trainData.stations).find(s => s.code === stationCode)
  }

  const findStation = (trainInstances, stationCode) => {
    if (!trainInstances || !Array.isArray(trainInstances)) return null
    for (const inst of trainInstances) {
      if (inst.stations) {
        // stations can be an array or object
        const stationList = Array.isArray(inst.stations) ? inst.stations : Object.values(inst.stations)
        const found = stationList.find(s => s.code === stationCode)
        if (found) return { station: found, train: inst }
      }
    }
    return null
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Train Tracker</h2>
        <button onClick={fetchTrains} disabled={loading} style={{
          padding: '6px 14px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          borderRadius: 8, color: colors.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 16 }}>
        Live California Zephyr status via Amtraker
        {lastFetch && <span style={{ color: colors.textMuted }}> · Updated {lastFetch.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
      </p>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['status', 'Live Status'], ['schedule', 'My Schedule']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '10px 8px', background: view === v ? colors.primary : colors.surfaceLight,
            border: `1px solid ${view === v ? colors.primary : colors.border}`,
            borderRadius: 10, color: view === v ? '#fff' : colors.textSecondary,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{label}</button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 14, background: `${colors.danger}15`, border: `1px solid ${colors.danger}30`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ color: colors.danger, fontSize: 13 }}>Failed to load train data: {error}</div>
          <button onClick={fetchTrains} style={{ marginTop: 8, padding: '6px 14px', background: colors.danger, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
        </div>
      )}

      {view === 'status' && (
        <>
          {/* Today's Work Banner */}
          {todaySchedule.length > 0 && (
            <div style={{
              padding: 14, background: `${colors.primary}12`, border: `1px solid ${colors.primary}30`,
              borderRadius: 12, marginBottom: 16,
            }}>
              <div style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>YOUR TRAINS TODAY ({todayDay})</div>
              {todaySchedule.map(s => {
                const trainInstances = trains[s.train]
                const result = findStation(trainInstances, s.boardStation)
                const delay = result?.station ? parseDelay(result.station.schArr, result.station.arr) : null
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: `1px solid ${colors.primary}20`,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: s.direction === 'westbound' ? `${colors.secondary}20` : `${colors.accent}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: s.direction === 'westbound' ? colors.secondary : colors.accent,
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>#{s.train}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>
                        {s.direction === 'westbound' ? '← West' : 'East →'} · Board at {s.boardStation}
                        {s.exitStation ? ` → ${s.exitStation}` : ''}
                      </div>
                      {result?.station ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: colors.textSecondary }}>
                            Sched: {formatTime(result.station.schArr)}
                          </span>
                          {result.station.arr && (
                            <span style={{ fontSize: 11, color: colors.textSecondary }}>
                              Actual: {formatTime(result.station.arr)}
                            </span>
                          )}
                          {delay !== null && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: delayColor(delay) }}>
                              {delayText(delay)}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: colors.textMuted }}>
                            {result.station.status || ''}
                          </span>
                        </div>
                      ) : (
                        <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
                          {loading ? 'Loading...' : 'No data available'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Train #5 and #6 Live Status */}
          {['5', '6'].map(num => {
            const instances = trains[num]
            if (!instances || instances.length === 0) {
              return (
                <div key={num} style={{
                  padding: 16, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 12, marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: colors.text, fontSize: 16, fontWeight: 700 }}>#{num}</span>
                    <span style={{ color: colors.textSecondary, fontSize: 13 }}>California Zephyr {num === '5' ? '(Westbound)' : '(Eastbound)'}</span>
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                    {loading ? 'Loading...' : 'No active train data'}
                  </div>
                </div>
              )
            }

            return instances.map((inst, idx) => {
              const isExpanded = expandedTrain === `${num}-${idx}`
              const stationList = inst.stations ? (Array.isArray(inst.stations) ? inst.stations : Object.values(inst.stations)) : []

              // Find current/next station
              const enrouteIdx = stationList.findIndex(s => s.status === 'Enroute')
              const currentStation = enrouteIdx >= 0 ? stationList[enrouteIdx] : stationList.find(s => s.status === 'Station')
              const lastDeparted = [...stationList].reverse().find(s => s.status === 'Departed')

              // Compute overall delay from the latest station with actual times
              const latestWithActual = [...stationList].reverse().find(s => s.arr || s.dep)
              const overallDelay = latestWithActual ? parseDelay(latestWithActual.schArr || latestWithActual.schDep, latestWithActual.arr || latestWithActual.dep) : null

              return (
                <div key={`${num}-${idx}`} style={{
                  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 12, marginBottom: 12, overflow: 'hidden',
                }}>
                  {/* Train Header */}
                  <button onClick={() => setExpandedTrain(isExpanded ? null : `${num}-${idx}`)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 16,
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: num === '5' ? `${colors.secondary}20` : `${colors.accent}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{
                        color: num === '5' ? colors.secondary : colors.accent,
                        fontSize: 18, fontWeight: 700,
                      }}>#{num}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: colors.text, fontSize: 15, fontWeight: 600 }}>
                          California Zephyr {num === '5' ? '← West' : 'East →'}
                        </span>
                        {inst.trainState === 'Active' && (
                          <span style={{
                            width: 8, height: 8, borderRadius: 4,
                            background: overallDelay !== null && overallDelay > 30 ? colors.danger : colors.success,
                          }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ color: colors.textSecondary, fontSize: 11 }}>
                          {inst.origCode} → {inst.destCode}
                        </span>
                        {currentStation && (
                          <span style={{ color: colors.primaryLight, fontSize: 11 }}>
                            {currentStation.status === 'Enroute' ? 'En route to' : 'At'} {currentStation.name}
                          </span>
                        )}
                        {overallDelay !== null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: delayColor(overallDelay) }}>
                            {delayText(overallDelay)}
                          </span>
                        )}
                      </div>
                      {inst.velocity > 0 && (
                        <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                          {Math.round(inst.velocity)} mph · Heading {inst.heading}
                        </div>
                      )}
                    </div>
                    <span style={{ color: colors.textMuted, fontSize: 18 }}>{isExpanded ? '▾' : '▸'}</span>
                  </button>

                  {/* Expanded Station List */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${colors.border}`, padding: '8px 0' }}>
                      {/* Highlight my stations */}
                      {schedule.filter(s => s.train === num).length > 0 && (
                        <div style={{ padding: '4px 16px 8px', color: colors.primaryLight, fontSize: 10, fontWeight: 600 }}>
                          Your stations are highlighted
                        </div>
                      )}
                      {stationList.map((station, si) => {
                        const delay = parseDelay(station.schArr, station.arr)
                        const isMyStation = schedule.some(s => s.train === num && (s.boardStation === station.code || s.exitStation === station.code))
                        const isDeparted = station.status === 'Departed'
                        const isEnroute = station.status === 'Enroute'
                        const isAtStation = station.status === 'Station'

                        return (
                          <div key={si} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 16px',
                            background: isMyStation ? `${colors.primary}12` : 'transparent',
                            borderLeft: isMyStation ? `3px solid ${colors.primary}` : '3px solid transparent',
                            opacity: isDeparted ? 0.5 : 1,
                          }}>
                            {/* Status dot */}
                            <div style={{ marginTop: 4, flexShrink: 0 }}>
                              <span style={{
                                display: 'block', width: 10, height: 10, borderRadius: 5,
                                background: isEnroute ? colors.warning :
                                  isAtStation ? colors.success :
                                  isDeparted ? colors.textMuted : colors.border,
                                boxShadow: isEnroute ? `0 0 6px ${colors.warning}` : 'none',
                              }} />
                            </div>
                            {/* Station info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  color: isMyStation ? colors.primaryLight : colors.text,
                                  fontSize: 13, fontWeight: isMyStation ? 600 : 400,
                                }}>{station.name}</span>
                                <span style={{ color: colors.textMuted, fontSize: 10 }}>({station.code})</span>
                                {isMyStation && (
                                  <span style={{
                                    fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                    background: `${colors.primary}30`, color: colors.primaryLight,
                                  }}>YOU</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                                {station.schArr && (
                                  <span style={{ color: colors.textMuted, fontSize: 10 }}>
                                    Sched: {formatTime(station.schArr)}
                                  </span>
                                )}
                                {station.arr && (
                                  <span style={{ color: colors.textSecondary, fontSize: 10 }}>
                                    Actual: {formatTime(station.arr)}
                                  </span>
                                )}
                                {station.dep && station.dep !== station.arr && (
                                  <span style={{ color: colors.textSecondary, fontSize: 10 }}>
                                    Dep: {formatTime(station.dep)}
                                  </span>
                                )}
                                {delay !== null && (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: delayColor(delay) }}>
                                    {delayText(delay)}
                                  </span>
                                )}
                              </div>
                              {(station.arrCmnt || station.depCmnt) && (
                                <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                                  {station.arrCmnt || station.depCmnt}
                                </div>
                              )}
                            </div>
                            {/* Status label */}
                            <span style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                              background: isEnroute ? `${colors.warning}20` :
                                isAtStation ? `${colors.success}20` :
                                isDeparted ? `${colors.textMuted}15` : `${colors.border}20`,
                              color: isEnroute ? colors.warning :
                                isAtStation ? colors.success :
                                isDeparted ? colors.textMuted : colors.textMuted,
                            }}>{station.status || 'Scheduled'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          })}

          {/* CZ Tracker Link */}
          <div style={{
            padding: 14, background: `${colors.secondary}10`, border: `1px solid ${colors.secondary}25`,
            borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center', marginTop: 8,
          }}>
            <span style={{ color: colors.secondary, fontSize: 16 }}>◉</span>
            <div>
              <div style={{ color: colors.secondary, fontSize: 11, fontWeight: 600 }}>DATA SOURCE</div>
              <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Live data from Amtraker API (same source as cz-tracker.com). Auto-refreshes every 2 minutes.
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'schedule' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>MY WORK SCHEDULE</h3>
              <button onClick={() => {
                setEditItem({ id: Date.now(), train: '6', direction: 'eastbound', boardStation: 'LNK', exitStation: '', days: [], note: '' })
                setShowEditSchedule(true)
              }} style={{
                padding: '6px 14px', background: colors.gradient1, color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>+ Add</button>
            </div>

            <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 16 }}>
              Set which trains you work and when. Jarvis will highlight your stations and show relevant delays.
            </p>

            {schedule.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
                No schedule set. Tap "+ Add" to add your train assignments.
              </div>
            ) : (
              schedule.map(item => (
                <div key={item.id} style={{
                  padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 10, marginBottom: 8,
                  borderLeft: `3px solid ${item.train === '5' ? colors.secondary : colors.accent}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          color: item.train === '5' ? colors.secondary : colors.accent,
                          fontSize: 16, fontWeight: 700,
                        }}>#{item.train}</span>
                        <span style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>
                          {item.direction === 'westbound' ? '← Westbound' : 'Eastbound →'}
                        </span>
                      </div>
                      <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                        Board at <strong style={{ color: colors.primaryLight }}>{item.boardStation}</strong>
                        {item.exitStation && <> → Exit at <strong style={{ color: colors.primaryLight }}>{item.exitStation}</strong></>}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        {DAYS.map(d => (
                          <span key={d} style={{
                            padding: '3px 7px', borderRadius: 4, fontSize: 10,
                            background: item.days.includes(d) ? `${colors.primary}30` : 'transparent',
                            color: item.days.includes(d) ? colors.primaryLight : colors.textMuted,
                            border: `1px solid ${item.days.includes(d) ? colors.primary + '50' : colors.border}`,
                          }}>{d}</span>
                        ))}
                      </div>
                      {item.note && (
                        <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>{item.note}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => { setEditItem({ ...item }); setShowEditSchedule(true) }} style={iconBtn}>✎</button>
                      <button onClick={() => saveSchedule(schedule.filter(s => s.id !== item.id))} style={{ ...iconBtn, color: colors.danger }}>✕</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Info */}
          <div style={{
            padding: 14, background: `${colors.warning}10`, border: `1px solid ${colors.warning}25`,
            borderRadius: 10,
          }}>
            <div style={{ color: colors.warning, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>SCHEDULE INFO</div>
            <div style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
              #6 (Eastbound): EMY → CHI. Usually departs Emeryville and arrives LNK ~2 days later.{'\n'}
              #5 (Westbound): CHI → EMY. Departs Chicago and passes through OTM/LNK same day.
            </div>
          </div>
        </>
      )}

      {/* Edit Schedule Modal */}
      {showEditSchedule && editItem && (
        <div style={modalOverlay} onClick={() => setShowEditSchedule(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              {schedule.find(s => s.id === editItem.id) ? 'Edit' : 'Add'} Train Assignment
            </h3>

            <label style={labelStyle}>Train Number</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['5', '6'].map(n => (
                <button key={n} onClick={() => setEditItem({
                  ...editItem, train: n,
                  direction: n === '5' ? 'westbound' : 'eastbound',
                })} style={{
                  flex: 1, padding: '10px 8px',
                  background: editItem.train === n ? (n === '5' ? `${colors.secondary}30` : `${colors.accent}30`) : colors.surfaceLight,
                  border: `1px solid ${editItem.train === n ? (n === '5' ? colors.secondary : colors.accent) : colors.border}`,
                  borderRadius: 8, color: editItem.train === n ? '#fff' : colors.textSecondary,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>#{n} {n === '5' ? '← West' : 'East →'}</button>
              ))}
            </div>

            <label style={labelStyle}>Board Station</label>
            <select value={editItem.boardStation} onChange={e => setEditItem({ ...editItem, boardStation: e.target.value })} style={inputStyle}>
              {CZ_STATIONS.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
            </select>

            <label style={labelStyle}>Exit Station (optional)</label>
            <select value={editItem.exitStation || ''} onChange={e => setEditItem({ ...editItem, exitStation: e.target.value })} style={inputStyle}>
              <option value="">-- None --</option>
              {CZ_STATIONS.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
            </select>

            <label style={labelStyle}>Days</label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
              {DAYS.map(d => (
                <button key={d} onClick={() => {
                  const days = editItem.days.includes(d) ? editItem.days.filter(x => x !== d) : [...editItem.days, d]
                  setEditItem({ ...editItem, days })
                }} style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: editItem.days.includes(d) ? colors.primary : colors.surfaceLight,
                  border: `1px solid ${editItem.days.includes(d) ? colors.primary : colors.border}`,
                  color: editItem.days.includes(d) ? '#fff' : colors.textSecondary,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}>{d}</button>
              ))}
            </div>

            <label style={labelStyle}>Note (optional)</label>
            <input value={editItem.note || ''} onChange={e => setEditItem({ ...editItem, note: e.target.value })}
              placeholder="e.g., Usually arrives 2 days after leaving EMY" style={inputStyle} />

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowEditSchedule(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={() => {
                const existing = schedule.find(s => s.id === editItem.id)
                if (existing) {
                  saveSchedule(schedule.map(s => s.id === editItem.id ? editItem : s))
                } else {
                  saveSchedule([...schedule, editItem])
                }
                addMemory(`Updated train schedule: #${editItem.train} at ${editItem.boardStation} on ${editItem.days.join(', ')}`)
                setShowEditSchedule(false)
              }} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 6, background: colors.surfaceHover,
  border: `1px solid ${colors.border}`, color: colors.textSecondary, fontSize: 12,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const labelStyle = { color: colors.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block' }
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
  border: `1px solid ${colors.border}`, maxHeight: '85vh', overflowY: 'auto',
}
const inputStyle = {
  width: '100%', padding: '10px 12px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text,
  fontSize: 13, fontFamily: 'inherit', marginBottom: 12,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
