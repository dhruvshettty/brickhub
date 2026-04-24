import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveFoodConfig } from '../lib/api'

const DIETARY_OPTIONS = [
  { id: 'omnivore', label: 'Omnivore', desc: 'No restrictions — eat everything.' },
  { id: 'vegetarian', label: 'Vegetarian', desc: 'No meat, fish OK or excluded.' },
  { id: 'vegan', label: 'Vegan', desc: 'No animal products.' },
  { id: 'other', label: 'Other', desc: 'Paleo, keto, halal, kosher, etc.' },
]

const PREP_OPTIONS = [
  {
    id: 'daily',
    label: 'Daily',
    desc: 'Fresh meals every day. Maximum variety, most time in the kitchen.',
  },
  {
    id: 'every_2_days',
    label: 'Every 2 days',
    desc: 'Prep twice, eat the same dinner for 2 days. Good balance.',
  },
  {
    id: 'every_3_days',
    label: 'Every 3 days',
    desc: 'Two prep sessions per week (Mon + Thu). Minimal cooking, consistent plan.',
  },
]

const CUISINE_OPTIONS = [
  { id: 'mediterranean', label: 'Mediterranean', desc: 'Olive oil, fish, grains, legumes.' },
  { id: 'asian', label: 'Asian', desc: 'Rice, noodles, stir-fries, lean proteins.' },
  { id: 'western', label: 'Western', desc: 'Familiar comfort meals, easy to source.' },
  { id: 'mix', label: 'Mix', desc: 'No preference — variety across all styles.' },
]

const TOTAL_STEPS = 4

export default function FoodSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: dietary
  const [dietary, setDietary] = useState<string>('')
  const [intolerances, setIntolerances] = useState<string>('')

  // Step 2: prep frequency
  const [prepFrequency, setPrepFrequency] = useState<string>('every_3_days')

  // Step 3: weight + calorie baseline
  const [weight, setWeight] = useState<string>('')
  const [calorieBaseline, setCalorieBaseline] = useState<number>(2200)
  const [calorieEdited, setCalorieEdited] = useState(false)

  // Step 4: cuisine
  const [cuisine, setCuisine] = useState<string>('mix')

  function computeBaseline(kg: number): number {
    return Math.round(kg * 35)
  }

  function handleWeightChange(val: string) {
    setWeight(val)
    const kg = parseFloat(val)
    if (!isNaN(kg) && kg > 0 && !calorieEdited) {
      setCalorieBaseline(computeBaseline(kg))
    }
  }

  function canAdvance(): boolean {
    if (step === 1) return dietary !== ''
    if (step === 2) return prepFrequency !== ''
    if (step === 4) return cuisine !== ''
    return true
  }

  async function handleFinish() {
    setSaving(true)
    setError(null)
    try {
      await saveFoodConfig({
        dietary_preference: dietary,
        intolerances: intolerances || null,
        prep_frequency: prepFrequency,
        weight_kg: weight ? parseFloat(weight) : null,
        calorie_baseline_kcal: calorieBaseline,
        cuisine_preference: cuisine,
        regenerate: true,
      })
      navigate('/food')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Set up Nutrition</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Step {step} of {TOTAL_STEPS}
        </p>
        <div style={{ marginTop: 12, height: 4, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            height: '100%',
            width: `${(step / TOTAL_STEPS) * 100}%`,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Dietary preference</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            Your meals will always respect these preferences.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {DIETARY_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setDietary(opt.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius)',
                  border: `2px solid ${dietary === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: dietary === opt.id ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
              Food intolerances or allergies
            </label>
            <input
              type="text"
              value={intolerances}
              onChange={e => setIntolerances(e.target.value)}
              placeholder="e.g. gluten, lactose, nuts (leave blank if none)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Meal prep frequency</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            How often do you want to cook? Your plan will batch meals accordingly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PREP_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setPrepFrequency(opt.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius)',
                  border: `2px solid ${prepFrequency === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: prepFrequency === opt.id ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Calorie baseline</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            Used to calibrate daily targets. Enter your weight for an automatic estimate, or set directly.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
              Body weight (optional)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={30}
                max={200}
                value={weight}
                onChange={e => handleWeightChange(e.target.value)}
                placeholder="e.g. 72"
                style={{
                  width: 120,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>kg</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
              Daily calorie target
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1200}
                max={5000}
                step={50}
                value={calorieBaseline}
                onChange={e => {
                  setCalorieBaseline(parseInt(e.target.value) || 2200)
                  setCalorieEdited(true)
                }}
                style={{
                  width: 120,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>kcal / day</span>
            </div>
            {weight && !calorieEdited && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Auto-estimated from {weight} kg × 35. Adjust if this doesn't feel right.
              </p>
            )}
            {!weight && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Default 2200 kcal/day. Add your weight above for a personalised estimate.
              </p>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Cuisine style</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            This is a hint, not a constraint. Your plan will lean this way.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CUISINE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setCuisine(opt.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius)',
                  border: `2px solid ${cuisine === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: cuisine === opt.id ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 16 }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        {step > 1 ? (
          <button
            onClick={() => setStep(s => s - 1)}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Back
          </button>
        ) : <div />}

        {step < TOTAL_STEPS ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canAdvance()}
            style={{
              padding: '10px 24px',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: canAdvance() ? 'var(--accent)' : 'var(--border)',
              color: canAdvance() ? 'white' : 'var(--text-muted)',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={saving || !canAdvance()}
            style={{
              padding: '10px 24px',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {saving ? 'Saving…' : 'Generate my plan'}
          </button>
        )}
      </div>
    </div>
  )
}
