import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const TEMPLATES = [
  {
    name: 'Expense Tracker',
    icon: '💰',
    desc: 'Track spending and budgets',
    fields: [
      { label: 'Amount', type: 'number' },
      { label: 'Category', type: 'select', options: ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other'] },
      { label: 'Description', type: 'text' },
      { label: 'Date', type: 'date' },
    ],
  },
  {
    name: 'Habit Tracker',
    icon: '✅',
    desc: 'Build and track daily habits',
    fields: [
      { label: 'Habit Name', type: 'text' },
      { label: 'Frequency', type: 'select', options: ['Daily', 'Weekdays', 'Weekly', 'Custom'] },
      { label: 'Time of Day', type: 'select', options: ['Morning', 'Afternoon', 'Evening', 'Anytime'] },
    ],
  },
  {
    name: 'Workout Log',
    icon: '💪',
    desc: 'Log exercises and progress',
    fields: [
      { label: 'Exercise', type: 'text' },
      { label: 'Sets', type: 'number' },
      { label: 'Reps', type: 'number' },
      { label: 'Weight (lbs)', type: 'number' },
      { label: 'Notes', type: 'text' },
    ],
  },
  {
    name: 'Reading List',
    icon: '📚',
    desc: 'Track books and reading progress',
    fields: [
      { label: 'Title', type: 'text' },
      { label: 'Author', type: 'text' },
      { label: 'Status', type: 'select', options: ['Want to Read', 'Reading', 'Finished'] },
      { label: 'Rating', type: 'select', options: ['1', '2', '3', '4', '5'] },
    ],
  },
  {
    name: 'Pet Care',
    icon: '🐕',
    desc: 'Track pet care and vet visits',
    fields: [
      { label: 'Pet Name', type: 'text' },
      { label: 'Activity', type: 'select', options: ['Feeding', 'Walk', 'Vet Visit', 'Grooming', 'Medicine'] },
      { label: 'Notes', type: 'text' },
      { label: 'Date', type: 'date' },
    ],
  },
  {
    name: 'Custom App',
    icon: '⬡',
    desc: 'Build anything you want with AI',
    fields: [],
  },
]

export default function AppBuilder({ user, addMemory }) {
  const [apps, setApps] = useState(() => loadState('customApps', []))
  const [building, setBuilding] = useState(false)
  const [activeApp, setActiveApp] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [appName, setAppName] = useState('')
  const [entries, setEntries] = useState({})

  useEffect(() => {
    db.apps.list().then(data => {
      if (data.length > 0) { setApps(data); saveState('customApps', data) }
    }).catch(() => {})
  }, [])

  const save = (a) => { setApps(a); saveState('customApps', a) }

  const createApp = (template) => {
    const app = {
      id: Date.now(),
      name: appName || template.name,
      icon: template.icon,
      fields: template.fields,
      entries: [],
      createdAt: new Date().toISOString(),
    }
    save([app, ...apps])
    setActiveApp(app)
    setBuilding(false)
    setAppName('')
    setSelectedTemplate(null)
    addMemory(`Created app: ${app.name}`)
  }

  const addEntry = (appId) => {
    const app = apps.find(a => a.id === appId)
    if (!app) return
    const entry = { id: Date.now(), data: { ...entries }, createdAt: new Date().toISOString() }
    const updated = apps.map(a => a.id === appId ? { ...a, entries: [entry, ...a.entries] } : a)
    save(updated)
    setActiveApp(updated.find(a => a.id === appId))
    setEntries({})
  }

  const deleteApp = (id) => {
    save(apps.filter(a => a.id !== id))
    setActiveApp(null)
  }

  const deleteEntry = (appId, entryId) => {
    const updated = apps.map(a => a.id === appId
      ? { ...a, entries: a.entries.filter(e => e.id !== entryId) }
      : a)
    save(updated)
    setActiveApp(updated.find(a => a.id === appId))
    db.apps.deleteEntry(entryId).catch(() => {})
  }

  const [editingEntry, setEditingEntry] = useState(null)
  const [searchEntries, setSearchEntries] = useState('')

  const saveEditEntry = (appId) => {
    if (!editingEntry) return
    const updated = apps.map(a => a.id === appId
      ? { ...a, entries: a.entries.map(e => e.id === editingEntry.id ? editingEntry : e) }
      : a)
    save(updated)
    setActiveApp(updated.find(a => a.id === appId))
    setEditingEntry(null)
  }

  const exportCSV = (app) => {
    if (!app.entries.length) return
    const fields = app.fields.map(f => f.label)
    const header = [...fields, 'Date'].join(',')
    const rows = app.entries.map(e =>
      [...fields.map(f => `"${(e.data[f] || '').replace(/"/g, '""')}"`), e.createdAt].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${app.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (activeApp) {
    const app = apps.find(a => a.id === activeApp.id) || activeApp
    const filteredEntries = searchEntries
      ? app.entries.filter(e => Object.values(e.data).some(v => String(v).toLowerCase().includes(searchEntries.toLowerCase())))
      : app.entries

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button onClick={() => { setActiveApp(null); setSearchEntries('') }} style={{
            background: 'none', border: 'none', color: colors.primary, fontSize: 11,
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>← BACK</button>
          <button onClick={() => exportCSV(app)} style={{
            background: 'none', border: `1px solid ${colors.border}`, color: colors.textMuted,
            fontSize: 8, cursor: 'pointer', padding: '3px 8px',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>EXPORT CSV</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>{app.icon}</span>
          <div>
            <h2 style={{ color: colors.text, fontSize: 18, fontWeight: 700, fontFamily: "'Exo 2', sans-serif" }}>{app.name}</h2>
            <span style={{ color: colors.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{app.entries.length} entries</span>
          </div>
        </div>

        {/* Add Entry Form */}
        <div style={{
          padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
          marginBottom: 14,
        }}>
          <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 10 }}>ADD ENTRY</div>
          {app.fields.map(field => (
            <div key={field.label} style={{ marginBottom: 8 }}>
              <label style={{ color: colors.textMuted, fontSize: 9, marginBottom: 3, display: 'block', fontFamily: "'JetBrains Mono', monospace" }}>{field.label}</label>
              {field.type === 'select' ? (
                <select
                  value={entries[field.label] || ''}
                  onChange={e => setEntries({ ...entries, [field.label]: e.target.value })}
                  style={{ ...inputStyle, borderRadius: 0 }}
                >
                  <option value="">Select...</option>
                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={entries[field.label] || ''}
                  onChange={e => setEntries({ ...entries, [field.label]: e.target.value })}
                  placeholder={field.label}
                  style={{ ...inputStyle, borderRadius: 0 }}
                />
              )}
            </div>
          ))}
          <button onClick={() => addEntry(app.id)} style={{
            width: '100%', padding: 10, background: colors.primaryDim,
            border: `1px solid ${colors.primary}`, color: colors.primary,
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2,
          }}>ADD ENTRY</button>
        </div>

        {/* Search entries */}
        {app.entries.length > 3 && (
          <input
            value={searchEntries}
            onChange={e => setSearchEntries(e.target.value)}
            placeholder="Search entries..."
            style={{ ...inputStyle, borderRadius: 0, marginBottom: 10 }}
          />
        )}

        {/* Entries List */}
        {filteredEntries.length > 0 && (
          <div>
            <div style={{ color: colors.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 8 }}>
              ENTRIES {searchEntries && `(${filteredEntries.length} of ${app.entries.length})`}
            </div>
            {filteredEntries.map(entry => (
              <div key={entry.id} style={{
                padding: 10, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                marginBottom: 4,
              }}>
                {editingEntry?.id === entry.id ? (
                  <div>
                    {app.fields.map(field => (
                      <div key={field.label} style={{ marginBottom: 6 }}>
                        <label style={{ color: colors.textMuted, fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>{field.label}</label>
                        <input
                          value={editingEntry.data[field.label] || ''}
                          onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, [field.label]: e.target.value } })}
                          style={{ ...inputStyle, borderRadius: 0, padding: '6px 10px', fontSize: 12 }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => saveEditEntry(app.id)} style={{ ...tinyBtn, color: colors.success, borderColor: colors.success }}>SAVE</button>
                      <button onClick={() => setEditingEntry(null)} style={tinyBtn}>CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {Object.entries(entry.data).filter(([_, v]) => v).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                        <span style={{ color: colors.textMuted, fontSize: 10, minWidth: 60, fontFamily: "'JetBrains Mono', monospace" }}>{key}:</span>
                        <span style={{ color: colors.text, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>{val}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ color: colors.textMuted, fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setEditingEntry({ ...entry })} style={tinyBtn}>EDIT</button>
                        <button onClick={() => deleteEntry(app.id, entry.id)} style={{ ...tinyBtn, color: colors.danger }}>DEL</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button onClick={() => deleteApp(app.id)} style={{
          width: '100%', padding: 10, background: 'transparent', border: `1px solid ${colors.danger}`,
          color: colors.danger, fontSize: 10, cursor: 'pointer', marginTop: 16,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>DELETE APP</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>App Builder</h2>
        <span style={{ fontSize: 9, color: colors.accent, background: `${colors.accent}22`, padding: '3px 8px', borderRadius: 8, fontWeight: 600 }}>NEW</span>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
        Create custom mini-apps for anything. Track expenses, habits, workouts, or anything else.
      </p>

      {/* Your Apps */}
      {apps.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>YOUR APPS</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {apps.map(app => (
              <button key={app.id} onClick={() => setActiveApp(app)} style={{
                padding: 16, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 24 }}>{app.icon}</span>
                <div style={{ color: colors.text, fontSize: 13, fontWeight: 600, marginTop: 6 }}>{app.name}</div>
                <div style={{ color: colors.textSecondary, fontSize: 11 }}>{app.entries.length} entries</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      <h3 style={{ color: colors.text, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {apps.length > 0 ? 'CREATE NEW' : 'CHOOSE A TEMPLATE'}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {TEMPLATES.map(template => (
          <button
            key={template.name}
            onClick={() => { setSelectedTemplate(template); setBuilding(true); setAppName(template.name) }}
            style={{
              padding: 16, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 24 }}>{template.icon}</span>
            <div style={{ color: colors.text, fontSize: 13, fontWeight: 600, marginTop: 6 }}>{template.name}</div>
            <div style={{ color: colors.textSecondary, fontSize: 11 }}>{template.desc}</div>
          </button>
        ))}
      </div>

      {/* AI Build Prompt */}
      <div style={{
        marginTop: 20, padding: 14, background: `${colors.primary}10`,
        border: `1px solid ${colors.primary}25`, borderRadius: 10,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: colors.primary }}>◉</span>
          <span style={{ color: colors.primaryLight, fontSize: 11, fontWeight: 600 }}>AI APP GENERATOR</span>
        </div>
        <div style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
          Describe any app you want and AI will build it for you. "Build me a wine journal" or "I need a chore chart for the kids."
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Describe your app..."
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <button onClick={async () => {
            if (customPrompt.trim()) {
              try {
                const result = await db.ai.appBuilder(customPrompt.trim())
                if (result.name && result.fields && !result.error) {
                  setSelectedTemplate({ ...result, desc: customPrompt })
                  setAppName(result.name)
                } else {
                  setSelectedTemplate({ name: customPrompt.trim().slice(0, 30), icon: '⬡', desc: customPrompt, fields: [
                    { label: 'Name', type: 'text' }, { label: 'Details', type: 'text' },
                    { label: 'Date', type: 'date' }, { label: 'Status', type: 'select', options: ['Active', 'Done', 'Archived'] },
                  ]})
                  setAppName(customPrompt.trim().slice(0, 30))
                }
              } catch {
                setSelectedTemplate({ name: customPrompt.trim().slice(0, 30), icon: '⬡', desc: customPrompt, fields: [
                  { label: 'Name', type: 'text' }, { label: 'Details', type: 'text' },
                  { label: 'Date', type: 'date' }, { label: 'Status', type: 'select', options: ['Active', 'Done', 'Archived'] },
                ]})
                setAppName(customPrompt.trim().slice(0, 30))
              }
              setBuilding(true)
              setCustomPrompt('')
            }
          }} style={{
            padding: '0 16px', background: colors.gradient1, color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer',
          }}>Build</button>
        </div>
      </div>

      {/* Build Modal */}
      {building && selectedTemplate && (
        <div style={modalOverlay} onClick={() => setBuilding(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{selectedTemplate.icon}</span>
              <h3 style={{ color: colors.text, fontSize: 20, fontWeight: 600, marginTop: 8 }}>Create App</h3>
            </div>
            <input
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="App name"
              style={inputStyle}
              autoFocus
            />
            <div style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Fields: {selectedTemplate.fields.map(f => f.label).join(', ') || 'Custom'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBuilding(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={() => createApp(selectedTemplate)} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Create App</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px 14px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10,
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
  border: `1px solid ${colors.border}`,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const tinyBtn = {
  padding: '3px 8px', fontSize: 8, cursor: 'pointer',
  background: 'transparent', border: `1px solid ${colors.border}`,
  color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace",
}
