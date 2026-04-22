import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  classifyRunningAbility,
  getRunningConfig,
  saveRunningConfig,
  ClassifyResult,
  RunningConfig,
} from '../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const DISTANCES = [
  { id: '5k', label: '5K', typical: '20–40 min' },
  { id: '10k', label: '10K', typical: '40–80 min' },
  { id: '10_mile', label: '10 Mile', typical: '65–110 min' },
  { id: 'half_marathon', label: 'Half Marathon', typical: '1:30–3:00 hr' },
  { id: 'marathon', label: 'Marathon', typical: '3:00–6:00 hr' },
  { id: '50k', label: '50K', typical: '4:00–8:00 hr' },
]

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntilMonday)
  return d.toISOString().split('T')[0]
}

function weeksUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.round(diff / (7 * 24 * 60 * 60 * 1000))
}

function secondsToHMS(total: number): { h: number; m: number; s: number } {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return { h, m, s }
}

function hmsToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s
}

function formatDuration(seconds: number): string {
  const { h, m, s } = secondsToHMS(seconds)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const pill = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 20,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  transition: 'all 0.1s',
})

const tile = (active: boolean): React.CSSProperties => ({
  padding: '20px 16px',
  borderRadius: 10,
  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.1s',
})

const card: React.CSSProperties = {
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid var(--accent)',
  borderRadius: 10,
  padding: '16px 20px',
  marginTop: 16,
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 24px',
  fontSize: 14,
  cursor: 'pointer',
}

// ── Step components ───────────────────────────────────────────────────────────

function Step1({
  targetDistance,
  setTargetDistance,
  onNext,
}: {
  targetDistance: string
  setTargetDistance: (v: string) => void
  onNext: () => void
}) {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>What's your goal distance?</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Choose the race or distance you're training for.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {DISTANCES.map(d => (
          <div key={d.id} style={tile(targetDistance === d.id)} onClick={() => setTargetDistance(d.id)}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{d.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{d.typical}</div>
          </div>
        ))}
      </div>
      <button style={btnPrimary} disabled={!targetDistance} onClick={onNext}>
        Next →
      </button>
    </div>
  )
}

