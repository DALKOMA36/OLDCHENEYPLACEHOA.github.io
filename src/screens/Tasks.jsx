import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

export default function Tasks({ user, addMemory }) {
  const [tasks, setTasks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all') // all, pending, completed, delegated
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', assignee: '', dueDate: '', recurring: false, category: 'personal' })

  // Load tasks from D1 on mount, fall back to localStorage
  useEffect(() => {
    let cancelled = false
    db.tasks.list()
      .then(data => { if (!cancelled) setTasks(data) })
      .catch(() => { if (!cancelled) setTasks(loadState('tasks', [])) })
    return () => { cancelled = true }
  }, [])

  const addTask = async () => {
    if (!newTask.title.trim()) return
    const taskData = { ...newTask, completed: false, createdAt: new Date().toISOString() }
    try {
      const created = await db.tasks.create(taskData)
      const updated = [created, ...tasks]
      setTasks(updated)
      saveState('tasks', updated)
    } catch {
      // Fallback: create locally with timestamp id
      const task = { ...taskData, id: Date.now() }
      const updated = [task, ...tasks]
      setTasks(updated)
      saveState('tasks', updated)
    }
    addMemory(`Added task: ${newTask.title}${newTask.assignee ? ` (assigned to ${newTask.assignee})` : ''}`)
    setNewTask({ title: '', priority: 'medium', assignee: '', dueDate: '', recurring: false, category: 'personal' })
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

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return !t.completed
    if (filter === 'completed') return t.completed
    if (filter === 'delegated') return !!t.assignee
    return true
  })

  const pendingCount = tasks.filter(t => !t.completed).length
  const completedCount = tasks.filter(t => t.completed).length

  const priorityColors = { high: colors.danger, medium: colors.warning, low: colors.success }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Tasks</h2>
        <button onClick={() => setShowAdd(true)} style={{
          padding: '8px 16px', background: colors.gradient1, color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Task</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          [pendingCount, 'Pending', colors.warning],
          [completedCount, 'Done', colors.success],
          [tasks.filter(t => !!t.assignee).length, 'Delegated', colors.primary],
        ].map(([n, l, c]) => (
          <div key={l} style={{
            flex: 1, padding: '12px 8px', background: `${c}15`, border: `1px solid ${c}30`,
            borderRadius: 10, textAlign: 'center',
          }}>
            <div style={{ color: c, fontSize: 20, fontWeight: 700 }}>{n}</div>
            <div style={{ color: colors.textSecondary, fontSize: 10 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {['all', 'pending', 'completed', 'delegated'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', background: filter === f ? colors.primary : colors.surfaceLight,
            border: `1px solid ${filter === f ? colors.primary : colors.border}`,
            borderRadius: 20, color: filter === f ? '#fff' : colors.textSecondary,
            fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
          {filter === 'all' ? 'No tasks yet. Tap "+ Task" to create one.' : `No ${filter} tasks.`}
        </div>
      ) : (
        filtered.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
            background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            borderRadius: 10, marginBottom: 8, opacity: t.completed ? 0.6 : 1,
          }}>
            <button onClick={() => toggle(t.id)} style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
              background: t.completed ? colors.success : 'transparent',
              border: `2px solid ${t.completed ? colors.success : colors.textMuted}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12,
            }}>
              {t.completed && '✓'}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{
                color: colors.text, fontSize: 14, fontWeight: 500,
                textDecoration: t.completed ? 'line-through' : 'none',
              }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 6,
                  background: `${priorityColors[t.priority]}22`, color: priorityColors[t.priority],
                }}>{t.priority}</span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 6,
                  background: `${colors.primary}22`, color: colors.primaryLight,
                }}>{t.category}</span>
                {t.assignee && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 6,
                    background: `${colors.secondary}22`, color: colors.secondary,
                  }}>→ {t.assignee}</span>
                )}
                {t.dueDate && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 6,
                    background: `${colors.warning}22`, color: colors.warning,
                  }}>{t.dueDate}</span>
                )}
                {t.recurring && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 6,
                    background: `${colors.accent}22`, color: colors.accent,
                  }}>↻ Recurring</span>
                )}
              </div>
            </div>
            <button onClick={() => deleteTask(t.id)} style={{
              background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 14, padding: 4,
            }}>✕</button>
          </div>
        ))
      )}

      {/* Delegation Info */}
      <div style={{
        marginTop: 16, padding: 14, background: `${colors.secondary}10`, border: `1px solid ${colors.secondary}25`,
        borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ color: colors.secondary, fontSize: 16, flexShrink: 0 }}>⊶</span>
        <div>
          <div style={{ color: colors.secondary, fontSize: 11, fontWeight: 600 }}>DELEGATION</div>
          <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            Assign tasks to circle members. They'll get notified via SMS even if they don't use the app.
          </div>
        </div>
      </div>

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
            <input
              type="date"
              value={newTask.dueDate}
              onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
              style={inputStyle}
            />
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
  background: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
  border: `1px solid ${colors.border}`,
}
const inputStyle = {
  width: '100%', padding: '12px 14px', background: colors.surfaceLight,
  border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text,
  fontSize: 14, fontFamily: 'inherit', marginBottom: 10,
}
const actionBtn = {
  flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
