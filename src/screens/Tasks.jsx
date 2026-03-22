import { useState, useEffect, useMemo } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

// --- Smart Date Parsing (JARVIS-grade NLP-lite) ---
function parseNaturalDate(str) {
  if (!str || !str.trim()) return null
  const s = str.trim().toLowerCase()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Exact: "today"
  if (s === 'today') return fmtDate(today)

  // "tomorrow"
  if (s === 'tomorrow') {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return fmtDate(d)
  }

  // "yesterday" (edge case, but useful)
  if (s === 'yesterday') {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return fmtDate(d)
  }

  // "in N days/weeks"
  const inMatch = s.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/)
  if (inMatch) {
    const n = parseInt(inMatch[1], 10)
    const unit = inMatch[2].startsWith('week') ? 7 : 1
    const d = new Date(today)
    d.setDate(d.getDate() + n * unit)
    return fmtDate(d)
  }

  // "next week" (next Monday)
  if (s === 'next week') {
    const d = new Date(today)
    const dayOfWeek = d.getDay()
    const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek)
    d.setDate(d.getDate() + daysUntilMon)
    return fmtDate(d)
  }

  // "next <dayname>" e.g. "next friday"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const nextDayMatch = s.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[1])
    const d = new Date(today)
    const currentDay = d.getDay()
    let diff = targetDay - currentDay
    if (diff <= 0) diff += 7
    d.setDate(d.getDate() + diff)
    return fmtDate(d)
  }

  // "next month"
  if (s === 'next month') {
    const d = new Date(today)
    d.setMonth(d.getMonth() + 1, 1)
    return fmtDate(d)
  }

  // "end of week" (this coming Sunday)
  if (s === 'end of week' || s === 'eow') {
    const d = new Date(today)
    const daysUntilSun = (7 - d.getDay()) % 7 || 7
    d.setDate(d.getDate() + daysUntilSun)
    return fmtDate(d)
  }

  return null
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function friendlyDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// --- Component ---
export default function Tasks({ user, addMemory }) {
  const [tasks, setTasks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created') // created, due, priority, alpha
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedSubtasks, setExpandedSubtasks] = useState(new Set())
  const [newSubtaskText, setNewSubtaskText] = useState({})
  const [dueDateInput, setDueDateInput] = useState('')
  const [newTask, setNewTask] = useState({
    title: '', priority: 'medium', assignee: '', dueDate: '', recurring: false, category: 'personal', subtasks: []
  })
  const [newTaskSubtaskInput, setNewTaskSubtaskInput] = useState('')

  // Load tasks
  useEffect(() => {
    let cancelled = false
    db.tasks.list()
      .then(data => {
        if (!cancelled) {
          // Ensure subtasks array exists on all tasks
          const normalized = data.map(t => ({ ...t, subtasks: t.subtasks || [] }))
          setTasks(normalized)
        }
      })
      .catch(() => {
        if (!cancelled) {
          const loaded = loadState('tasks', [])
          setTasks(loaded.map(t => ({ ...t, subtasks: t.subtasks || [] })))
        }
      })
    return () => { cancelled = true }
  }, [])

  // Smart date parsing hint
  const parsedDateHint = useMemo(() => {
    const parsed = parseNaturalDate(dueDateInput)
    if (parsed) return friendlyDate(parsed)
    return null
  }, [dueDateInput])

  // --- Task CRUD ---
  const addTask = async () => {
    if (!newTask.title.trim()) return
    const resolvedDate = parseNaturalDate(newTask.dueDate) || newTask.dueDate
    const taskData = {
      ...newTask,
      dueDate: resolvedDate,
      subtasks: newTask.subtasks || [],
      completed: false,
      createdAt: new Date().toISOString()
    }
    try {
      const created = await db.tasks.create(taskData)
      const updated = [{ ...created, subtasks: created.subtasks || taskData.subtasks }, ...tasks]
      setTasks(updated)
      saveState('tasks', updated)
    } catch {
      const task = { ...taskData, id: Date.now() }
      const updated = [task, ...tasks]
      setTasks(updated)
      saveState('tasks', updated)
    }
    addMemory(`Added task: ${newTask.title}${newTask.assignee ? ` (assigned to ${newTask.assignee})` : ''}`)
    setNewTask({ title: '', priority: 'medium', assignee: '', dueDate: '', recurring: false, category: 'personal', subtasks: [] })
    setDueDateInput('')
    setNewTaskSubtaskInput('')
    setShowAdd(false)
  }

  const toggle = async (id) => {
    const target = tasks.find(t => t.id === id)
    if (!target) return
    const toggled = { ...target, completed: !target.completed }
    const updated = tasks.map(t => t.id === id ? toggled : t)
    setTasks(updated)
    try {
      await db.tasks.update(toggled)
      saveState('tasks', updated)
    } catch {
      saveState('tasks', updated)
    }
  }

  const deleteTask = async (id) => {
    const updated = tasks.filter(t => t.id !== id)
    setTasks(updated)
    try {
      await db.tasks.delete(id)
      saveState('tasks', updated)
    } catch {
      saveState('tasks', updated)
    }
  }

  // --- Subtask Operations ---
  const addSubtask = (taskId, text) => {
    if (!text.trim()) return
    const updated = tasks.map(t => {
      if (t.id !== taskId) return t
      const subtasks = [...(t.subtasks || []), { id: Date.now(), text: text.trim(), done: false }]
      return { ...t, subtasks }
    })
    setTasks(updated)
    saveState('tasks', updated)
    const target = updated.find(t => t.id === taskId)
    if (target) {
      try { db.tasks.update(target) } catch {}
    }
  }

  const toggleSubtask = (taskId, subtaskId) => {
    const updated = tasks.map(t => {
      if (t.id !== taskId) return t
      const subtasks = (t.subtasks || []).map(s =>
        s.id === subtaskId ? { ...s, done: !s.done } : s
      )
      return { ...t, subtasks }
    })
    setTasks(updated)
    saveState('tasks', updated)
    const target = updated.find(t => t.id === taskId)
    if (target) {
      try { db.tasks.update(target) } catch {}
    }
  }

  const deleteSubtask = (taskId, subtaskId) => {
    const updated = tasks.map(t => {
      if (t.id !== taskId) return t
      const subtasks = (t.subtasks || []).filter(s => s.id !== subtaskId)
      return { ...t, subtasks }
    })
    setTasks(updated)
    saveState('tasks', updated)
    const target = updated.find(t => t.id === taskId)
    if (target) {
      try { db.tasks.update(target) } catch {}
    }
  }

  // --- Bulk Actions ---
  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map(t => t.id)))
  }

  const bulkComplete = async () => {
    const updated = tasks.map(t =>
      selectedIds.has(t.id) ? { ...t, completed: true } : t
    )
    setTasks(updated)
    saveState('tasks', updated)
    for (const id of selectedIds) {
      const t = updated.find(x => x.id === id)
      if (t) { try { await db.tasks.update(t) } catch {} }
    }
    setSelectedIds(new Set())
    setSelectionMode(false)
  }

  const bulkDelete = async () => {
    const updated = tasks.filter(t => !selectedIds.has(t.id))
    setTasks(updated)
    saveState('tasks', updated)
    for (const id of selectedIds) {
      try { await db.tasks.delete(id) } catch {}
    }
    setSelectedIds(new Set())
    setSelectionMode(false)
  }

  // --- Filtering ---
  const filtered = useMemo(() => {
    let list = tasks.filter(t => {
      if (filter === 'pending') return !t.completed
      if (filter === 'completed') return t.completed
      if (filter === 'delegated') return !!t.assignee
      return true
    })

    // Sorting
    const priorityWeight = { high: 0, medium: 1, low: 2 }
    list = [...list].sort((a, b) => {
      if (sortBy === 'due') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      if (sortBy === 'priority') {
        return (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1)
      }
      if (sortBy === 'alpha') {
        return (a.title || '').localeCompare(b.title || '')
      }
      // Default: created (newest first)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })

    return list
  }, [tasks, filter, sortBy])

  const pendingCount = tasks.filter(t => !t.completed).length
  const completedCount = tasks.filter(t => t.completed).length

  const priorityColors = { high: colors.danger, medium: colors.warning, low: colors.success }

  return (
    <div style={{ padding: 16, paddingBottom: selectionMode ? 80 : 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>
          Tasks
          <span style={{ color: colors.primary, fontSize: 12, fontWeight: 400, marginLeft: 8, letterSpacing: 1 }}>
            JARVIS v4.0
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }} style={{
            padding: '10px 14px', background: selectionMode ? colors.primaryDim : colors.surfaceLight,
            color: selectionMode ? colors.primary : colors.textSecondary,
            border: `1px solid ${selectionMode ? colors.primary : colors.border}`,
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>{selectionMode ? 'Cancel' : 'Select'}</button>
          <button onClick={() => setShowAdd(true)} style={{
            padding: '12px 16px', background: colors.gradient1, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>+ Task</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          [pendingCount, 'Pending', colors.warning],
          [completedCount, 'Done', colors.success],
          [tasks.filter(t => !!t.assignee).length, 'Delegated', colors.primary],
        ].map(([n, l, c]) => (
          <div key={l} style={{
            flex: 1, padding: '14px 10px', background: `${c}15`, border: `1px solid ${c}30`,
            borderRadius: 10, textAlign: 'center',
          }}>
            <div style={{ color: c, fontSize: 20, fontWeight: 700 }}>{n}</div>
            <div style={{ color: colors.textSecondary, fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters + Sort */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', alignItems: 'center' }}>
        {['all', 'pending', 'completed', 'delegated'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '10px 16px', background: filter === f ? colors.primary : colors.surfaceLight,
            border: `1px solid ${filter === f ? colors.primary : colors.border}`,
            borderRadius: 20, color: filter === f ? '#fff' : colors.textSecondary,
            fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 44,
            textTransform: 'capitalize',
          }}>{f}</button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '10px 12px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              borderRadius: 8, color: colors.textSecondary, fontSize: 12, fontFamily: 'inherit', minHeight: 44,
              cursor: 'pointer', appearance: 'auto',
            }}
          >
            <option value="created">Newest First</option>
            <option value="due">Due Date</option>
            <option value="priority">Priority</option>
            <option value="alpha">A-Z</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
          {filter === 'all' ? 'No tasks yet. Tap "+ Task" to create one.' : `No ${filter} tasks.`}
        </div>
      ) : (
        filtered.map(t => {
          const subs = t.subtasks || []
          const subsDone = subs.filter(s => s.done).length
          const isExpanded = expandedSubtasks.has(t.id)

          return (
            <div key={t.id} style={{
              background: colors.surfaceLight,
              border: `1px solid ${selectedIds.has(t.id) ? colors.primary : colors.border}`,
              borderRadius: 10, marginBottom: 10, opacity: t.completed ? 0.6 : 1,
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
              }}>
                {/* Selection checkbox */}
                {selectionMode && (
                  <button onClick={() => toggleSelection(t.id)} style={{
                    width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 2,
                    background: selectedIds.has(t.id) ? colors.primary : 'transparent',
                    border: `2px solid ${selectedIds.has(t.id) ? colors.primary : colors.textMuted}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, padding: 0,
                  }}>
                    {selectedIds.has(t.id) && '\u2713'}
                  </button>
                )}

                {/* Toggle complete */}
                <button onClick={() => toggle(t.id)} style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  background: t.completed ? colors.success : 'transparent',
                  border: `2px solid ${t.completed ? colors.success : colors.textMuted}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, padding: 0,
                }}>
                  {t.completed && '\u2713'}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: colors.text, fontSize: 14, fontWeight: 500,
                    textDecoration: t.completed ? 'line-through' : 'none',
                  }}>{t.title}</div>

                  {/* Tags row */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: `${priorityColors[t.priority]}22`, color: priorityColors[t.priority],
                    }}>{t.priority}</span>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: `${colors.primary}22`, color: colors.primaryLight,
                    }}>{t.category}</span>
                    {t.assignee && (
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: `${colors.secondary}22`, color: colors.secondary,
                      }}>{'\u2192'} {t.assignee}</span>
                    )}
                    {t.dueDate && (
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: `${colors.warning}22`, color: colors.warning,
                      }}>{t.dueDate}</span>
                    )}
                    {t.recurring && (
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: `${colors.accent}22`, color: colors.accent,
                      }}>{'\u21BB'} Recurring</span>
                    )}
                    {subs.length > 0 && (
                      <button onClick={() => {
                        setExpandedSubtasks(prev => {
                          const next = new Set(prev)
                          if (next.has(t.id)) next.delete(t.id)
                          else next.add(t.id)
                          return next
                        })
                      }} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6,
                        background: subsDone === subs.length ? `${colors.success}22` : `${colors.primary}15`,
                        color: subsDone === subs.length ? colors.success : colors.primaryLight,
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      }}>
                        {subsDone}/{subs.length} done {isExpanded ? '\u25B4' : '\u25BE'}
                      </button>
                    )}
                  </div>
                </div>

                <button onClick={() => deleteTask(t.id)} style={{
                  background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 14, padding: 4,
                }}>{'\u2715'}</button>
              </div>

              {/* Subtasks Panel */}
              {(isExpanded || subs.length === 0) && isExpanded && (
                <div style={{
                  padding: '0 14px 12px 50px',
                  borderTop: `1px solid ${colors.border}`,
                  marginTop: -2, paddingTop: 10,
                }}>
                  {subs.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    }}>
                      <button onClick={() => toggleSubtask(t.id, s.id)} style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        background: s.done ? colors.success : 'transparent',
                        border: `1.5px solid ${s.done ? colors.success : colors.textMuted}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 9, padding: 0,
                      }}>
                        {s.done && '\u2713'}
                      </button>
                      <span style={{
                        flex: 1, fontSize: 12, color: s.done ? colors.textMuted : colors.textSecondary,
                        textDecoration: s.done ? 'line-through' : 'none',
                      }}>{s.text}</span>
                      <button onClick={() => deleteSubtask(t.id, s.id)} style={{
                        background: 'none', border: 'none', color: colors.textMuted,
                        cursor: 'pointer', fontSize: 11, padding: 2, opacity: 0.6,
                      }}>{'\u2715'}</button>
                    </div>
                  ))}
                  {/* Add subtask inline */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      value={newSubtaskText[t.id] || ''}
                      onChange={e => setNewSubtaskText({ ...newSubtaskText, [t.id]: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addSubtask(t.id, newSubtaskText[t.id] || '')
                          setNewSubtaskText({ ...newSubtaskText, [t.id]: '' })
                        }
                      }}
                      placeholder="Add subtask..."
                      style={{
                        flex: 1, padding: '6px 10px', background: colors.surface,
                        border: `1px solid ${colors.border}`, borderRadius: 6,
                        color: colors.text, fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={() => {
                      addSubtask(t.id, newSubtaskText[t.id] || '')
                      setNewSubtaskText({ ...newSubtaskText, [t.id]: '' })
                    }} style={{
                      padding: '6px 10px', background: colors.primaryDim, border: `1px solid ${colors.primary}40`,
                      borderRadius: 6, color: colors.primary, fontSize: 11, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 600,
                    }}>+</button>
                  </div>
                </div>
              )}

              {/* Show expand button if subtasks=0 but task exists (add subtasks) */}
              {subs.length === 0 && !isExpanded && (
                <button onClick={() => {
                  setExpandedSubtasks(prev => {
                    const next = new Set(prev)
                    next.add(t.id)
                    return next
                  })
                }} style={{
                  display: 'block', width: '100%', padding: '10px 14px',
                  background: 'transparent', border: 'none', borderTop: `1px solid ${colors.border}`,
                  color: colors.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                  textAlign: 'left', paddingLeft: 50,
                }}>+ Add subtasks</button>
              )}

              {/* Inline add for tasks with no subtasks yet (when expanded) */}
              {subs.length === 0 && isExpanded && (
                <div style={{
                  padding: '8px 14px 12px 50px',
                  borderTop: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newSubtaskText[t.id] || ''}
                      onChange={e => setNewSubtaskText({ ...newSubtaskText, [t.id]: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addSubtask(t.id, newSubtaskText[t.id] || '')
                          setNewSubtaskText({ ...newSubtaskText, [t.id]: '' })
                        }
                      }}
                      placeholder="Add subtask..."
                      style={{
                        flex: 1, padding: '6px 10px', background: colors.surface,
                        border: `1px solid ${colors.border}`, borderRadius: 6,
                        color: colors.text, fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={() => {
                      addSubtask(t.id, newSubtaskText[t.id] || '')
                      setNewSubtaskText({ ...newSubtaskText, [t.id]: '' })
                    }} style={{
                      padding: '6px 10px', background: colors.primaryDim, border: `1px solid ${colors.primary}40`,
                      borderRadius: 6, color: colors.primary, fontSize: 11, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 600,
                    }}>+</button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Delegation Info */}
      <div style={{
        marginTop: 16, padding: 14, background: `${colors.secondary}10`, border: `1px solid ${colors.secondary}25`,
        borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ color: colors.secondary, fontSize: 16, flexShrink: 0 }}>{'\u22B6'}</span>
        <div>
          <div style={{ color: colors.secondary, fontSize: 13, fontWeight: 600 }}>DELEGATION</div>
          <div style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
            Assign tasks to circle members. They'll get notified via SMS even if they don't use the app.
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: colors.surface, borderTop: `1px solid ${colors.border}`,
          padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
          zIndex: 100, boxShadow: `0 -4px 20px rgba(0,0,0,0.4)`,
          backdropFilter: 'blur(12px)',
        }}>
          <span style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600, marginRight: 'auto' }}>
            {selectedIds.size} selected
          </span>
          <button onClick={selectAll} style={{
            padding: '8px 14px', background: colors.primaryDim, border: `1px solid ${colors.primary}40`,
            borderRadius: 8, color: colors.primary, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Select All</button>
          <button onClick={bulkComplete} style={{
            padding: '8px 14px', background: `${colors.success}20`, border: `1px solid ${colors.success}40`,
            borderRadius: 8, color: colors.success, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Complete</button>
          <button onClick={bulkDelete} style={{
            padding: '8px 14px', background: `${colors.danger}20`, border: `1px solid ${colors.danger}40`,
            borderRadius: 8, color: colors.danger, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Delete</button>
        </div>
      )}

      {/* Add Task Modal */}
      {showAdd && (
        <div style={modalOverlay} onClick={() => setShowAdd(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New Task</h3>
            <input
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="What needs to be done?"
              style={inputStyle}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
              <select value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="family">Family</option>
                <option value="home">Home</option>
              </select>
            </div>
            <input
              value={newTask.assignee}
              onChange={e => setNewTask({ ...newTask, assignee: e.target.value })}
              placeholder="Assign to (name or phone)"
              style={inputStyle}
            />

            {/* Smart Date Input */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={dueDateInput}
                onChange={e => {
                  setDueDateInput(e.target.value)
                  const parsed = parseNaturalDate(e.target.value)
                  if (parsed) {
                    setNewTask({ ...newTask, dueDate: parsed })
                  } else {
                    setNewTask({ ...newTask, dueDate: e.target.value })
                  }
                }}
                placeholder='Due date: "tomorrow", "next friday", "in 3 days", or YYYY-MM-DD'
                style={{
                  ...inputStyle, marginBottom: 0,
                  paddingRight: parsedDateHint ? 120 : 14,
                }}
              />
              {parsedDateHint && (
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, color: colors.primary, fontWeight: 600,
                  background: colors.primaryDim, padding: '2px 8px', borderRadius: 4,
                  pointerEvents: 'none',
                }}>
                  {parsedDateHint}
                </span>
              )}
            </div>

            {/* Subtasks in new task */}
            <div style={{
              marginBottom: 10, padding: 10, background: colors.surface,
              border: `1px solid ${colors.border}`, borderRadius: 10,
            }}>
              <div style={{ color: colors.textSecondary, fontSize: 13, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                SUBTASKS
              </div>
              {(newTask.subtasks || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: colors.textMuted, fontSize: 12 }}>{'\u2022'}</span>
                  <span style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}>{s.text}</span>
                  <button onClick={() => {
                    const updated = [...newTask.subtasks]
                    updated.splice(i, 1)
                    setNewTask({ ...newTask, subtasks: updated })
                  }} style={{
                    background: 'none', border: 'none', color: colors.textMuted,
                    cursor: 'pointer', fontSize: 10, padding: 2,
                  }}>{'\u2715'}</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newTaskSubtaskInput}
                  onChange={e => setNewTaskSubtaskInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTaskSubtaskInput.trim()) {
                      setNewTask({
                        ...newTask,
                        subtasks: [...(newTask.subtasks || []), { id: Date.now(), text: newTaskSubtaskInput.trim(), done: false }]
                      })
                      setNewTaskSubtaskInput('')
                    }
                  }}
                  placeholder="Add a subtask..."
                  style={{
                    flex: 1, padding: '6px 10px', background: colors.surfaceLight,
                    border: `1px solid ${colors.border}`, borderRadius: 6,
                    color: colors.text, fontSize: 12, fontFamily: 'inherit',
                  }}
                />
                <button onClick={() => {
                  if (newTaskSubtaskInput.trim()) {
                    setNewTask({
                      ...newTask,
                      subtasks: [...(newTask.subtasks || []), { id: Date.now(), text: newTaskSubtaskInput.trim(), done: false }]
                    })
                    setNewTaskSubtaskInput('')
                  }
                }} style={{
                  padding: '6px 10px', background: colors.primaryDim, border: `1px solid ${colors.primary}40`,
                  borderRadius: 6, color: colors.primary, fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 600,
                }}>+</button>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textSecondary, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={newTask.recurring} onChange={e => setNewTask({ ...newTask, recurring: e.target.checked })} />
              Recurring task
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...actionBtn, background: colors.surfaceLight, color: colors.textSecondary }}>Cancel</button>
              <button onClick={addTask} style={{ ...actionBtn, background: colors.gradient1, color: '#fff' }}>Add Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
}
const modalContent = {
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
  border: `1px solid ${colors.border}`, maxHeight: '85vh', overflowY: 'auto',
}
const inputStyle = {
  width: '100%', padding: '12px 14px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
