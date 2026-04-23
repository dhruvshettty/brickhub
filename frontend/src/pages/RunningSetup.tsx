import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  classifyRunningAbility,
  getRunningConfig,
  getProfile,
  updateProfile,
  saveRunningConfig,
  ClassifyResult,
  RunningConfig,
} from '../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { id: 'finish', label: 'Just finish', desc: 'Complete the distance — time is not the priority.' },
  { id: 'beat_time', label: 'Beat a target time', desc: 'I have a goal finish time in mind.' },
  { id: 'fitness', label: 'Build fitness', desc: 'No race planned — just improving my running.' },
]

const VOLUME_OPTIONS = [
  {
    id: 'gradual',
    label: 'Gradual',
    desc: 'Slow, conservative build. Best for returning from a break or new to structured training.',
    points: '0,34 17,33 33,31 50,29 67,27 83,25 100,23',
  },
  {
    id: 'steady',
    label: 'Steady',
    desc: 'Standard ~10%/week progression. The proven default for consistent improvement.',
    points: '0,34 17,29 33,23 50,18 67,13 83,9 100,6',
  },
  {
    id: 'progressive',
    label: 'Progressive',
    desc: 'Block periodization — build hard, recover, build harder. For athletes who respond well to load.',
    points: '0,34 17,27 33,20 50,26 67,16 83,22 100,10',
  },
]

const EFFORT_OPTIONS = [
  { id: 'comfortable', label: 'Comfortable', desc: '~75% easy running. Aerobic base first, intensity later.' },
  { id: 'balanced', label: 'Balanced', desc: '80/20 easy/hard. Standard polarized training.' },
  { id: 'challenging', label: 'Challenging', desc: 'More threshold and intervals. For athletes ready to push.' },
]

const TERRAINS = [
  { id: 'flat', label: 'Flat', desc: '< 5m/km elevation gain' },
  { id: 'rolling', label: 'Rolling', desc: '5–10m/km elevation gain' },
  { id: 'moderate', label: 'Moderate', desc: '10–20m/km elevation gain' },
  { id: 'hilly', label: 'Hilly', desc: '> 20m/km elevation gain' },
]

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

type Week1Day = { day: string; type: string; km: number }

