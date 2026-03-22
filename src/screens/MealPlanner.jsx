import { useState, useEffect, useMemo } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const MEAL_DB = {
  breakfast: [
    { name: 'Avocado Toast', time: '10 min', cal: 350, protein: 14, carbs: 35, fat: 18, tags: ['vegetarian'], ingredients: ['Bread', 'Avocado', 'Eggs', 'Salt', 'Pepper', 'Lemon'] },
    { name: 'Greek Yogurt Bowl', time: '5 min', cal: 280, protein: 20, carbs: 38, fat: 6, tags: ['vegetarian', 'quick'], ingredients: ['Greek Yogurt', 'Granola', 'Mixed Berries', 'Honey'] },
    { name: 'Smoothie Bowl', time: '8 min', cal: 310, protein: 24, carbs: 40, fat: 5, tags: ['vegan', 'vegetarian', 'high-protein', 'quick'], ingredients: ['Banana', 'Spinach', 'Almond Milk', 'Protein Powder', 'Chia Seeds'] },
    { name: 'Oatmeal & Fruit', time: '10 min', cal: 300, protein: 10, carbs: 55, fat: 5, tags: ['vegetarian', 'quick'], ingredients: ['Oats', 'Milk', 'Banana', 'Blueberries', 'Honey'] },
    { name: 'Eggs Benedict', time: '25 min', cal: 450, protein: 22, carbs: 28, fat: 28, tags: ['high-protein'], ingredients: ['English Muffin', 'Eggs', 'Ham', 'Butter', 'Lemon Juice'] },
  ],
  lunch: [
    { name: 'Chicken Caesar Salad', time: '15 min', cal: 420, protein: 38, carbs: 18, fat: 22, tags: ['high-protein', 'low-carb', 'quick'], ingredients: ['Romaine', 'Chicken Breast', 'Parmesan', 'Croutons', 'Caesar Dressing'] },
    { name: 'Turkey Wrap', time: '10 min', cal: 380, protein: 28, carbs: 35, fat: 14, tags: ['high-protein', 'quick'], ingredients: ['Tortilla', 'Turkey', 'Lettuce', 'Tomato', 'Mustard'] },
    { name: 'Quinoa Buddha Bowl', time: '20 min', cal: 440, protein: 16, carbs: 58, fat: 14, tags: ['vegan', 'vegetarian', 'quick'], ingredients: ['Quinoa', 'Chickpeas', 'Sweet Potato', 'Kale', 'Tahini'] },
    { name: 'Grilled Cheese & Soup', time: '15 min', cal: 500, protein: 18, carbs: 48, fat: 26, tags: ['vegetarian', 'quick'], ingredients: ['Bread', 'Cheddar', 'Butter', 'Tomato Soup'] },
    { name: 'Poke Bowl', time: '15 min', cal: 460, protein: 32, carbs: 50, fat: 12, tags: ['high-protein', 'quick'], ingredients: ['Sushi Rice', 'Tuna', 'Avocado', 'Edamame', 'Soy Sauce', 'Sesame'] },
  ],
  dinner: [
    { name: 'Grilled Salmon', time: '25 min', cal: 520, protein: 42, carbs: 12, fat: 32, tags: ['high-protein', 'low-carb', 'quick'], ingredients: ['Salmon Fillet', 'Asparagus', 'Lemon', 'Olive Oil', 'Garlic'] },
    { name: 'Pasta Primavera', time: '20 min', cal: 480, protein: 16, carbs: 68, fat: 14, tags: ['vegetarian', 'quick'], ingredients: ['Penne', 'Bell Peppers', 'Zucchini', 'Tomato Sauce', 'Parmesan'] },
    { name: 'Chicken Stir-Fry', time: '20 min', cal: 450, protein: 36, carbs: 40, fat: 14, tags: ['high-protein', 'quick'], ingredients: ['Chicken', 'Broccoli', 'Soy Sauce', 'Rice', 'Ginger', 'Garlic'] },
    { name: 'Tacos', time: '25 min', cal: 550, protein: 30, carbs: 42, fat: 28, tags: ['high-protein', 'quick'], ingredients: ['Ground Beef', 'Taco Shells', 'Lettuce', 'Tomato', 'Cheese', 'Salsa'] },
    { name: 'Veggie Curry', time: '30 min', cal: 400, protein: 14, carbs: 52, fat: 16, tags: ['vegan', 'vegetarian'], ingredients: ['Chickpeas', 'Coconut Milk', 'Curry Paste', 'Rice', 'Spinach'] },
  ],
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner']
const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'vegetarian', label: 'VEGETARIAN' },
  { key: 'vegan', label: 'VEGAN' },
  { key: 'low-carb', label: 'LOW-CARB' },
  { key: 'high-protein', label: 'HIGH-PROTEIN' },
  { key: 'quick', label: 'QUICK <30m' },
]

