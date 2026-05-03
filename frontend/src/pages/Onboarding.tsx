import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Bike, Dumbbell, Fish, Salad } from 'lucide-react'
import { updateProfile } from '../lib/api'

const MODULES = [
  { icon: Activity, label: 'Running', color: '#3b82f6', available: true },
  { icon: Bike, label: 'Biking', color: '#f97316', available: false },
  { icon: Fish, label: 'Swimming', color: '#06b6d4', available: false },
  { icon: Dumbbell, label: 'Gym', color: '#a855f7', available: false },
  { icon: Salad, label: 'Food', color: '#22c55e', available: true },
]

// Pentagon positions (cx, cy) for 5 nodes, top-center first, clockwise
const NODE_POSITIONS = [
  { x: 200, y: 40 },   // Running (top)
  { x: 370, y: 165 },  // Biking (top-right)
  { x: 305, y: 340 },  // Food (bottom-right)
  { x: 95, y: 340 },   // Swimming (bottom-left)
  { x: 30, y: 165 },   // Gym (top-left)
]

// Edges with labels — based on actual cross-module signals
const EDGES = [
  { from: 0, to: 4, label: 'fatigue load' },       // Running → Food
  { from: 1, to: 4, label: 'fuelling needs' },      // Biking → Food
  { from: 2, to: 4, label: 'recovery nutrition' },  // Swimming → Food
  { from: 3, to: 4, label: 'calorie targets' },     // Gym → Food
  { from: 0, to: 1, label: 'brick session' },       // Running ↔ Biking
  { from: 1, to: 2, label: 'race week taper' },     // Biking ↔ Swimming
  { from: 0, to: 2, label: 'training load' },       // Running ↔ Swimming
  { from: 3, to: 2, label: 'soreness signals' },    // Gym → Swimming
]