function computeWeek1Preview(
  preferredDays: string[],
  longRunDay: string,
  suggestedRunsPerWeek: number,
  currentWeeklyKm: number,
  abilityLevel: string,
  effortPreference: string,
): Week1Day[] {
  if (preferredDays.length === 0 || !longRunDay) return []

  const count = Math.min(suggestedRunsPerWeek, preferredDays.length)
  const selected: string[] = []
  if (preferredDays.includes(longRunDay)) selected.push(longRunDay)
  for (const d of preferredDays) {
    if (selected.length >= count) break
    if (!selected.includes(d)) selected.push(d)
  }
  // Sort by day of week order
  const order = DAYS
  selected.sort((a, b) => order.indexOf(a) - order.indexOf(b))

  const baseKm = currentWeeklyKm > 0 ? currentWeeklyKm
    : abilityLevel === 'advanced' || abilityLevel === 'elite' ? 40
    : abilityLevel === 'intermediate' ? 25
    : 15

  const longRunKm = Math.round(baseKm * 0.35)
  const otherCount = selected.length - 1
  const easyKm = otherCount > 0 ? Math.round((baseKm - longRunKm) / otherCount) : 0
  const easyLabel = effortPreference === 'challenging' ? 'Tempo run' : 'Easy run'

  return selected.map(d => ({
    day: DAY_LABELS[d],
    type: d === longRunDay ? 'Long run' : easyLabel,
    km: d === longRunDay ? longRunKm : easyKm,
  }))
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

// ── Volume graph ──────────────────────────────────────────────────────────────

function VolumeGraph({ points, active }: { points: string; active: boolean }) {
  return (
    <svg viewBox="0 0 100 40" style={{ width: '100%', height: 36, display: 'block', marginTop: 8 }}>
      <polyline
        points={points}
        fill="none"
        stroke={active ? 'var(--accent)' : 'var(--border)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Step components ───────────────────────────────────────────────────────────

function Step0Profile({
  name,
  setName,
  age,
  setAge,
  weightKg,
  setWeightKg,
  weeklyHours,
  setWeeklyHours,
  onNext,
  saving,
}: {
  name: string
  setName: (v: string) => void
  age: number | ''
  setAge: (v: number | '') => void
  weightKg: number | ''
  setWeightKg: (v: number | '') => void
  weeklyHours: number
  setWeeklyHours: (v: number) => void
  onNext: () => void
  saving: boolean
}) {
  const canProceed = name.trim().length > 0

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 14,
    boxSizing: 'border-box',
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Tell us about yourself</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Used to personalise your training plan.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
          Name <span style={{ color: 'var(--accent)' }}>*</span>
        </label>
        <input
          type="text"
          value={name}
          placeholder="Your name"
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            Age <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="number"
            value={age}
            min={10}
            max={100}
            placeholder="—"
            onChange={e => setAge(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            Weight (kg) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="number"
            value={weightKg}
            min={30}
            max={250}
            step={0.5}
            placeholder="—"
            onChange={e => setWeightKg(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          Weekly training hours available:{' '}
          <strong style={{ color: 'var(--text)' }}>{weeklyHours}h</strong>
        </label>
        <input
          type="range"
          min={2}
          max={20}
          step={1}
          value={weeklyHours}
          onChange={e => setWeeklyHours(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>2h</span><span>20h</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Across all sports — running, biking, gym. Used to keep your total load realistic.
        </p>
      </div>

      <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={!canProceed || saving} onClick={onNext}>
        {saving ? 'Saving...' : 'Next →'}
      </button>
    </div>
  )
}

function Step1({
  trainingGoal,
  setTrainingGoal,
  goalTargetTimeSeconds,
  setGoalTargetTimeSeconds,
  targetDistance,
  setTargetDistance,
  raceTerrain,
  setRaceTerrain,
  trainingTerrain,
  setTrainingTerrain,
  onNext,
  onBack,
}: {
  trainingGoal: string
  setTrainingGoal: (v: string) => void
  goalTargetTimeSeconds: number
  setGoalTargetTimeSeconds: (v: number) => void
  targetDistance: string
  setTargetDistance: (v: string) => void
  raceTerrain: string
  setRaceTerrain: (v: string) => void
  trainingTerrain: string
  setTrainingTerrain: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const { h, m, s } = secondsToHMS(goalTargetTimeSeconds)
  const goalTimeValid = trainingGoal !== 'beat_time' || goalTargetTimeSeconds > 0
  const canProceed = !!trainingGoal && !!targetDistance && !!raceTerrain && !!trainingTerrain && goalTimeValid

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>What's your training goal?</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        This shapes the whole plan — be honest with yourself.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {GOAL_OPTIONS.map(g => (
          <div key={g.id} style={tile(trainingGoal === g.id)} onClick={() => setTrainingGoal(g.id)}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{g.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{g.desc}</div>
          </div>
        ))}
      </div>

      {trainingGoal === 'beat_time' && (
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Target finish time
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {[
              { val: h, max: 9, label: 'h', onChange: (v: number) => setGoalTargetTimeSeconds(hmsToSeconds(v, m, s)) },
              { val: m, max: 59, label: 'min', onChange: (v: number) => setGoalTargetTimeSeconds(hmsToSeconds(h, v, s)) },
              { val: s, max: 59, label: 'sec', onChange: (v: number) => setGoalTargetTimeSeconds(hmsToSeconds(h, m, v)) },
            ].map(({ val, max, label, onChange }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  min={0}
                  max={max}
                  value={val}
                  onFocus={e => e.target.select()}
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
      )}

      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
          {trainingGoal === 'fitness' ? 'Target distance' : 'Goal distance'}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          {trainingGoal === 'fitness'
            ? 'Choose the distance you want to be able to run comfortably.'
            : "Choose the race or distance you're training for."}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {DISTANCES.map(d => (
          <div key={d.id} style={tile(targetDistance === d.id)} onClick={() => setTargetDistance(d.id)}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{d.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{d.typical}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Race terrain
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>— what's the course like?</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {TERRAINS.map(t => (
            <div key={t.id} style={tile(raceTerrain === t.id)} onClick={() => setRaceTerrain(t.id)}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Training terrain
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>— where do you do most of your runs?</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {TERRAINS.map(t => (
            <div key={t.id} style={tile(trainingTerrain === t.id)} onClick={() => setTrainingTerrain(t.id)}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onBack}>← Back</button>
        <button style={btnPrimary} disabled={!canProceed} onClick={onNext}>Next →</button>
      </div>
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
                    onFocus={e => e.target.select()}
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
              Rate of Perceived Exertion (RPE) — how hard was that race?
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={effortScore}
              onChange={e => setEffortScore(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              <span>1</span><span>10</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>RPE {effortScore}</strong>
              {' — '}
              {[
                '',
                'Very light — barely any effort, could do this all day',
                'Light — easy breathing, full conversation possible',
                'Moderate — comfortable, slightly elevated breathing',
                'Somewhat hard — breathing harder, still talkable',
                'Hard — noticeably breathless, short sentences only',
                'Hard — breathing heavy, can manage a few words',
                'Very hard — difficult to speak, near your limit',
                'Very hard — gasping, could not maintain much longer',
                'Near maximum — barely able to continue',
                'Maximum effort — all out, nothing left in the tank',
              ][effortScore]}
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
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          No problem — we'll start you at Beginner level. You can share your training history in the next step.
        </p>
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
  currentWeeklyKm,
  setCurrentWeeklyKm,
  suggestedRunsPerWeek,
  preferredDays,
  setPreferredDays,
  longRunDay,
  setLongRunDay,
  volumePreference,
  setVolumePreference,
  effortPreference,
  setEffortPreference,
  isPrimarySport,
  setIsPrimarySport,
  preferencesUserSet,
  onPreferenceChange,
  onNext,
  onBack,
}: {
  recentRuns4Weeks: number
  setRecentRuns4Weeks: (v: number) => void
  currentWeeklyKm: number
  setCurrentWeeklyKm: (v: number) => void
  suggestedRunsPerWeek: number
  preferredDays: string[]
  setPreferredDays: (v: string[]) => void
  longRunDay: string
  setLongRunDay: (v: string) => void
  volumePreference: string
  setVolumePreference: (v: string) => void
  effortPreference: string
  setEffortPreference: (v: string) => void
  isPrimarySport: boolean
  setIsPrimarySport: (v: boolean) => void
  preferencesUserSet: boolean
  onPreferenceChange: () => void
  onNext: () => void
  onBack: () => void
}) {
  const [prefsExpanded, setPrefsExpanded] = useState(false)

  const toggleDay = (day: string) => {
    if (preferredDays.includes(day)) {
      setPreferredDays(preferredDays.filter(d => d !== day))
      if (longRunDay === day) setLongRunDay('')
    } else {
      setPreferredDays([...preferredDays, day])
    }
  }

  const handleVolumeChange = (v: string) => { setVolumePreference(v); onPreferenceChange() }
  const handleEffortChange = (v: string) => { setEffortPreference(v); onPreferenceChange() }
  const handlePrimaryChange = (v: boolean) => { setIsPrimarySport(v); onPreferenceChange() }

  const kmRequired = recentRuns4Weeks > 0 && currentWeeklyKm === 0
  const canProceed = preferredDays.length > 0 && longRunDay !== '' && !kmRequired

  const suggestionReason = recentRuns4Weeks === 0
    ? 'No recent runs — starting fresh'
    : `Based on ${recentRuns4Weeks} runs in the last 4 weeks`

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
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            ({suggestionReason} — conservative start to avoid injury)
          </span>
        </p>
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          Average km/week (last 4 weeks): <strong style={{ color: 'var(--text)' }}>
            {currentWeeklyKm === 0 ? 'not running' : `~${currentWeeklyKm} km`}
          </strong>
        </label>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={currentWeeklyKm}
          onChange={e => setCurrentWeeklyKm(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>0</span><span>80 km</span>
        </div>
        {currentWeeklyKm > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            We'll build your plan volume from here — no more than 10% increase per week.
          </p>
        )}
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

      {/* Training preferences — collapsible */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 28,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setPrefsExpanded(p => !p)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--surface)',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Training preferences</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              {preferencesUserSet ? '' : 'Auto · '}
              Volume: {capitalise(volumePreference)} · Effort: {capitalise(effortPreference)}
              {isPrimarySport && ' · Primary sport'}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{prefsExpanded ? '↑ Hide' : '↓ Customize'}</span>
        </button>

        {prefsExpanded && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            {!preferencesUserSet && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Set automatically based on your ability level. Change anything below to override.
              </p>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                Training volume
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {VOLUME_OPTIONS.map(v => (
                  <div
                    key={v.id}
                    style={tile(volumePreference === v.id)}
                    onClick={() => handleVolumeChange(v.id)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{v.label}</div>
                    <VolumeGraph points={v.points} active={volumePreference === v.id} />
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                Training effort
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {EFFORT_OPTIONS.map(e => (
                  <div
                    key={e.id}
                    style={tile(effortPreference === e.id)}
                    onClick={() => handleEffortChange(e.id)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{e.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{e.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              background: isPrimarySport ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
              border: `1px solid ${isPrimarySport ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              cursor: 'pointer',
            }} onClick={() => handlePrimaryChange(!isPrimarySport)}>
              <div style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: `2px solid ${isPrimarySport ? 'var(--accent)' : 'var(--border)'}`,
                background: isPrimarySport ? 'var(--accent)' : 'transparent',
                flexShrink: 0,
                marginTop: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isPrimarySport && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Running is my primary sport</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  When set, your running schedule takes precedence — other sports plan around it, not the other way around.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button style={btnSecondary} onClick={onBack}>← Back</button>
        <button style={btnPrimary} disabled={!canProceed} onClick={onNext}>Next →</button>
        {!canProceed && preferredDays.length > 0 && longRunDay === '' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select a long run day to continue</span>
        )}
        {kmRequired && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enter your average weekly km to continue</span>
        )}
      </div>
    </div>
  )
}

function Step4({
  trainingGoal,
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
  trainingGoal: string
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

  // beat_time always requires a race date
  const canProceed = trainingGoal === 'beat_time'
    ? raceDate !== ''
    : hasRace === false || (hasRace === true && raceDate !== '')

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Plan timeline</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        {trainingGoal === 'beat_time'
          ? "When is your target race? We'll build a time-goal plan around it."
          : 'Are you training for a specific race?'}
      </p>

      {trainingGoal !== 'beat_time' && (
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
      )}

      {(hasRace === true || trainingGoal === 'beat_time') && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Race date {trainingGoal === 'beat_time' && <span style={{ color: 'var(--accent)' }}>*</span>}
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
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Plan start date
            </label>
            <input
              type="date"
              value={planStartDate}
              min={new Date().toISOString().split('T')[0]}
              max={raceDate || undefined}
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

      {hasRace === false && trainingGoal !== 'beat_time' && (
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
  isEditing,
  saving,
}: {
  config: {
    trainingGoal: string
    goalTargetTimeSeconds: number
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
    raceTerrain: string
    trainingTerrain: string
    volumePreference: string
    effortPreference: string
    isPrimarySport: boolean
    preferencesUserSet: boolean
    currentWeeklyKm: number
    abilityLevelForPreview: string
  }
  onEdit: () => void
  onConfirm: (regenerate: boolean) => void
  isEditing: boolean
  saving: boolean
}) {
  const distLabel = DISTANCES.find(d => d.id === config.targetDistance)?.label || config.targetDistance
  const goalLabel = GOAL_OPTIONS.find(g => g.id === config.trainingGoal)?.label || config.trainingGoal
  const days = config.preferredDays.map(d => DAY_LABELS[d]).join(', ')
  const weeks = config.raceDate ? weeksUntil(config.raceDate) : config.planWeeks

  const hasRaceDate = config.trainingGoal !== 'fitness' && (config.hasRace || config.trainingGoal === 'beat_time')

  const rows: [string, string][] = [
    ['Goal', goalLabel],
    ...(config.trainingGoal === 'beat_time' && config.goalTargetTimeSeconds > 0
      ? [['Target time', formatDuration(config.goalTargetTimeSeconds)] as [string, string]]
      : []),
    ['Distance', distLabel],
    ['Level', `${capitalise(config.abilityLevel)}${config.aerobicBasePriority ? ' (aerobic base priority)' : ''}`],
    ['Runs/week', `${config.suggestedRunsPerWeek}  (${days})`],
    ['Long run', DAY_LABELS[config.longRunDay] || config.longRunDay],
    ['Starts', new Date(config.planStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
    hasRaceDate
      ? ['Race', `${new Date(config.raceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}  (${weeks} weeks)`]
      : ['Duration', `${config.planWeeks} weeks`],
    ['Race terrain', capitalise(config.raceTerrain) || '—'],
    ['Training terrain', capitalise(config.trainingTerrain) || '—'],
    ['Volume', `${capitalise(config.volumePreference)}${config.preferencesUserSet ? '' : ' (auto)'}`],
    ['Effort', `${capitalise(config.effortPreference)}${config.preferencesUserSet ? '' : ' (auto)'}`],
    ...(config.isPrimarySport ? [['Primary sport', 'Yes — plan takes precedence'] as [string, string]] : []),
  ]

  const preview = computeWeek1Preview(
    config.preferredDays,
    config.longRunDay,
    config.suggestedRunsPerWeek,
    config.currentWeeklyKm,
    config.abilityLevelForPreview,
    config.effortPreference,
  )
  const previewTotal = preview.reduce((sum, d) => sum + d.km, 0)

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
        marginBottom: 24,
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

      {preview.length > 0 && (
        <div style={{
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 12 }}>
            WEEK 1 PREVIEW
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map(({ day, type, km }) => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span style={{ width: 36, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{day}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{type}</span>
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>~{km} km</span>
              </div>
            ))}
          </div>
          <div style={{
            borderTop: '1px solid var(--border)',
            marginTop: 12,
            paddingTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}>
            <span>{preview.length} sessions</span>
            <span>~{previewTotal} km total</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Estimated — Claude will refine session details when generating your plan.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button style={btnSecondary} onClick={onEdit}>← Edit</button>
        {isEditing ? (
          <>
            <button
              style={{ ...btnSecondary, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={() => onConfirm(false)}
            >
              {saving ? 'Saving...' : 'Save & keep plan'}
            </button>
            <button
              style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={() => onConfirm(true)}
            >
              {saving ? 'Generating...' : 'Save & regenerate →'}
            </button>
          </>
        ) : (
          <button
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
            disabled={saving}
            onClick={() => onConfirm(true)}
          >
            {saving ? 'Generating...' : 'Generate my plan →'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunningSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)

  // Step 1 — Profile
  const [profileName, setProfileName] = useState('')
  const [profileAge, setProfileAge] = useState<number | ''>('')
  const [profileWeight, setProfileWeight] = useState<number | ''>('')
  const [profileWeeklyHours, setProfileWeeklyHours] = useState(8)

  // Step 2 — Goal & Distance
  const [trainingGoal, setTrainingGoal] = useState('')
  const [goalTargetTimeSeconds, setGoalTargetTimeSeconds] = useState(0)
  const [targetDistance, setTargetDistance] = useState('')
  const [raceTerrain, setRaceTerrain] = useState('')
  const [trainingTerrain, setTrainingTerrain] = useState('')

  // Step 3 — Ability
  const [hasPreviousRace, setHasPreviousRace] = useState<boolean | null>(null)
  const [bestTimeSeconds, setBestTimeSeconds] = useState(0)
  const [effortScore, setEffortScore] = useState(7)
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [abilityLevel, setAbilityLevel] = useState('beginner')
  const [aerobicBasePriority, setAerobicBasePriority] = useState(false)

  // Step 4 — Schedule
  const [recentRuns4Weeks, setRecentRuns4Weeks] = useState(0)
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState(0)
  const [suggestedRunsPerWeek, setSuggestedRunsPerWeek] = useState(3)
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [longRunDay, setLongRunDay] = useState('')
  const [volumePreference, setVolumePreference] = useState('gradual')
  const [effortPreference, setEffortPreference] = useState('comfortable')
  const [isPrimarySport, setIsPrimarySport] = useState(false)
  const [preferencesUserSet, setPreferencesUserSet] = useState(false)

  // Step 5 — Timeline (skipped for fitness goal)
  const [hasRace, setHasRace] = useState<boolean | null>(null)
  const [raceDate, setRaceDate] = useState('')
  const [planWeeks, setPlanWeeks] = useState(12)
  const [planStartDate, setPlanStartDate] = useState(nextMonday())

  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const totalSteps = trainingGoal === 'fitness' ? 5 : 6
  // step 6 is the 5th position in the fitness flow (step 5 is skipped)
  const displayStep = step === 6 && trainingGoal === 'fitness' ? 5 : step

  // Pre-fill from existing config and profile
  useEffect(() => {
    Promise.all([getRunningConfig(), getProfile()]).then(([{ config }, profile]) => {
      // Profile
      if (profile.name && profile.name !== 'Athlete') setProfileName(profile.name)
      if (profile.age) setProfileAge(profile.age)
      if (profile.weight_kg) setProfileWeight(profile.weight_kg)
      setProfileWeeklyHours(profile.weekly_training_hours)

      if (config) {
        setIsEditing(true)
        if (config.training_goal) setTrainingGoal(config.training_goal)
        if (config.goal_target_time_seconds) setGoalTargetTimeSeconds(config.goal_target_time_seconds)
        setTargetDistance(config.target_distance)
        if (config.race_terrain) setRaceTerrain(config.race_terrain)
        if (config.training_terrain) setTrainingTerrain(config.training_terrain)
        setHasPreviousRace(config.has_previous_race)
        if (config.best_time_seconds) setBestTimeSeconds(config.best_time_seconds)
        if (config.effort_score) setEffortScore(config.effort_score)
        setAbilityLevel(config.ability_level)
        setAerobicBasePriority(config.aerobic_base_priority)
        setRecentRuns4Weeks(config.recent_runs_4_weeks)
        if (config.current_weekly_km != null) setCurrentWeeklyKm(config.current_weekly_km)
        setSuggestedRunsPerWeek(config.suggested_runs_per_week)
        setPreferredDays(config.preferred_days)
        setLongRunDay(config.long_run_day)
        if (config.race_date) { setHasRace(true); setRaceDate(config.race_date) }
        if (config.plan_weeks) setPlanWeeks(config.plan_weeks)
        if (config.plan_start_date) setPlanStartDate(config.plan_start_date)
        if (config.volume_preference) setVolumePreference(config.volume_preference)
        if (config.effort_preference) setEffortPreference(config.effort_preference)
        setIsPrimarySport(config.is_primary_sport ?? false)
        setPreferencesUserSet(config.preferences_user_set ?? false)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Auto-classify when time or effort changes (step 3)
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

  // Auto-derive volume/effort preferences from ability level (only when not user-set)
  useEffect(() => {
    if (preferencesUserSet) return
    if (aerobicBasePriority) { setVolumePreference('gradual'); setEffortPreference('comfortable'); return }
    const defaults: Record<string, { vol: string; eff: string }> = {
      beginner:     { vol: 'gradual',      eff: 'comfortable' },
      intermediate: { vol: 'steady',       eff: 'balanced'    },
      advanced:     { vol: 'progressive',  eff: 'challenging' },
      elite:        { vol: 'progressive',  eff: 'challenging' },
    }
    const d = defaults[abilityLevel] ?? defaults.intermediate
    setVolumePreference(d.vol)
    setEffortPreference(d.eff)
  }, [abilityLevel, aerobicBasePriority, preferencesUserSet])

  // Update suggested runs when recentRuns4Weeks changes
  useEffect(() => {
    const caps: Record<string, number> = { beginner: 4, intermediate: 5, advanced: 6, elite: 7 }
    const avg = recentRuns4Weeks / 4
    const suggested = Math.min(Math.max(2, Math.round(avg * 0.8)), caps[abilityLevel] || 4)
    setSuggestedRunsPerWeek(suggested)
  }, [recentRuns4Weeks, abilityLevel])

  const handleStep1Next = async () => {
    setProfileSaving(true)
    try {
      await updateProfile({
        name: profileName.trim() || undefined,
        age: typeof profileAge === 'number' ? profileAge : undefined,
        weight_kg: typeof profileWeight === 'number' ? profileWeight : undefined,
        weekly_training_hours: profileWeeklyHours,
      })
    } catch { /* profile save is best-effort */ }
    setProfileSaving(false)
    setStep(2)
  }

  const handleStep3Next = () => {
    if (!hasPreviousRace) {
      setAbilityLevel('beginner')
      setAerobicBasePriority(false)
    }
    setStep(4)
  }

  const handleStep4Next = () => {
    // Skip timeline step for fitness goal
    if (trainingGoal === 'fitness') {
      setStep(6)
    } else {
      setStep(5)
    }
  }

  const handleConfirm = async (regenerate: boolean) => {
    setSaving(true)
    try {
      const effectiveRaceDate = (hasRace || trainingGoal === 'beat_time') ? raceDate : null
      const effectivePlanWeeks = (hasRace || trainingGoal === 'beat_time') ? null : planWeeks

      await saveRunningConfig({
        target_distance: targetDistance,
        has_previous_race: hasPreviousRace ?? false,
        best_time_seconds: hasPreviousRace ? bestTimeSeconds : null,
        effort_score: hasPreviousRace ? effortScore : null,
        ability_level: abilityLevel,
        aerobic_base_priority: aerobicBasePriority,
        recent_runs_4_weeks: recentRuns4Weeks,
        current_weekly_km: currentWeeklyKm || null,
        suggested_runs_per_week: suggestedRunsPerWeek,
        preferred_days: preferredDays,
        long_run_day: longRunDay,
        plan_start_date: planStartDate,
        race_date: effectiveRaceDate,
        plan_weeks: effectivePlanWeeks,
        race_terrain: raceTerrain || null,
        training_terrain: trainingTerrain || null,
        volume_preference: volumePreference,
        effort_preference: effortPreference,
        is_primary_sport: isPrimarySport,
        preferences_user_set: preferencesUserSet,
        training_goal: trainingGoal || null,
        goal_target_time_seconds: trainingGoal === 'beat_time' ? goalTargetTimeSeconds : null,
        regenerate,
      })
      navigate('/running')
    } catch (e: any) {
      alert('Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>

  const progressPct = ((displayStep - 1) / (totalSteps - 1)) * 100

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Running Setup</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Step {displayStep} of {totalSteps}</p>
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
        <Step0Profile
          name={profileName}
          setName={setProfileName}
          age={profileAge}
          setAge={setProfileAge}
          weightKg={profileWeight}
          setWeightKg={setProfileWeight}
          weeklyHours={profileWeeklyHours}
          setWeeklyHours={setProfileWeeklyHours}
          onNext={handleStep1Next}
          saving={profileSaving}
        />
      )}
      {step === 2 && (
        <Step1
          trainingGoal={trainingGoal}
          setTrainingGoal={setTrainingGoal}
          goalTargetTimeSeconds={goalTargetTimeSeconds}
          setGoalTargetTimeSeconds={setGoalTargetTimeSeconds}
          targetDistance={targetDistance}
          setTargetDistance={setTargetDistance}
          raceTerrain={raceTerrain}
          setRaceTerrain={setRaceTerrain}
          trainingTerrain={trainingTerrain}
          setTrainingTerrain={setTrainingTerrain}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step2
          targetDistance={targetDistance}
          hasPreviousRace={hasPreviousRace}
          setHasPreviousRace={setHasPreviousRace}
          bestTimeSeconds={bestTimeSeconds}
          setBestTimeSeconds={setBestTimeSeconds}
          effortScore={effortScore}
          setEffortScore={setEffortScore}
          classifyResult={classifyResult}
          classifying={classifying}
          onNext={handleStep3Next}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <Step3
          recentRuns4Weeks={recentRuns4Weeks}
          setRecentRuns4Weeks={setRecentRuns4Weeks}
          currentWeeklyKm={currentWeeklyKm}
          setCurrentWeeklyKm={setCurrentWeeklyKm}
          suggestedRunsPerWeek={suggestedRunsPerWeek}
          preferredDays={preferredDays}
          setPreferredDays={setPreferredDays}
          longRunDay={longRunDay}
          setLongRunDay={setLongRunDay}
          volumePreference={volumePreference}
          setVolumePreference={setVolumePreference}
          effortPreference={effortPreference}
          setEffortPreference={setEffortPreference}
          isPrimarySport={isPrimarySport}
          setIsPrimarySport={setIsPrimarySport}
          preferencesUserSet={preferencesUserSet}
          onPreferenceChange={() => setPreferencesUserSet(true)}
          onNext={handleStep4Next}
          onBack={() => setStep(3)}
        />
      )}
      {step === 5 && trainingGoal !== 'fitness' && (
        <Step4
          trainingGoal={trainingGoal}
          hasRace={hasRace}
          setHasRace={setHasRace}
          raceDate={raceDate}
          setRaceDate={setRaceDate}
          planWeeks={planWeeks}
          setPlanWeeks={setPlanWeeks}
          planStartDate={planStartDate}
          setPlanStartDate={setPlanStartDate}
          onNext={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      )}
      {step === 6 && (
        <Step5
          config={{
            trainingGoal,
            goalTargetTimeSeconds,
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
            raceTerrain,
            trainingTerrain,
            volumePreference,
            effortPreference,
            isPrimarySport,
            preferencesUserSet,
            currentWeeklyKm,
            abilityLevelForPreview: abilityLevel,
          }}
          onEdit={() => setStep(trainingGoal === 'fitness' ? 4 : 5)}
          onConfirm={handleConfirm}
          isEditing={isEditing}
          saving={saving}
        />
      )}
    </div>
  )
}
