import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import {
  getFoodConfig,
  getFoodPlan,
  logMeal,
  deleteMealLog,
  FoodDay,
  FoodMeal,
  FoodPlanResponse,
  MealLogEntry,
} from '../lib/api'
import Card, { CardTitle } from '../components/Card'

const PLAN_MESSAGES = [
  'Analysing your training schedule…',
  'Computing nutrition windows…',
  'Carb-loading days identified…',
  'Matching meals to prep batches…',
  'Building your meal plan…',
  'Writing ingredient lists…',
  'Almost there…',
]

function PlanGeneratingScreen() {
  const [msgIdx, setMsgIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMsgIdx(i => (i + 1) % PLAN_MESSAGES.length)
      setProgress(p => Math.min(p + 100 / PLAN_MESSAGES.length, 95))
    }, 2500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 32,
    }}>
      <div style={{ fontSize: 48 }}>🥗</div>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Building your nutrition plan</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', minHeight: 20 }}>
          {PLAN_MESSAGES[msgIdx]}
        </p>
      </div>
      <div style={{ width: 240, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 2.2s ease',
        }} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
        This takes 30–60 seconds — more meals, more thinking
      </p>
    </div>
  )
}

const CONTEXT_LABEL: Record<string, { label: string; color: string }> = {
  carb_loading_day: { label: 'Carb loading', color: '#3b82f6' },
  pre_workout_moderate_carb: { label: 'Pre-workout carbs', color: '#f97316' },
  recovery_day: { label: 'Recovery', color: '#22c55e' },
  maintenance: { label: 'Maintenance', color: 'var(--text-muted)' },
  race_morning: { label: 'Race morning', color: '#a855f7' },
  post_race_recovery: { label: 'Post-race recovery', color: '#ec4899' },
}

const SESSION_COLOR: Record<string, string> = {
  easy: '#22c55e',
  tempo: '#f97316',
  interval: '#ef4444',
  long: '#3b82f6',
  race_pace: '#a855f7',
  recovery: '#6b7280',
  rest: 'var(--border)',
}

function formatDate(dateStr: string): { day: string; weekday: string } {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    day: d.getDate().toString(),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
  }
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10)
}