function parseTime(timeStr) {
  if (!timeStr) return 999
  const m = timeStr.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 999
}

function mealPassesFilter(meal, filter) {
  if (filter === 'all') return true
  if (filter === 'quick') return parseTime(meal.time) < 30
  return (meal.tags || []).includes(filter)
}

export default function MealPlanner({ user, addMemory }) {
  const [mealPlan, setMealPlan] = useState(() => loadState('mealPlan', {}))
  const [groceryList, setGroceryList] = useState(() => loadState('groceryList', []))
  const [view, setView] = useState('plan') // plan, grocery
  const [selectedDay, setSelectedDay] = useState('Mon')
  const [showPicker, setShowPicker] = useState(null) // { day, mealType }
  const [diet, setDiet] = useState(() => loadState('diet', 'none'))
  const [generating, setGenerating] = useState(false)

  // New state for features
  const [activeFilter, setActiveFilter] = useState('all')
  const [customMeals, setCustomMeals] = useState(() => loadState('custom_meals', { breakfast: [], lunch: [], dinner: [] }))
  const [showAddCustom, setShowAddCustom] = useState(null) // mealType string when adding custom
  const [customForm, setCustomForm] = useState({ name: '', cal: '', time: '', ingredients: '', protein: '', carbs: '', fat: '', tags: [] })
  const [selectedMealDetail, setSelectedMealDetail] = useState(null)
  const [recipeInstructions, setRecipeInstructions] = useState({})
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  // Load data from D1 on mount, falling back to localStorage defaults already in state
  useEffect(() => {
    db.meals.get().then(data => {
      if (data && Object.keys(data).length > 0) {
        setMealPlan(data)
        saveState('mealPlan', data)
      }
    }).catch(() => {})

    db.grocery.list().then(data => {
      if (data && data.length > 0) {
        setGroceryList(data)
        saveState('groceryList', data)
      }
    }).catch(() => {})
  }, [])

  const savePlan = (p) => {
    setMealPlan(p)
    saveState('mealPlan', p)
    db.meals.bulkSet(p).catch(() => {})
  }

  const saveGrocery = (g) => {
    setGroceryList(g)
    saveState('groceryList', g)
  }

  const saveCustomMeals = (cm) => {
    setCustomMeals(cm)
    saveState('custom_meals', cm)
  }

  const setMeal = (day, mealType, meal) => {
    const key = `${day}_${mealType}`
    const updated = { ...mealPlan, [key]: meal }
    setMealPlan(updated)
    saveState('mealPlan', updated)
    db.meals.set(key, meal).catch(() => {})
    addMemory(`Planned ${mealType}: ${meal.name} for ${day}`)
    setShowPicker(null)
  }

  const generateWeek = async () => {
    setGenerating(true)
    try {
      const result = await db.ai.mealPlan(diet, 'Mon through Sun', '')
      if (result.meals && !result.error) {
        savePlan(result.meals)
        addMemory('AI generated weekly meal plan')
      } else {
        const plan = {}
        DAYS.forEach(day => {
          MEAL_TYPES.forEach(type => {
            const allMeals = [...MEAL_DB[type], ...(customMeals[type] || [])]
            plan[`${day}_${type}`] = allMeals[Math.floor(Math.random() * allMeals.length)]
          })
        })
        savePlan(plan)
      }
    } catch {
      const plan = {}
      DAYS.forEach(day => {
        MEAL_TYPES.forEach(type => {
          const allMeals = [...MEAL_DB[type], ...(customMeals[type] || [])]
          plan[`${day}_${type}`] = allMeals[Math.floor(Math.random() * allMeals.length)]
        })
      })
      savePlan(plan)
    }
    setGenerating(false)
  }

  const generateGroceryList = () => {
    const allIngredients = {}
    Object.values(mealPlan).forEach(meal => {
      if (meal?.ingredients) {
        meal.ingredients.forEach(ing => {
          allIngredients[ing] = (allIngredients[ing] || 0) + 1
        })
      }
    })
    const list = Object.entries(allIngredients).map(([name, count]) => ({
      name, count, checked: false, id: Date.now() + Math.random(),
    }))
    setGroceryList(list)
    saveState('groceryList', list)
    list.forEach(item => {
      db.grocery.add({ name: item.name, count: item.count }).catch(() => {})
    })
    setView('grocery')
    addMemory('Generated grocery list from meal plan')
  }

  const toggleGrocery = (id) => {
    const updated = groceryList.map(g => g.id === id ? { ...g, checked: !g.checked } : g)
    setGroceryList(updated)
    saveState('groceryList', updated)
    const toggled = updated.find(g => g.id === id)
    if (toggled) {
      db.grocery.update({ id: toggled.id, name: toggled.name, count: toggled.count, checked: toggled.checked }).catch(() => {})
    }
  }

  const clearCheckedGroceries = () => {
    const remaining = groceryList.filter(g => !g.checked)
    setGroceryList(remaining)
    saveState('groceryList', remaining)
    db.grocery.clearChecked().catch(() => {})
  }

  const getMeal = (day, type) => mealPlan[`${day}_${type}`]

  // Merge built-in + custom meals for a given type, then apply filter
  const getFilteredMeals = (mealType) => {
    const builtIn = MEAL_DB[mealType] || []
    const custom = customMeals[mealType] || []
    const all = [...builtIn, ...custom]
    return all.filter(m => mealPassesFilter(m, activeFilter))
  }

  // Add a custom meal
  const handleAddCustomMeal = (mealType) => {
    const { name, cal, time, ingredients, protein, carbs, fat, tags } = customForm
    if (!name.trim()) return
    const newMeal = {
      name: name.trim(),
      cal: parseInt(cal, 10) || 0,
      time: time.trim() || '? min',
      ingredients: ingredients.split(',').map(s => s.trim()).filter(Boolean),
      protein: parseInt(protein, 10) || 0,
      carbs: parseInt(carbs, 10) || 0,
      fat: parseInt(fat, 10) || 0,
      tags: tags || [],
      custom: true,
    }
    const updated = {
      ...customMeals,
      [mealType]: [...(customMeals[mealType] || []), newMeal],
    }
    saveCustomMeals(updated)
    setCustomForm({ name: '', cal: '', time: '', ingredients: '', protein: '', carbs: '', fat: '', tags: [] })
    setShowAddCustom(null)
    addMemory(`Added custom ${mealType} recipe: ${newMeal.name}`)
  }

  // Fetch AI-generated recipe instructions for a meal
  const fetchRecipeInstructions = async (meal) => {
    if (recipeInstructions[meal.name]) return
    setLoadingRecipe(true)
    try {
      const prompt = `You are JARVIS, Tony Stark's AI chef. Give concise cooking instructions (5-8 steps, no fluff) for: ${meal.name}. Ingredients: ${(meal.ingredients || []).join(', ')}. Cooking time: ${meal.time}. Be precise like a Stark Industries protocol.`
      const result = await db.ai.chat(prompt, [], { role: 'chef' })
      const text = result?.reply || result?.message || result?.response || 'Recipe protocol unavailable. Improvise, sir.'
      setRecipeInstructions(prev => ({ ...prev, [meal.name]: text }))
    } catch {
      setRecipeInstructions(prev => ({ ...prev, [meal.name]: 'Recipe data link offline. Recommend manual override, sir.' }))
    }
    setLoadingRecipe(false)
  }

  // Open meal detail and fetch recipe
  const openMealDetail = (meal) => {
    setSelectedMealDetail(meal)
    if (!recipeInstructions[meal.name]) {
      fetchRecipeInstructions(meal)
    }
  }

  // Weekly overview data
  const weeklyOverview = useMemo(() => {
    return DAYS.map(day => {
      let totalCal = 0
      const slots = {}
      MEAL_TYPES.forEach(type => {
        const meal = getMeal(day, type)
        slots[type] = !!meal
        if (meal) totalCal += (meal.cal || 0)
      })
      const filled = MEAL_TYPES.filter(t => slots[t]).length
      return { day, totalCal, slots, filled }
    })
  }, [mealPlan])

  // Share meal plan as formatted text
  const shareMealPlan = async () => {
    const lines = ['== STARK INDUSTRIES - WEEKLY MEAL PROTOCOL ==', '']
    DAYS.forEach(day => {
      lines.push(`[ ${day.toUpperCase()} ]`)
      MEAL_TYPES.forEach(type => {
        const meal = getMeal(day, type)
        const label = type.charAt(0).toUpperCase() + type.slice(1)
        if (meal) {
          lines.push(`  ${label}: ${meal.name} (${meal.cal} cal, ${meal.time})`)
        } else {
          lines.push(`  ${label}: -- unassigned --`)
        }
      })
      const dayCal = MEAL_TYPES.reduce((sum, t) => sum + (getMeal(day, t)?.cal || 0), 0)
      lines.push(`  Daily Total: ${dayCal} cal`)
      lines.push('')
    })
    const totalWeek = Object.values(mealPlan).reduce((s, m) => s + (m?.cal || 0), 0)
    lines.push(`WEEKLY TOTAL: ${totalWeek} cal`)
    lines.push('Generated by J.A.R.V.I.S. Meal Planner')

    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setShareMsg('Meal plan copied to clipboard, sir.')
      setTimeout(() => setShareMsg(''), 2500)
    } catch {
      setShareMsg('Clipboard access denied.')
      setTimeout(() => setShareMsg(''), 2500)
    }
  }

  const checkedCount = groceryList.filter(g => g.checked).length

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          STARK KITCHEN
          <span style={{ color: colors.primary, fontSize: 11, display: 'block', letterSpacing: 1, fontWeight: 400 }}>MEAL PROTOCOL v3.1</span>
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('plan')} style={{
            ...tabBtn, background: view === 'plan' ? colors.primary : colors.surfaceLight,
            color: view === 'plan' ? '#fff' : colors.textSecondary,
          }}>Plan</button>
          <button onClick={() => setView('grocery')} style={{
            ...tabBtn, background: view === 'grocery' ? colors.primary : colors.surfaceLight,
            color: view === 'grocery' ? '#fff' : colors.textSecondary,
          }}>Groceries</button>
        </div>
      </div>

      {view === 'plan' && (
        <>
          {/* Weekly Overview Card */}
          <div style={{
            padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
            borderRadius: 10, marginBottom: 14,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
            }}>
              <span style={{ color: colors.primary, fontSize: 13, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                WEEKLY OVERVIEW
              </span>
              <button onClick={shareMealPlan} style={{
                background: 'none', border: `1px solid ${colors.border}`, borderRadius: 8,
                color: colors.primaryLight, fontSize: 11, padding: '12px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, minHeight: 44,
              }}>SHARE</button>
            </div>
            {shareMsg && (
              <div style={{ color: colors.success, fontSize: 11, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                {shareMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              {weeklyOverview.map(d => (
                <div key={d.day} style={{
                  flex: 1, textAlign: 'center', padding: '6px 2px',
                  background: d.filled === 3 ? `${colors.success}15` : d.filled > 0 ? `${colors.warning}10` : 'transparent',
                  borderRadius: 6, border: `1px solid ${d.filled === 3 ? colors.success + '30' : colors.border}`,
                }}>
                  <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{d.day}</div>
                  <div style={{ color: d.totalCal > 0 ? colors.text : colors.textMuted, fontSize: 12, fontWeight: 600 }}>
                    {d.totalCal > 0 ? d.totalCal : '--'}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>cal</div>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                    {MEAL_TYPES.map(t => (
                      <span key={t} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: d.slots[t] ? colors.success : colors.textMuted + '40',
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Generate + Share row */}
          <button onClick={generateWeek} disabled={generating} style={{
            width: '100%', padding: '12px 16px',
            background: generating ? 'transparent' : colors.primaryDim,
            color: colors.primary,
            border: `1px solid ${colors.primary}`,
            fontSize: 13, fontWeight: 600, minHeight: 44,
            cursor: generating ? 'wait' : 'pointer', marginBottom: 14,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {generating ? 'J.A.R.V.I.S. GENERATING...' : 'GENERATE MEAL PLAN'}
          </button>

          {/* Dietary Filters */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                padding: '8px 12px', whiteSpace: 'nowrap',
                background: activeFilter === f.key ? colors.primary : 'transparent',
                border: `1px solid ${activeFilter === f.key ? colors.primary : colors.border}`,
                borderRadius: 20, color: activeFilter === f.key ? '#fff' : colors.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>{f.label}</button>
            ))}
          </div>

          {/* Day selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
            {DAYS.map(d => (
              <button key={d} onClick={() => setSelectedDay(d)} style={{
                flex: 1, padding: '10px 4px', minWidth: 40, minHeight: 44,
                background: selectedDay === d ? colors.primary : colors.surfaceLight,
                border: `1px solid ${selectedDay === d ? colors.primary : colors.border}`,
                borderRadius: 8, color: selectedDay === d ? '#fff' : colors.textSecondary,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>{d}</button>
            ))}
          </div>

          {/* Meals for selected day */}
          {MEAL_TYPES.map(type => {
            const meal = getMeal(selectedDay, type)
            return (
              <div key={type} style={{
                padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 10, marginBottom: 10,
              }}>
                <div style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                  {type}
                </div>
                {meal ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        onClick={() => openMealDetail(meal)}
                        style={{ color: colors.text, fontSize: 15, fontWeight: 500, cursor: 'pointer', borderBottom: `1px dashed ${colors.border}` }}
                      >{meal.name}</span>
                      <button onClick={() => setShowPicker({ day: selectedDay, mealType: type })} style={{
                        background: 'none', border: 'none', color: colors.primaryLight, fontSize: 12, cursor: 'pointer', minHeight: 44, padding: '12px 16px',
                      }}>Change</button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.time}</span>
                      <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.cal} cal</span>
                      {meal.custom && <span style={{ color: colors.secondary, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>CUSTOM</span>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowPicker({ day: selectedDay, mealType: type })} style={{
                    background: 'none', border: `1px dashed ${colors.border}`, borderRadius: 8,
                    padding: '12px 16px', color: colors.textMuted, fontSize: 14, cursor: 'pointer', minHeight: 44,
                    width: '100%', fontFamily: 'inherit',
                  }}>+ Add {type}</button>
                )}
              </div>
            )
          })}

          {/* Generate grocery list */}
          {Object.keys(mealPlan).length > 0 && (
            <button onClick={generateGroceryList} style={{
              width: '100%', padding: '12px 16px', background: colors.gradient2, color: '#000',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, minHeight: 44,
              cursor: 'pointer', marginTop: 8, fontFamily: 'inherit',
            }}>Generate Grocery List</button>
          )}
        </>
      )}

      {view === 'grocery' && (
        <>
          {groceryList.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              Plan your meals first, then generate a grocery list.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {checkedCount} of {groceryList.length} items checked
                </div>
                {checkedCount > 0 && (
                  <button onClick={clearCheckedGroceries} style={{
                    padding: '12px 16px', background: `${colors.danger}20`,
                    border: `1px solid ${colors.danger}40`, borderRadius: 8,
                    color: colors.danger, fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                  }}>CLEAR CHECKED</button>
                )}
              </div>
              {groceryList.sort((a, b) => a.checked - b.checked).map(item => (
                <div key={item.id} onClick={() => toggleGrocery(item.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                  opacity: item.checked ? 0.5 : 1,
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${item.checked ? colors.success : colors.textMuted}`,
                    background: item.checked ? colors.success : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11,
                  }}>{item.checked && '\u2713'}</span>
                  <span style={{
                    color: colors.text, fontSize: 14, flex: 1,
                    textDecoration: item.checked ? 'line-through' : 'none',
                  }}>{item.name}</span>
                  {item.count > 1 && <span style={{ color: colors.textMuted, fontSize: 11 }}>\u00d7{item.count}</span>}
                </div>
              ))}

              {/* Instacart-style delivery */}
              <div style={{
                marginTop: 16, padding: 14, background: `${colors.success}10`,
                border: `1px solid ${colors.success}25`, borderRadius: 10,
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <span style={{ fontSize: 20 }}>{'\ud83d\uded2'}</span>
                <div>
                  <div style={{ color: colors.success, fontSize: 12, fontWeight: 600 }}>DELIVERY READY</div>
                  <div style={{ color: colors.textSecondary, fontSize: 11 }}>Connect Instacart to order groceries for delivery.</div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Meal Picker Modal */}
      {showPicker && (
        <div style={modalOverlay} onClick={() => { setShowPicker(null); setShowAddCustom(null) }}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              Choose {showPicker.mealType} for {showPicker.day}
            </h3>
            <div style={{ color: colors.textMuted, fontSize: 11, marginBottom: 14, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              FILTER: {FILTERS.find(f => f.key === activeFilter)?.label || 'ALL'}
            </div>

            {/* Filtered meals from DB + custom */}
            {getFilteredMeals(showPicker.mealType).map((meal, i) => (
              <button key={i} onClick={() => setMeal(showPicker.day, showPicker.mealType, meal)} style={{
                width: '100%', padding: 14, background: colors.surfaceLight,
                border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 8,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{meal.name}</span>
                  {meal.custom && <span style={{ color: colors.secondary, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>CUSTOM</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.time}</span>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.cal} cal</span>
                  <span style={{ color: colors.textMuted, fontSize: 11 }}>{meal.ingredients.length} items</span>
                </div>
              </button>
            ))}

            {getFilteredMeals(showPicker.mealType).length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
                No meals match this filter. Try adding a custom meal.
              </div>
            )}

            {/* Add Custom Meal Toggle */}
            {showAddCustom !== showPicker.mealType ? (
              <button onClick={() => setShowAddCustom(showPicker.mealType)} style={{
                width: '100%', padding: '12px 16px', marginTop: 4, minHeight: 44,
                background: colors.primaryDim, border: `1px dashed ${colors.primary}`,
                borderRadius: 10, color: colors.primary, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
              }}>+ ADD CUSTOM RECIPE</button>
            ) : (
              <div style={{
                padding: 14, background: `${colors.primary}08`, border: `1px solid ${colors.primary}30`,
                borderRadius: 10, marginTop: 4,
              }}>
                <div style={{ color: colors.primary, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                  NEW RECIPE PROTOCOL
                </div>
                <input
                  value={customForm.name} onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Recipe name" style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={customForm.cal} onChange={e => setCustomForm(f => ({ ...f, cal: e.target.value }))}
                    placeholder="Calories" type="number" style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    value={customForm.time} onChange={e => setCustomForm(f => ({ ...f, time: e.target.value }))}
                    placeholder="e.g. 20 min" style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <input
                  value={customForm.ingredients} onChange={e => setCustomForm(f => ({ ...f, ingredients: e.target.value }))}
                  placeholder="Ingredients (comma separated)" style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={customForm.protein} onChange={e => setCustomForm(f => ({ ...f, protein: e.target.value }))}
                    placeholder="Protein g" type="number" style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    value={customForm.carbs} onChange={e => setCustomForm(f => ({ ...f, carbs: e.target.value }))}
                    placeholder="Carbs g" type="number" style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    value={customForm.fat} onChange={e => setCustomForm(f => ({ ...f, fat: e.target.value }))}
                    placeholder="Fat g" type="number" style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                {/* Tag toggles */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {['vegetarian', 'vegan', 'low-carb', 'high-protein'].map(tag => (
                    <button key={tag} onClick={() => {
                      setCustomForm(f => ({
                        ...f,
                        tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
                      }))
                    }} style={{
                      padding: '8px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                      background: customForm.tags.includes(tag) ? colors.primary : 'transparent',
                      border: `1px solid ${customForm.tags.includes(tag) ? colors.primary : colors.border}`,
                      color: customForm.tags.includes(tag) ? '#fff' : colors.textMuted,
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
                    }}>{tag.toUpperCase()}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAddCustomMeal(showPicker.mealType)} style={{
                    flex: 1, padding: '12px 16px', background: colors.primary, border: 'none', borderRadius: 8,
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>SAVE RECIPE</button>
                  <button onClick={() => setShowAddCustom(null)} style={{
                    padding: '12px 16px', background: 'transparent', border: `1px solid ${colors.border}`,
                    borderRadius: 8, color: colors.textMuted, fontSize: 12, cursor: 'pointer', minHeight: 44,
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Meal Detail Modal */}
      {selectedMealDetail && (
        <div style={modalOverlay} onClick={() => setSelectedMealDetail(null)}>
          <div style={{ ...modalContent, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedMealDetail.name}
                </h3>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{selectedMealDetail.time}</span>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{selectedMealDetail.cal} cal</span>
                  {selectedMealDetail.custom && <span style={{ color: colors.secondary, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>CUSTOM</span>}
                </div>
              </div>
              <button onClick={() => setSelectedMealDetail(null)} style={{
                background: 'none', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1,
              }}>{'\u00d7'}</button>
            </div>

            {/* Nutritional Breakdown */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 16, padding: 12,
              background: `${colors.primary}08`, borderRadius: 8, border: `1px solid ${colors.border}`,
            }}>
              {[
                { label: 'PROTEIN', val: selectedMealDetail.protein || 0, unit: 'g', color: colors.primary },
                { label: 'CARBS', val: selectedMealDetail.carbs || 0, unit: 'g', color: colors.warning },
                { label: 'FAT', val: selectedMealDetail.fat || 0, unit: 'g', color: colors.secondary },
                { label: 'CALORIES', val: selectedMealDetail.cal || 0, unit: '', color: colors.success },
              ].map(n => (
                <div key={n.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ color: n.color, fontSize: 16, fontWeight: 700 }}>{n.val}{n.unit}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>{n.label}</div>
                </div>
              ))}
            </div>

            {/* Ingredients */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: colors.primary, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                INGREDIENTS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(selectedMealDetail.ingredients || []).map((ing, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                    borderRadius: 6, color: colors.text, fontSize: 12,
                  }}>{ing}</span>
                ))}
              </div>
            </div>

            {/* Cooking Instructions */}
            <div>
              <div style={{ color: colors.primary, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                COOKING PROTOCOL
              </div>
              {loadingRecipe ? (
                <div style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic', padding: 12 }}>
                  J.A.R.V.I.S. generating cooking protocol...
                </div>
              ) : (
                <div style={{
                  padding: 12, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {recipeInstructions[selectedMealDetail.name] || 'Tap to load cooking instructions...'}
                </div>
              )}
            </div>

            {/* Tags */}
            {(selectedMealDetail.tags || []).length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                {selectedMealDetail.tags.map(tag => (
                  <span key={tag} style={{
                    padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: colors.primaryDim, color: colors.primary, letterSpacing: 1,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{tag.toUpperCase()}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const tabBtn = {
  padding: '12px 16px', border: 'none', borderRadius: 8,
  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
}
const modalContent = {
  background: colors.surface, borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 480,
  border: `1px solid ${colors.border}`, maxHeight: '70vh', overflowY: 'auto',
}
const inputStyle = {
  width: '100%', padding: '12px 14px', marginBottom: 8,
  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
  borderRadius: 8, color: colors.text, fontSize: 14, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
