import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const CATEGORIES = [
  { id: 'food', name: 'Food & Dining', color: '#f0a500', icon: 'FD' },
  { id: 'transport', name: 'Transport', color: '#00d4ff', icon: 'TR' },
  { id: 'housing', name: 'Housing', color: '#bb86fc', icon: 'HO' },
  { id: 'utilities', name: 'Utilities', color: '#48dbfb', icon: 'UT' },
  { id: 'health', name: 'Health', color: '#00e676', icon: 'HL' },
  { id: 'shopping', name: 'Shopping', color: '#ff6b9d', icon: 'SH' },
  { id: 'entertainment', name: 'Entertainment', color: '#feca57', icon: 'EN' },
  { id: 'income', name: 'Income', color: '#00e676', icon: 'IN' },
  { id: 'other', name: 'Other', color: '#6b7d8e', icon: 'OT' },
]

function getMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`
}

export default function Finance({ user }) {
  const [transactions, setTransactions] = useState(() => loadState('finance_txns', []))
  const [budgets, setBudgets] = useState(() => loadState('finance_budgets', {}))
  const [showAdd, setShowAdd] = useState(false)
  const [view, setView] = useState('overview') // overview, transactions, budget
  const [month, setMonth] = useState(getMonthStr())

  // Form state
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState('food')
  const [isIncome, setIsIncome] = useState(false)

  useEffect(() => { saveState('finance_txns', transactions) }, [transactions])
  useEffect(() => { saveState('finance_budgets', budgets) }, [budgets])

  // Load from D1
  useEffect(() => {
    db.finance.transactions().then(rows => { if (rows?.length) setTransactions(rows) }).catch(() => {})
    db.finance.budgets().then(rows => {
      if (rows?.length) {
        const b = {}
        rows.forEach(r => { b[r.category] = r.amount })
        setBudgets(b)
      }
    }).catch(() => {})
  }, [])

  const addTransaction = () => {
    if (!amount || isNaN(parseFloat(amount))) return
    const txn = {
      id: Date.now().toString(),
      amount: isIncome ? Math.abs(parseFloat(amount)) : -Math.abs(parseFloat(amount)),
      description: desc || (isIncome ? 'Income' : CATEGORIES.find(c => c.id === category)?.name),
      category: isIncome ? 'income' : category,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setTransactions(prev => [txn, ...prev])
    db.finance.addTransaction(txn).catch(() => {})
    setAmount('')
    setDesc('')
    setShowAdd(false)
  }

  const deleteTransaction = (id) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
    db.finance.deleteTransaction(id).catch(() => {})
  }

  const setBudget = (catId, value) => {
    const amt = parseFloat(value) || 0
    setBudgets(prev => ({ ...prev, [catId]: amt }))
    db.finance.setBudget({ category: catId, amount: amt }).catch(() => {})
  }

  // Compute monthly stats
  const monthTxns = transactions.filter(t => t.date.startsWith(month))
  const totalIncome = monthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalExpense = monthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const netFlow = totalIncome - totalExpense

  // Category breakdown
  const catSpend = {}
  monthTxns.filter(t => t.amount < 0).forEach(t => {
    catSpend[t.category] = (catSpend[t.category] || 0) + Math.abs(t.amount)
  })

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{
          color: colors.primary, fontSize: 13, fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>Finance</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={linkBtn}>
          {showAdd ? 'CANCEL' : '+ ADD'}
        </button>
      </div>
      <p style={{
        color: colors.textMuted, fontSize: 12, marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>{monthLabel} // Track spending. Stay sharp.</p>

      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => {
          const d = new Date(month + '-01')
          d.setMonth(d.getMonth() - 1)
          setMonth(getMonthStr(d))
        }} style={navBtn}>&lt;</button>
        <span style={{ color: colors.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", flex: 1, textAlign: 'center' }}>
          {monthLabel.toUpperCase()}
        </span>
        <button onClick={() => {
          const d = new Date(month + '-01')
          d.setMonth(d.getMonth() + 1)
          setMonth(getMonthStr(d))
        }} style={navBtn}>&gt;</button>
      </div>

      {/* Overview stats */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, padding: 16, borderRadius: 10,
        background: colors.gradient1, border: `1px solid ${colors.borderBright}`,
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 300, color: colors.success, fontFamily: "'Rajdhani', sans-serif" }}>
            {formatMoney(totalIncome)}
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>INCOME</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 300, color: colors.danger, fontFamily: "'Rajdhani', sans-serif" }}>
            {formatMoney(totalExpense)}
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>SPENT</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            fontSize: 20, fontWeight: 300, fontFamily: "'Rajdhani', sans-serif",
            color: netFlow >= 0 ? colors.success : colors.danger,
          }}>
            {netFlow >= 0 ? '+' : '-'}{formatMoney(netFlow)}
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>NET</div>
        </div>
      </div>

      {/* Quick add */}
      {showAdd && (
        <div style={{
          padding: 14, marginBottom: 16,
          border: `1px solid ${colors.border}`, background: colors.surfaceLight,
        }}>
          {/* Income/Expense toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {[[false, 'EXPENSE'], [true, 'INCOME']].map(([val, label]) => (
              <button key={label} onClick={() => setIsIncome(val)} style={{
                flex: 1, padding: '10px 0', fontSize: 11, minHeight: 44,
                background: isIncome === val ? (val ? 'rgba(0,230,118,0.15)' : 'rgba(255,77,77,0.15)') : 'transparent',
                color: isIncome === val ? (val ? colors.success : colors.danger) : colors.textMuted,
                border: 'none', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="$ Amount"
              type="number"
              step="0.01"
              autoFocus
              style={{
                width: 100, padding: '8px 12px',
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 16, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Description"
              onKeyDown={e => e.key === 'Enter' && addTransaction()}
              style={{
                flex: 1, padding: '12px 14px', minHeight: 44, borderRadius: 8,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif",
              }}
            />
          </div>

          {!isIncome && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {CATEGORIES.filter(c => c.id !== 'income').map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} style={{
                  padding: '8px 12px', fontSize: 11, minHeight: 36, borderRadius: 8,
                  background: category === c.id ? c.color + '20' : 'transparent',
                  border: `1px solid ${category === c.id ? c.color : colors.border}`,
                  color: category === c.id ? c.color : colors.textMuted,
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}>{c.name}</button>
              ))}
            </div>
          )}

          <button onClick={addTransaction} disabled={!amount} style={{
            width: '100%', padding: '12px 16px', minHeight: 44, borderRadius: 8,
            background: amount ? (isIncome ? 'rgba(0,230,118,0.15)' : colors.primaryDim) : 'transparent',
            border: `1px solid ${amount ? (isIncome ? colors.success : colors.primary) : colors.border}`,
            color: amount ? (isIncome ? colors.success : colors.primary) : colors.textMuted,
            fontSize: 12, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>LOG {isIncome ? 'INCOME' : 'EXPENSE'}</button>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[['overview', 'BREAKDOWN'], ['transactions', 'HISTORY'], ['budget', 'BUDGETS']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '10px 0', fontSize: 11, minHeight: 44,
            background: view === v ? colors.primaryDim : 'transparent',
            color: view === v ? colors.primary : colors.textMuted,
            border: 'none', borderBottom: view === v ? `1px solid ${colors.primary}` : '1px solid transparent',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
          }}>{label}</button>
        ))}
      </div>

      {/* Category breakdown view */}
      {view === 'overview' && (
        <div>
          {CATEGORIES.filter(c => c.id !== 'income' && catSpend[c.id]).sort((a, b) => (catSpend[b.id] || 0) - (catSpend[a.id] || 0)).map(cat => {
            const spent = catSpend[cat.id] || 0
            const budget = budgets[cat.id] || 0
            const pct = totalExpense > 0 ? Math.round((spent / totalExpense) * 100) : 0
            const overBudget = budget > 0 && spent > budget

            return (
              <div key={cat.id} style={{
                padding: 16, marginBottom: 10, borderRadius: 10,
                background: colors.surfaceLight, border: `1px solid ${overBudget ? colors.danger + '60' : colors.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      color: cat.color, fontSize: 10, fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{cat.icon}</span>
                    <span style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                      {cat.name}
                    </span>
                  </div>
                  <span style={{
                    color: overBudget ? colors.danger : colors.text, fontSize: 13, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{formatMoney(spent)}</span>
                </div>
                {/* Bar */}
                <div style={{ width: '100%', height: 4, background: colors.border, borderRadius: 2 }}>
                  <div style={{
                    width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 2,
                    background: cat.color,
                  }} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', marginTop: 4,
                  color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                }}>
                  <span>{pct}% of spending</span>
                  {budget > 0 && <span style={{ color: overBudget ? colors.danger : colors.success }}>
                    {overBudget ? 'OVER' : 'UNDER'} BUDGET ({formatMoney(budget)})
                  </span>}
                </div>
              </div>
            )
          })}
          {/* Donut Chart */}
          {Object.keys(catSpend).length > 0 && (() => {
            const spendCats = CATEGORIES.filter(c => c.id !== 'income' && catSpend[c.id])
              .sort((a, b) => (catSpend[b.id] || 0) - (catSpend[a.id] || 0))
            const total = spendCats.reduce((s, c) => s + (catSpend[c.id] || 0), 0)
            const cx = 50, cy = 50, r = 36, stroke = 12
            let cumAngle = -90 // start from top
            const slices = spendCats.map(cat => {
              const val = catSpend[cat.id] || 0
              const angle = (val / total) * 360
              const startAngle = cumAngle
              cumAngle += angle
              const endAngle = cumAngle
              const startRad = (Math.PI / 180) * startAngle
              const endRad = (Math.PI / 180) * endAngle
              const x1 = cx + r * Math.cos(startRad)
              const y1 = cy + r * Math.sin(startRad)
              const x2 = cx + r * Math.cos(endRad)
              const y2 = cy + r * Math.sin(endRad)
              const largeArc = angle > 180 ? 1 : 0
              const d = spendCats.length === 1
                ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx + r - 0.001} ${cy}`
                : `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
              return { d, color: cat.color, name: cat.name, val, pct: Math.round((val / total) * 100) }
            })
            return (
              <div style={{
                padding: 16, marginTop: 12, borderRadius: 10,
                background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              }}>
                <div style={{
                  color: colors.textMuted, fontSize: 11, marginBottom: 12,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                }}>SPENDING DISTRIBUTION</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <svg viewBox="0 0 100 100" width="120" height="120" style={{ flexShrink: 0 }}>
                    {slices.map((s, i) => (
                      <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={stroke}
                        strokeLinecap="butt" opacity="0.85" />
                    ))}
                    <text x={cx} y={cy - 4} textAnchor="middle" fill={colors.text}
                      fontSize="11" fontFamily="Rajdhani, sans-serif" fontWeight="300">
                      {formatMoney(total)}
                    </text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fill={colors.textMuted}
                      fontSize="5" fontFamily="JetBrains Mono, monospace">
                      TOTAL
                    </text>
                  </svg>
                  <div style={{ flex: 1 }}>
                    {slices.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                        <span style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "'Exo 2', sans-serif", flex: 1 }}>
                          {s.name}
                        </span>
                        <span style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          {s.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
          {Object.keys(catSpend).length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: colors.textMuted, fontSize: 12, fontFamily: "'Exo 2', sans-serif" }}>
              No expenses this month. Clean slate.
            </div>
          )}
        </div>
      )}

      {/* Transaction history */}
      {view === 'transactions' && (
        <div>
          {monthTxns.map(txn => {
            const cat = CATEGORIES.find(c => c.id === txn.category)
            return (
              <div key={txn.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', marginBottom: 10, borderRadius: 10,
                background: colors.surfaceLight, border: `1px solid ${colors.border}`,
              }}>
                <span style={{
                  color: cat?.color || colors.textMuted, fontSize: 10, fontWeight: 600, width: 20,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{cat?.icon || '??'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif" }}>
                    {txn.description}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {txn.date} {txn.time}
                  </div>
                </div>
                <span style={{
                  color: txn.amount >= 0 ? colors.success : colors.text, fontSize: 13, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{txn.amount >= 0 ? '+' : '-'}{formatMoney(txn.amount)}</span>
                <button onClick={() => deleteTransaction(txn.id)} style={{
                  background: 'none', border: 'none', color: colors.textMuted,
                  fontSize: 12, cursor: 'pointer',
                }}>x</button>
              </div>
            )
          })}
          {monthTxns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: colors.textMuted, fontSize: 12 }}>
              No transactions this month.
            </div>
          )}
        </div>
      )}

      {/* Budget view */}
      {view === 'budget' && (
        <div>
          <p style={{
            color: colors.textMuted, fontSize: 12, marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}>Set monthly budget limits per category</p>
          {CATEGORIES.filter(c => c.id !== 'income').map(cat => (
            <div key={cat.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', marginBottom: 10, borderRadius: 10,
              background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            }}>
              <span style={{ color: cat.color, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", width: 20 }}>
                {cat.icon}
              </span>
              <span style={{ color: colors.text, fontSize: 14, fontFamily: "'Exo 2', sans-serif", flex: 1 }}>
                {cat.name}
              </span>
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>$</span>
              <input
                value={budgets[cat.id] || ''}
                onChange={e => setBudget(cat.id, e.target.value)}
                placeholder="0"
                type="number"
                style={{
                  width: 80, padding: '8px 10px', textAlign: 'right', minHeight: 44, borderRadius: 8,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const linkBtn = {
  background: 'none', border: 'none', color: colors.textMuted,
  fontSize: 12, cursor: 'pointer', minHeight: 44, padding: '8px 12px',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
}

const navBtn = {
  width: 44, height: 44, background: 'transparent', borderRadius: 8,
  border: `1px solid ${colors.border}`, color: colors.textMuted,
  fontSize: 16, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
}
