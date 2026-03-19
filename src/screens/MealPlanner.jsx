import { useState, useEffect } from 'react'
import { colors, loadState, saveState } from '../constants'
import { db } from '../db'

const MEAL_DB = {
  breakfast: [
    { name: 'Avocado Toast', time: '10 min', cal: 350, ingredients: ['Bread', 'Avocado', 'Eggs', 'Salt', 'Pepper', 'Lemon'] },
    { name: 'Greek Yogurt Bowl', time: '5 min', cal: 280, ingredients: ['Greek Yogurt', 'Granola', 'Mixed Berries', 'Honey'] },
    { name: 'Smoothie Bowl', time: '8 min', cal: 310, ingredients: ['Banana', 'Spinach', 'Almond Milk', 'Protein Powder', 'Chia Seeds'] },
    { name: 'Oatmeal & Fruit', time: '10 min', cal: 300, ingredients: ['Oats', 'Milk', 'Banana', 'Blueberries', 'Honey'] },
    { name: 'Eggs Benedict', time: '25 min', cal: 450, ingredients: ['English Muffin', 'Eggs', 'Ham', 'Butter', 'Lemon Juice'] },
  ],
  lunch: [
    { name: 'Chicken Caesar Salad', time: '15 min', cal: 420, ingredients: ['Romaine', 'Chicken Breast', 'Parmesan', 'Croutons', 'Caesar Dressing'] },
    { name: 'Turkey Wrap', time: '10 min', cal: 380, ingredients: ['Tortilla', 'Turkey', 'Lettuce', 'Tomato', 'Mustard'] },
    { name: 'Quinoa Buddha Bowl', time: '20 min', cal: 440, ingredients: ['Quinoa', 'Chickpeas', 'Sweet Potato', 'Kale', 'Tahini'] },
    { name: 'Grilled Cheese & Soup', time: '15 min', cal: 500, ingredients: ['Bread', 'Cheddar', 'Butter', 'Tomato Soup'] },
    { name: 'Poke Bowl', time: '15 min', cal: 460, ingredients: ['Sushi Rice', 'Tuna', 'Avocado', 'Edamame', 'Soy Sauce', 'Sesame'] },
  ],
  dinner: [
    { name: 'Grilled Salmon', time: '25 min', cal: 520, ingredients: ['Salmon Fillet', 'Asparagus', 'Lemon', 'Olive Oil', 'Garlic'] },
    { name: 'Pasta Primavera', time: '20 min', cal: 480, ingredients: ['Penne', 'Bell Peppers', 'Zucchini', 'Tomato Sauce', 'Parmesan'] },
    { name: 'Chicken Stir-Fry', time: '20 min', cal: 450, ingredients: ['Chicken', 'Broccoli', 'Soy Sauce', 'Rice', 'Ginger', 'Garlic'] },
    { name: 'Tacos', time: '25 min', cal: 550, ingredients: ['Ground Beef', 'Taco Shells', 'Lettuce', 'Tomato', 'Cheese', 'Salsa'] },
    { name: 'Veggie Curry', time: '30 min', cal: 400, ingredients: ['Chickpeas', 'Coconut Milk', 'Curry Paste', 'Rice', 'Spinach'] },
  ],
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MealPlanner({ user, addMemory }) {
  const [mealPlan, setMealPlan] = useState(() => loadState('mealPlan', {}))
  const [groceryList, setGroceryList] = useState(() => loadState('groceryList', []))
  const [view, setView] = useState('plan') // plan, grocery
  const [selectedDay, setSelectedDay] = useState('Mon')
  const [showPicker, setShowPicker] = useState(null) // { day, mealType }
  const [diet, setDiet] = useState(() => loadState('diet', 'none'))

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

  const setMeal = (day, mealType, meal) => {
    const key = `${day}_${mealType}`
    const updated = { ...mealPlan, [key]: meal }
    setMealPlan(updated)
    saveState('mealPlan', updated)
    db.meals.set(key, meal).catch(() => {})
    addMemory(`Planned ${mealType}: ${meal.name} for ${day}`)
    setShowPicker(null)
  }

  const [generating, setGenerating] = useState(false)

  const generateWeek = async () => {
    setGenerating(true)
    try {
      const result = await db.ai.mealPlan(diet, 'Mon through Sun', '')
      if (result.meals && !result.error) {
        savePlan(result.meals)
        addMemory('AI generated weekly meal plan')
      } else {
        // Fallback to random from MEAL_DB
        const plan = {}
        DAYS.forEach(day => {
          ['breakfast', 'lunch', 'dinner'].forEach(type => {
            const meals = MEAL_DB[type]
            plan[`${day}_${type}`] = meals[Math.floor(Math.random() * meals.length)]
          })
        })
        savePlan(plan)
      }
    } catch {
      // Fallback
      const plan = {}
      DAYS.forEach(day => {
        ['breakfast', 'lunch', 'dinner'].forEach(type => {
          const meals = MEAL_DB[type]
          plan[`${day}_${type}`] = meals[Math.floor(Math.random() * meals.length)]
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
    // Sync each item to D1
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

  const getMeal = (day, type) => mealPlan[`${day}_${type}`]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 700 }}>Meal Planner</h2>
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
          {/* AI Generate */}
          <button onClick={generateWeek} disabled={generating} style={{
            width: '100%', padding: 12,
            background: generating ? 'transparent' : colors.primaryDim,
            color: colors.primary,
            border: `1px solid ${colors.primary}`,
            fontSize: 11, fontWeight: 600,
            cursor: generating ? 'wait' : 'pointer', marginBottom: 16,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {generating ? 'AI GENERATING...' : 'GENERATE MEAL PLAN'}
          </button>

          {/* Day selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
            {DAYS.map(d => (
              <button key={d} onClick={() => setSelectedDay(d)} style={{
                flex: 1, padding: '8px 4px', minWidth: 40,
                background: selectedDay === d ? colors.primary : colors.surfaceLight,
                border: `1px solid ${selectedDay === d ? colors.primary : colors.border}`,
                borderRadius: 8, color: selectedDay === d ? '#fff' : colors.textSecondary,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>{d}</button>
            ))}
          </div>

          {/* Meals for selected day */}
          {['breakfast', 'lunch', 'dinner'].map(type => {
            const meal = getMeal(selectedDay, type)
            return (
              <div key={type} style={{
                padding: 14, background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                borderRadius: 10, marginBottom: 10,
              }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                  {type}
                </div>
                {meal ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: colors.text, fontSize: 15, fontWeight: 500 }}>{meal.name}</span>
                      <button onClick={() => setShowPicker({ day: selectedDay, mealType: type })} style={{
                        background: 'none', border: 'none', color: colors.primaryLight, fontSize: 12, cursor: 'pointer',
                      }}>Change</button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.time}</span>
                      <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.cal} cal</span>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowPicker({ day: selectedDay, mealType: type })} style={{
                    background: 'none', border: `1px dashed ${colors.border}`, borderRadius: 8,
                    padding: '12px 16px', color: colors.textMuted, fontSize: 13, cursor: 'pointer',
                    width: '100%', fontFamily: 'inherit',
                  }}>+ Add {type}</button>
                )}
              </div>
            )
          })}

          {/* Generate grocery list */}
          {Object.keys(mealPlan).length > 0 && (
            <button onClick={generateGroceryList} style={{
              width: '100%', padding: 14, background: colors.gradient2, color: '#000',
              border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600,
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
              <div style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
                {groceryList.filter(g => g.checked).length} of {groceryList.length} items checked
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
                  }}>{item.checked && '✓'}</span>
                  <span style={{
                    color: colors.text, fontSize: 14, flex: 1,
                    textDecoration: item.checked ? 'line-through' : 'none',
                  }}>{item.name}</span>
                  {item.count > 1 && <span style={{ color: colors.textMuted, fontSize: 11 }}>×{item.count}</span>}
                </div>
              ))}

              {/* Instacart-style delivery */}
              <div style={{
                marginTop: 16, padding: 14, background: `${colors.success}10`,
                border: `1px solid ${colors.success}25`, borderRadius: 10,
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <span style={{ fontSize: 20 }}>🛒</span>
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
        <div style={modalOverlay} onClick={() => setShowPicker(null)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: colors.text, fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              Choose {showPicker.mealType} for {showPicker.day}
            </h3>
            {MEAL_DB[showPicker.mealType].map((meal, i) => (
              <button key={i} onClick={() => setMeal(showPicker.day, showPicker.mealType, meal)} style={{
                width: '100%', padding: 14, background: colors.surfaceLight,
                border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 8,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 500 }}>{meal.name}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.time}</span>
                  <span style={{ color: colors.textSecondary, fontSize: 11 }}>{meal.cal} cal</span>
                  <span style={{ color: colors.textMuted, fontSize: 11 }}>{meal.ingredients.length} items</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const tabBtn = {
  padding: '6px 14px', border: 'none', borderRadius: 8,
  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
}
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
}
const modalContent = {
  background: colors.surface, borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 480,
  border: `1px solid ${colors.border}`, maxHeight: '70vh', overflowY: 'auto',
}