function Step2({
  targetDistance,
  hasPreviousRace,
  setHasPreviousRace,
  bestTimeSeconds,
  setBestTimeSeconds,
  effortScore,
  setEffortScore,
  recentRunsNoRace,
  setRecentRunsNoRace,
  classifyResult,
  classifying,
  onNext,
  onBack,
}: {
  targetDistance: string
  hasPreviousRace: boolean | null
  setHasPreviousRace: (v: boolean) => void
  bestTimeSeconds: number
  setBestTimeSeconds: (v: number) => void
  effortScore: number
  setEffortScore: (v: number) => void
  recentRunsNoRace: number
  setRecentRunsNoRace: (v: number) => void
  classifyResult: ClassifyResult | null
  classifying: boolean
  onNext: () => void
  onBack: () => void
}) {
  const { h, m, s } = secondsToHMS(bestTimeSeconds)
  const distLabel = DISTANCES.find(d => d.id === targetDistance)?.label || targetDistance

  const canProceed = hasPreviousRace === false || (hasPreviousRace === true && bestTimeSeconds > 0)

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Ability assessment</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Have you run a {distLabel} before?
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div style={tile(hasPreviousRace === true)} onClick={() => setHasPreviousRace(true)}>
          <div style={{ fontWeight: 600 }}>Yes, I have</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>I have a time to share</div>
        </div>
        <div style={tile(hasPreviousRace === false)} onClick={() => setHasPreviousRace(false)}>
          <div style={{ fontWeight: 600 }}>First time</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>No previous race</div>
        </div>
      </div>

      {hasPreviousRace === true && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Best time (HH:MM:SS)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[
                { val: h, max: 9, label: 'h', onChange: (v: number) => setBestTimeSeconds(hmsToSeconds(v, m, s)) },
                { val: m, max: 59, label: 'min', onChange: (v: number) => setBestTimeSeconds(hmsToSeconds(h, v, s)) },
                { val: s, max: 59, label: 'sec', onChange: (v: number) => setBestTimeSeconds(hmsToSeconds(h, m, v)) },
              ].map(({ val, max, label, onChange }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={val}
                    onChange={e => onChange(Math.min(max, Math.max(0, parseInt(e.target.value) || 0)))}
                    style={{
                      width: 60,
                      padding: '8px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      textAlign: 'center',
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              How hard did you push? {effortScore}/10
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80 }}>easy stroll</span>
              <input
                type="range"
                min={1}
                max={10}
                value={effortScore}
                onChange={e => setEffortScore(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, textAlign: 'right' }}>absolute max</span>
            </div>
          </div>

          {classifying && (
            <div style={{ ...card, color: 'var(--text-muted)', fontSize: 13 }}>Classifying...</div>
          )}
          {classifyResult && !classifying && (
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Your level: <span style={{ color: 'var(--accent)' }}>{capitalise(classifyResult.adjusted_level)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{classifyResult.explanation}</div>
            </div>
          )}
        </div>
      )}

      {hasPreviousRace === false && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            No problem — we'll start you at Beginner level. How many runs per week have you been doing recently?
          </p>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Runs per week: <strong style={{ color: 'var(--text)' }}>{recentRunsNoRace}</strong>
          </label>
          <input
            type="range"
            min={0}
            max={7}
            value={recentRunsNoRace}
            onChange={e => setRecentRunsNoRace(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>0</span><span>7</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onBack}>← Back</button>
        <button style={btnPrimary} disabled={!canProceed} onClick={onNext}>Next →</button>
      </div>
    </div>
  )
}

function Step3({
  recentRuns4Weeks,
  setRecentRuns4Weeks,
  suggestedRunsPerWeek,
  preferredDays,
  setPreferredDays,
  longRunDay,
  setLongRunDay,
  onNext,
  onBack,
}: {
  recentRuns4Weeks: number
  setRecentRuns4Weeks: (v: number) => void
  suggestedRunsPerWeek: number
  preferredDays: string[]
  setPreferredDays: (v: string[]) => void
  longRunDay: string
  setLongRunDay: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const toggleDay = (day: string) => {
    if (preferredDays.includes(day)) {
      setPreferredDays(preferredDays.filter(d => d !== day))
      if (longRunDay === day) setLongRunDay('')
    } else {
      setPreferredDays([...preferredDays, day])
    }
  }

  const canProceed = preferredDays.length > 0 && longRunDay !== ''

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Training load & schedule</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        How have you been training lately, and when do you prefer to run?
      </p>

      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          Runs in the last 4 weeks: <strong style={{ color: 'var(--text)' }}>{recentRuns4Weeks}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={30}
          value={recentRuns4Weeks}
          onChange={e => setRecentRuns4Weeks(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>0</span><span>30</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 8 }}>
          We suggest starting with <strong>{suggestedRunsPerWeek} runs/week</strong>
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          Preferred training days
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DAYS.map(day => (
            <button key={day} style={pill(preferredDays.includes(day))} onClick={() => toggleDay(day)}>
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      {preferredDays.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
            Long run day
            <span style={{ color: 'var(--accent)', marginLeft: 6, fontWeight: 600 }}>*</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>— pick one</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {preferredDays.map(day => (
              <button key={day} style={pill(longRunDay === day)} onClick={() => setLongRunDay(day)}>
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button style={btnSecondary} onClick={onBack}>← Back</button>
        <button style={btnPrimary} disabled={!canProceed} onClick={onNext}>Next →</button>
        {!canProceed && preferredDays.length > 0 && longRunDay === '' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select a long run day to continue</span>
        )}
      </div>
    </div>
  )
}

function Step4({
  hasRace,
  setHasRace,
  raceDate,
  setRaceDate,
  planWeeks,
  setPlanWeeks,
  planStartDate,
  setPlanStartDate,
  onNext,
  onBack,
}: {
  hasRace: boolean | null
  setHasRace: (v: boolean) => void
  raceDate: string
  setRaceDate: (v: string) => void
  planWeeks: number
  setPlanWeeks: (v: number) => void
  planStartDate: string
  setPlanStartDate: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const weeks = raceDate ? weeksUntil(raceDate) : 0
  let raceWarning = ''
  if (raceDate) {
    if (weeks < 4) raceWarning = "That's very soon — we'll generate a race-prep plan."
    else if (weeks > 52) raceWarning = "That's over a year away. We'll build your base first and recalibrate closer to race day."
    else raceWarning = `That's ${weeks} weeks — enough time for a solid build.`
  }

  const canProceed = hasRace === false || (hasRace === true && raceDate !== '')

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Plan timeline</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Are you training for a specific race?
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div style={tile(hasRace === true)} onClick={() => setHasRace(true)}>
          <div style={{ fontWeight: 600 }}>Yes, I have a race</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Set a specific date</div>
        </div>
        <div style={tile(hasRace === false)} onClick={() => setHasRace(false)}>
          <div style={{ fontWeight: 600 }}>Just training</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>No specific race</div>
        </div>
      </div>

      {hasRace === true && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Race date
          </label>
          <input
            type="date"
            value={raceDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setRaceDate(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 14,
            }}
          />
          {raceWarning && (
            <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 8 }}>{raceWarning}</p>
          )}
        </div>
      )}

      {hasRace === false && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              Training duration
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[4, 8, 12, 16, 20].map(w => (
                <button key={w} style={pill(planWeeks === w)} onClick={() => setPlanWeeks(w)}>
                  {w} weeks
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Plan start date
            </label>
            <input
              type="date"
              value={planStartDate}
              onChange={e => setPlanStartDate(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 14,
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onBack}>← Back</button>
        <button style={btnPrimary} disabled={!canProceed} onClick={onNext}>Next →</button>
      </div>
    </div>
  )
}

function Step5({
  config,
  onEdit,
  onConfirm,
  saving,
}: {
  config: {
    targetDistance: string
    abilityLevel: string
    aerobicBasePriority: boolean
    suggestedRunsPerWeek: number
    preferredDays: string[]
    longRunDay: string
    planStartDate: string
    raceDate: string
    hasRace: boolean | null
    planWeeks: number
  }
  onEdit: () => void
  onConfirm: () => void
  saving: boolean
}) {
  const distLabel = DISTANCES.find(d => d.id === config.targetDistance)?.label || config.targetDistance
  const days = config.preferredDays.map(d => DAY_LABELS[d]).join(', ')
  const weeks = config.raceDate ? weeksUntil(config.raceDate) : config.planWeeks

  const rows: [string, string][] = [
    ['Goal', distLabel],
    ['Level', `${capitalise(config.abilityLevel)}${config.aerobicBasePriority ? ' (aerobic base priority)' : ''}`],
    ['Runs/week', `${config.suggestedRunsPerWeek}  (${days})`],
    ['Long run', DAY_LABELS[config.longRunDay] || config.longRunDay],
    ['Starts', new Date(config.planStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
    config.hasRace
      ? ['Race', `${new Date(config.raceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}  (${weeks} weeks)`]
      : ['Duration', `${config.planWeeks} weeks`],
  ]

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Your running plan</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Review your setup before generating.
      </p>

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 32,
      }}>
        {rows.map(([label, value], i) => (
          <div key={label} style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            padding: '14px 20px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            fontSize: 14,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onEdit}>← Edit</button>
        <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={onConfirm}>
          {saving ? 'Generating...' : 'Generate my plan →'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunningSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)

  // Step 1
  const [targetDistance, setTargetDistance] = useState('')

  // Step 2
  const [hasPreviousRace, setHasPreviousRace] = useState<boolean | null>(null)
  const [bestTimeSeconds, setBestTimeSeconds] = useState(0)
  const [effortScore, setEffortScore] = useState(7)
  const [recentRunsNoRace, setRecentRunsNoRace] = useState(3)
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [abilityLevel, setAbilityLevel] = useState('beginner')
  const [aerobicBasePriority, setAerobicBasePriority] = useState(false)

  // Step 3
  const [recentRuns4Weeks, setRecentRuns4Weeks] = useState(12)
  const [suggestedRunsPerWeek, setSuggestedRunsPerWeek] = useState(3)
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [longRunDay, setLongRunDay] = useState('')

  // Step 4
  const [hasRace, setHasRace] = useState<boolean | null>(null)
  const [raceDate, setRaceDate] = useState('')
  const [planWeeks, setPlanWeeks] = useState(12)
  const [planStartDate, setPlanStartDate] = useState(nextMonday())

  const [saving, setSaving] = useState(false)

  // Pre-fill from existing config
  useEffect(() => {
    getRunningConfig().then(({ config }) => {
      if (config) {
        setTargetDistance(config.target_distance)
        setHasPreviousRace(config.has_previous_race)
        if (config.best_time_seconds) setBestTimeSeconds(config.best_time_seconds)
        if (config.effort_score) setEffortScore(config.effort_score)
        setAbilityLevel(config.ability_level)
        setAerobicBasePriority(config.aerobic_base_priority)
        setRecentRuns4Weeks(config.recent_runs_4_weeks)
        setSuggestedRunsPerWeek(config.suggested_runs_per_week)
        setPreferredDays(config.preferred_days)
        setLongRunDay(config.long_run_day)
        if (config.race_date) { setHasRace(true); setRaceDate(config.race_date) }
        if (config.plan_weeks) setPlanWeeks(config.plan_weeks)
        if (config.plan_start_date) setPlanStartDate(config.plan_start_date)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Auto-classify when time or effort changes (step 2)
  useEffect(() => {
    if (!hasPreviousRace || !targetDistance || bestTimeSeconds <= 0) return
    const t = setTimeout(async () => {
      setClassifying(true)
      try {
        const result = await classifyRunningAbility({ distance: targetDistance, time_seconds: bestTimeSeconds, effort_score: effortScore })
        setClassifyResult(result)
        setAbilityLevel(result.adjusted_level)
        setAerobicBasePriority(result.aerobic_base_priority)
      } catch { /* ignore */ }
      setClassifying(false)
    }, 600)
    return () => clearTimeout(t)
  }, [targetDistance, bestTimeSeconds, effortScore, hasPreviousRace])

  // Update suggested runs when recentRuns4Weeks changes
  useEffect(() => {
    const caps: Record<string, number> = { beginner: 4, intermediate: 5, advanced: 6, elite: 7 }
    const avg = recentRuns4Weeks / 4
    const suggested = Math.min(Math.max(2, Math.round(avg * 0.8)), caps[abilityLevel] || 4)
    setSuggestedRunsPerWeek(suggested)
  }, [recentRuns4Weeks, abilityLevel])

  const handleStep2Next = () => {
    if (!hasPreviousRace) {
      setAbilityLevel('beginner')
      setAerobicBasePriority(false)
      setRecentRuns4Weeks(recentRunsNoRace * 4)
    }
    setStep(3)
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const effectiveRaceDate = hasRace ? raceDate : null
      const effectivePlanWeeks = hasRace ? null : planWeeks

      // Reuse planStartDate or next monday if race
      const effectiveStartDate = hasRace ? nextMonday() : planStartDate

      await saveRunningConfig({
        target_distance: targetDistance,
        has_previous_race: hasPreviousRace ?? false,
        best_time_seconds: hasPreviousRace ? bestTimeSeconds : null,
        effort_score: hasPreviousRace ? effortScore : null,
        ability_level: abilityLevel,
        aerobic_base_priority: aerobicBasePriority,
        recent_runs_4_weeks: hasPreviousRace ? recentRuns4Weeks : recentRunsNoRace * 4,
        suggested_runs_per_week: suggestedRunsPerWeek,
        preferred_days: preferredDays,
        long_run_day: longRunDay,
        plan_start_date: effectiveStartDate,
        race_date: effectiveRaceDate,
        plan_weeks: effectivePlanWeeks,
      })
      navigate('/running')
    } catch (e: any) {
      alert('Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>

  const progressPct = ((step - 1) / 4) * 100

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Running Setup</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Step {step} of 5</p>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 12 }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {step === 1 && (
        <Step1
          targetDistance={targetDistance}
          setTargetDistance={setTargetDistance}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2
          targetDistance={targetDistance}
          hasPreviousRace={hasPreviousRace}
          setHasPreviousRace={setHasPreviousRace}
          bestTimeSeconds={bestTimeSeconds}
          setBestTimeSeconds={setBestTimeSeconds}
          effortScore={effortScore}
          setEffortScore={setEffortScore}
          recentRunsNoRace={recentRunsNoRace}
          setRecentRunsNoRace={setRecentRunsNoRace}
          classifyResult={classifyResult}
          classifying={classifying}
          onNext={handleStep2Next}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          recentRuns4Weeks={recentRuns4Weeks}
          setRecentRuns4Weeks={setRecentRuns4Weeks}
          suggestedRunsPerWeek={suggestedRunsPerWeek}
          preferredDays={preferredDays}
          setPreferredDays={setPreferredDays}
          longRunDay={longRunDay}
          setLongRunDay={setLongRunDay}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <Step4
          hasRace={hasRace}
          setHasRace={setHasRace}
          raceDate={raceDate}
          setRaceDate={setRaceDate}
          planWeeks={planWeeks}
          setPlanWeeks={setPlanWeeks}
          planStartDate={planStartDate}
          setPlanStartDate={setPlanStartDate}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}
      {step === 5 && (
        <Step5
          config={{
            targetDistance,
            abilityLevel,
            aerobicBasePriority,
            suggestedRunsPerWeek,
            preferredDays,
            longRunDay,
            planStartDate,
            raceDate,
            hasRace,
            planWeeks,
          }}
          onEdit={() => setStep(4)}
          onConfirm={handleConfirm}
          saving={saving}
        />
      )}
    </div>
  )
}