function MealCard({ meal, slot, date: dateStr, loggedIds, onLog, onUnlog }: {
  meal: FoodMeal
  slot: string
  date: string
  loggedIds: number[]
  onLog: (slot: string, meal: FoodMeal) => void
  onUnlog: (id: number) => void
}) {
  const logEntry = loggedIds.length > 0
  const SLOT_LABELS: Record<string, string> = {
    breakfast: 'Breakfast',
    pre_workout: 'Pre-workout',
    post_workout: 'Post-workout',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
  }

  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      background: logEntry ? 'rgba(34,197,94,0.05)' : 'var(--surface)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {SLOT_LABELS[slot] || slot}
            {meal.timing && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {' · '}{meal.timing}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{meal.name}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{meal.calories} kcal</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            C{meal.macros.carbs_g}g · P{meal.macros.protein_g}g · F{meal.macros.fat_g}g
          </div>
        </div>
      </div>
      {meal.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{meal.description}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {meal.ingredients?.slice(0, 3).map(i => i.name).join(', ')}
          {meal.ingredients?.length > 3 ? ` +${meal.ingredients.length - 3} more` : ''}
        </div>
        {logEntry ? (
          <button
            onClick={() => onUnlog(loggedIds[0])}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Logged ✓
          </button>
        ) : (
          <button
            onClick={() => onLog(slot, meal)}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            Log meal
          </button>
        )}
      </div>
    </div>
  )
}

export default function Food() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [planData, setPlanData] = useState<FoodPlanResponse | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const configRes = await getFoodConfig()
        if (!configRes.running_onboarded) {
          navigate('/running')
          return
        }
        if (!configRes.onboarded) {
          navigate('/food/setup')
          return
        }
        setGenerating(true)
        const data = await getFoodPlan()
        setPlanData(data)
        // Set selected date to today if it's in the current week plan
        if (data.plan) {
          const today = new Date().toISOString().slice(0, 10)
          const inPlan = data.plan.days.some(d => d.date === today)
          if (inPlan) setSelectedDate(today)
          else setSelectedDate(data.plan.days[0]?.date || today)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load food plan')
      } finally {
        setLoading(false)
        setGenerating(false)
      }
    }
    load()
  }, [navigate])

  async function handleLog(dateStr: string, slot: string, meal: FoodMeal) {
    try {
      await logMeal({
        date: dateStr,
        meal_slot: slot,
        meal_name: meal.name,
        calories: meal.calories,
        protein_g: meal.macros.protein_g,
        carbs_g: meal.macros.carbs_g,
        fat_g: meal.macros.fat_g,
      })
      const data = await getFoodPlan()
      setPlanData(data)
    } catch (e) {
      console.error('Log failed', e)
    }
  }

  async function handleUnlog(id: number) {
    try {
      await deleteMealLog(id)
      const data = await getFoodPlan()
      setPlanData(data)
    } catch (e) {
      console.error('Unlog failed', e)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (generating || (planData && !planData.plan && !planData.ai_unavailable && !planData.message)) {
    return <PlanGeneratingScreen />
  }
  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>

  if (!planData?.plan) {
    return (
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Nutrition</h1>
        {planData?.ai_unavailable ? (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius)',
            padding: 16,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>AI unavailable</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{planData.message}</div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No plan available.</p>
        )}
      </div>
    )
  }

  const plan = planData.plan
  const logs = planData.meal_logs || []
  const selectedDay = plan.days.find(d => d.date === selectedDate) || plan.days[0]

  // Group logs by date + slot
  const logsByDateSlot: Record<string, MealLogEntry[]> = {}
  for (const log of logs) {
    const key = `${log.date}__${log.meal_slot}`
    if (!logsByDateSlot[key]) logsByDateSlot[key] = []
    logsByDateSlot[key].push(log)
  }

  // Total logged calories for selected day
  const dayLogs = logs.filter(l => l.date === selectedDate)
  const loggedCalories = dayLogs.reduce((sum, l) => sum + (l.calories || 0), 0)

  function getMealSlots(day: FoodDay): Array<{ slot: string; meal: FoodMeal }> {
    const order = ['breakfast', 'pre_workout', 'post_workout', 'lunch', 'dinner']
    const result: Array<{ slot: string; meal: FoodMeal }> = []
    for (const slot of order) {
      const meal = (day.meals as Record<string, FoodMeal | undefined>)[slot]
      if (meal) result.push({ slot, meal })
    }
    const snacks = day.meals.snacks || []
    snacks.forEach(s => result.push({ slot: 'snack', meal: s }))
    return result
  }

  const ctx = CONTEXT_LABEL[selectedDay?.nutrition_context] || CONTEXT_LABEL.maintenance

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Nutrition</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Week of {new Date(plan.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {plan.race_week && (
              <span style={{ marginLeft: 8, color: '#a855f7', fontWeight: 600 }}>Race week</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate('/food/setup')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Settings2 size={14} />
          Settings
        </button>
      </div>

      {/* Week strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${plan.days.length}, 1fr)`,
        gap: 6,
        marginBottom: 24,
      }}>
        {plan.days.map(day => {
          const { day: dayNum, weekday } = formatDate(day.date)
          const today = isToday(day.date)
          const selected = day.date === selectedDate
          const ctxInfo = CONTEXT_LABEL[day.nutrition_context] || CONTEXT_LABEL.maintenance
          const dayLogCount = logs.filter(l => l.date === day.date).length

          return (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              style={{
                padding: '10px 6px',
                borderRadius: 'var(--radius)',
                border: `2px solid ${selected ? 'var(--accent)' : today ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                background: selected ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{weekday}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{dayNum}</div>
              {day.session_type !== 'rest' && (
                <div style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: SESSION_COLOR[day.session_type] || 'var(--border)',
                  margin: '0 auto 4px',
                }} />
              )}
              <div style={{
                fontSize: 9,
                color: ctxInfo.color,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                lineHeight: 1.2,
              }}>
                {ctxInfo.label}
              </div>
              {dayLogCount > 0 && (
                <div style={{ fontSize: 9, color: 'var(--green)', marginTop: 2 }}>
                  {dayLogCount} logged
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Meals */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: ctx.color,
                background: `${ctx.color}18`,
                padding: '2px 8px',
                borderRadius: 4,
              }}>
                {ctx.label}
              </span>
            </div>

            {selectedDay.note && (
              <div style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 14px',
                marginBottom: 16,
              }}>
                {selectedDay.note}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {getMealSlots(selectedDay).map(({ slot, meal }, i) => {
                const key = `${selectedDate}__${slot}`
                const logged = logsByDateSlot[key] || []
                return (
                  <MealCard
                    key={`${slot}-${i}`}
                    slot={slot}
                    meal={meal}
                    date={selectedDate}
                    loggedIds={logged.map(l => l.id)}
                    onLog={(s, m) => handleLog(selectedDate, s, m)}
                    onUnlog={handleUnlog}
                  />
                )
              })}
            </div>
          </div>

          {/* Day targets sidebar */}
          <div>
            <Card>
              <CardTitle>Today's targets</CardTitle>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Calories</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {loggedCalories > 0 ? `${Math.round(loggedCalories)} / ` : ''}{selectedDay.targets.calories} kcal
                  </span>
                </div>
                {loggedCalories > 0 && (
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min((loggedCalories / selectedDay.targets.calories) * 100, 100)}%`,
                      background: 'var(--accent)',
                      borderRadius: 3,
                    }} />
                  </div>
                )}
              </div>

              {[
                { label: 'Carbs', key: 'carbs_g', color: '#3b82f6' },
                { label: 'Protein', key: 'protein_g', color: '#22c55e' },
                { label: 'Fat', key: 'fat_g', color: '#f97316' },
              ].map(({ label, key, color }) => {
                const target = selectedDay.targets[key as keyof typeof selectedDay.targets] as number
                const logged = dayLogs.reduce((sum, l) => sum + ((l[key as keyof typeof l] as number) || 0), 0)
                return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {logged > 0 ? `${Math.round(logged)}g / ` : ''}{target}g
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: logged > 0 ? `${Math.min((logged / target) * 100, 100)}%` : '0%',
                        background: color,
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                )
              })}

              {selectedDay.session_type !== 'rest' && (
                <div style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: `${SESSION_COLOR[selectedDay.session_type] || 'var(--border)'}18`,
                  border: `1px solid ${SESSION_COLOR[selectedDay.session_type] || 'var(--border)'}44`,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Training</div>
                  <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                    {selectedDay.session_type} · {selectedDay.session_distance_km} km
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                Prep batch {selectedDay.prep_batch}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