function SignalsWeb() {
  return (
    <svg viewBox="0 0 400 420" style={{ width: '100%', maxWidth: 400, margin: '0 auto', display: 'block' }}>
      {EDGES.map((edge, i) => {
        const a = NODE_POSITIONS[edge.from]
        const b = NODE_POSITIONS[edge.to]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        return (
          <g key={i}>
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#2a2a2a"
              strokeWidth={1.5}
            />
            <text
              x={mx} y={my}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#555"
              fontSize={9}
              style={{ userSelect: 'none' }}
            >
              {edge.label}
            </text>
          </g>
        )
      })}
      {MODULES.map((mod, i) => {
        const pos = NODE_POSITIONS[i]
        const Icon = mod.icon
        return (
          <g key={i}>
            <circle
              cx={pos.x} cy={pos.y} r={28}
              fill="#1a1a1a"
              stroke={mod.available ? mod.color : '#2a2a2a'}
              strokeWidth={mod.available ? 2 : 1}
            />
            <foreignObject x={pos.x - 12} y={pos.y - 12} width={24} height={24}>
              <div style={{ color: mod.available ? mod.color : '#444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} />
              </div>
            </foreignObject>
            <text
              x={pos.x} y={pos.y + 42}
              textAnchor="middle"
              fill={mod.available ? '#e8e8e8' : '#555'}
              fontSize={10}
              style={{ userSelect: 'none' }}
            >
              {mod.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🧱</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1px', marginBottom: 16 }}>
          Welcome to Brickhub
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 480 }}>
          Your personal triathlon coach — running, biking, swimming, gym, and nutrition, all in one place.
          Each module learns from the others so your plans always reflect your full training picture.
        </p>
      </div>

      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Your modules</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
          Each discipline is its own module. Set them up whenever you're ready — you don't need all five active at once.
          Running and Food are available now, with the rest coming soon.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {MODULES.map(({ icon: Icon, label, color, available }) => (
            <div
              key={label}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${available ? color + '44' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '16px 8px',
                textAlign: 'center',
                opacity: available ? 1 : 0.45,
              }}
            >
              <Icon size={20} color={available ? color : '#555'} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: available ? 'var(--text)' : 'var(--text-muted)' }}>{label}</div>
              {!available && (
                <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>soon</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Cross-module intelligence</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
          Brickhub reads signals across your training — fatigue from a long ride adjusts your dinner plan,
          gym soreness shapes your swim intensity, race week taper flows into every module automatically.
        </p>
        <SignalsWeb />
      </div>

      <button
        onClick={onNext}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: '14px 32px',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        Set up your profile →
      </button>
    </div>
  )
}

function ProfileStep() {
  const navigate = useNavigate()
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [weeklyHours, setWeeklyHours] = useState(8)
  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: '',
    weight: '',
    heightCm: '',
    heightFt: '',
    heightIn: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.sex) { setError('Please select sex.'); return }

    let weight_kg: number | null = null
    let height_cm: number | null = null

    if (form.weight) {
      const w = parseFloat(form.weight)
      weight_kg = units === 'metric' ? w : w * 0.453592
    }
    if (units === 'metric' && form.heightCm) {
      height_cm = parseFloat(form.heightCm)
    } else if (units === 'imperial' && (form.heightFt || form.heightIn)) {
      const ft = parseFloat(form.heightFt || '0')
      const inch = parseFloat(form.heightIn || '0')
      height_cm = (ft * 12 + inch) * 2.54
    }

    setSaving(true)
    setError('')
    try {
      await updateProfile({
        name: form.name.trim(),
        age: form.age ? parseInt(form.age) : undefined,
        sex: form.sex,
        weight_kg: weight_kg ?? undefined,
        height_cm: height_cm ?? undefined,
        unit_preference: units,
        weekly_training_hours: weeklyHours,
      } as Parameters<typeof updateProfile>[0])
      navigate('/')
    } catch {
      setError('Failed to save profile. Try again.')
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 'var(--radius)',
    padding: '10px 12px',
    fontSize: 14,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
        Tell us about yourself
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 40, lineHeight: 1.6 }}>
        This helps your coach calibrate training loads, nutrition targets, and recovery recommendations to you specifically.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              placeholder="What should we call you?"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Age</label>
              <input
                style={inputStyle}
                type="number"
                min={10}
                max={100}
                placeholder="e.g. 32"
                value={form.age}
                onChange={e => set('age', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Sex</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Male', 'Female'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('sex', s)}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${form.sex === s ? 'var(--accent)' : 'var(--border)'}`,
                      background: form.sex === s ? 'var(--accent)' : 'var(--surface)',
                      color: form.sex === s ? '#fff' : 'var(--text-muted)',
                      fontSize: 13,
                      fontWeight: form.sex === s ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Units</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['metric', 'imperial'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnits(u)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${units === u ? 'var(--accent)' : 'var(--border)'}`,
                    background: units === u ? 'var(--accent)' : 'var(--surface)',
                    color: units === u ? '#fff' : 'var(--text-muted)',
                    fontSize: 13,
                    fontWeight: units === u ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {u === 'metric' ? 'Metric (kg, cm)' : 'Imperial (lbs, ft)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Weight {units === 'metric' ? '(kg)' : '(lbs)'}</label>
            <input
              style={inputStyle}
              type="number"
              min={30}
              max={300}
              step={0.1}
              placeholder={units === 'metric' ? 'e.g. 72' : 'e.g. 158'}
              value={form.weight}
              onChange={e => set('weight', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Height</label>
            {units === 'metric' ? (
              <input
                style={inputStyle}
                type="number"
                min={100}
                max={250}
                placeholder="cm, e.g. 178"
                value={form.heightCm}
                onChange={e => set('heightCm', e.target.value)}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  style={inputStyle}
                  type="number"
                  min={3}
                  max={8}
                  placeholder="ft, e.g. 5"
                  value={form.heightFt}
                  onChange={e => set('heightFt', e.target.value)}
                />
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  max={11}
                  placeholder="in, e.g. 10"
                  value={form.heightIn}
                  onChange={e => set('heightIn', e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>
              Weekly training hours — <span style={{ color: 'var(--text)', fontWeight: 600 }}>{weeklyHours}h</span>
            </label>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={weeklyHours}
              onChange={e => setWeeklyHours(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>2h</span><span>20h</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Across all sports. Keeps total training load realistic. You can change this anytime in Settings.
            </p>
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? 'var(--border)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '14px 32px',
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              marginTop: 8,
            }}
          >
            {saving ? 'Saving...' : "Let's go →"}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Onboarding() {
  const [step, setStep] = useState<'welcome' | 'profile'>('welcome')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', overflowY: 'auto' }}>
      {step === 'welcome'
        ? <WelcomeStep onNext={() => setStep('profile')} />
        : <ProfileStep />
      }
    </div>
  )
}
