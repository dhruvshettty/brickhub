import { useEffect, useState } from 'react'
import { getProfile, updateProfile, Profile } from '../lib/api'
import Card, { CardTitle } from '../components/Card'
import StravaCard from '../components/StravaCard'
import { Heading } from '../components/Type'
import { ZONE_COLOR } from '../lib/tokens'

// Mirrors hr_zones.py ZONE_BANDS (%HRmax) — client-side so zones preview live as
// the user types, before the round-trip. The backend remains the source of truth.
const ZONE_BANDS: [number, [number, number]][] = [
  [1, [0.55, 0.72]],
  [2, [0.72, 0.82]],
  [3, [0.82, 0.87]],
  [4, [0.87, 0.92]],
  [5, [0.92, 1.0]],
]
const ZONE_LABELS: Record<number, string> = {
  1: 'Recovery', 2: 'Easy (aerobic)', 3: 'Grey zone', 4: 'Threshold', 5: 'VO₂ max',
}

function deriveZones(hrMax: number | null): [number, [number, number]][] | null {
  if (!hrMax || hrMax <= 0) return null
  return ZONE_BANDS.map(([z, [lo, hi]]) => [z, [Math.round(hrMax * lo), Math.round(hrMax * hi)]])
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {})
  }, [])

  const hrMax = profile?.hr_max_bpm ?? null
  const hrError = hrMax != null && (hrMax < 120 || hrMax > 220)
    ? 'Max heart rate should be between 120 and 220 bpm.'
    : ''

  const handleSave = async () => {
    if (!profile || hrError) return
    setSaving(true)
    try {
      const updated = await updateProfile({
        name: profile.name,
        age: profile.age,
        weight_kg: profile.weight_kg,
        height_cm: profile.height_cm,
        sex: profile.sex,
        unit_preference: profile.unit_preference,
        weekly_training_hours: profile.weekly_training_hours,
        hr_max_bpm: profile.hr_max_bpm,
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>

  const zones = deriveZones(hrError ? null : hrMax)

  const metric = profile.unit_preference !== 'imperial'

  const field = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )

  const inputStyle: React.CSSProperties = { width: '100%' }

  return (
    <div style={{ maxWidth: 560 }}>
      <Heading level={1} style={{ marginBottom: 32 }}>Settings</Heading>

      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Profile</CardTitle>

        {field('Name', (
          <input
            type="text"
            value={profile.name || ''}
            onChange={e => setProfile(p => p && ({ ...p, name: e.target.value }))}
            placeholder="Your name"
            style={inputStyle}
          />
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            {field('Age', (
              <input
                type="number"
                value={profile.age || ''}
                onChange={e => setProfile(p => p && ({ ...p, age: parseInt(e.target.value) || null }))}
                placeholder="32"
                style={inputStyle}
              />
            ))}
          </div>
          <div>
            {field('Sex', (
              <div style={{ display: 'flex', gap: 8 }}>
                {['Male', 'Female'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setProfile(p => p && ({ ...p, sex: s }))}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${profile.sex === s ? 'var(--accent)' : 'var(--border)'}`,
                      background: profile.sex === s ? 'var(--surface-2)' : 'var(--surface)',
                      color: profile.sex === s ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 13,
                      fontWeight: profile.sex === s ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {field('Units', (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['metric', 'imperial'] as const).map(u => (
              <button
                key={u}
                type="button"
                onClick={() => setProfile(p => p && ({ ...p, unit_preference: u }))}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${profile.unit_preference === u ? 'var(--accent)' : 'var(--border)'}`,
                  background: profile.unit_preference === u ? 'var(--surface-2)' : 'var(--surface)',
                  color: profile.unit_preference === u ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: profile.unit_preference === u ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {u === 'metric' ? 'Metric (kg, cm)' : 'Imperial (lbs, ft)'}
              </button>
            ))}
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            {field(`Weight (${metric ? 'kg' : 'lbs'})`, (
              <input
                type="number"
                step="0.1"
                value={profile.weight_kg
                  ? metric
                    ? profile.weight_kg
                    : Math.round(profile.weight_kg * 2.20462 * 10) / 10
                  : ''}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  const kg = isNaN(v) ? null : metric ? v : v / 2.20462
                  setProfile(p => p && ({ ...p, weight_kg: kg }))
                }}
                placeholder={metric ? '70' : '154'}
                style={inputStyle}
              />
            ))}
          </div>
          <div>
            {field(`Height (${metric ? 'cm' : 'in'})`, (
              <input
                type="number"
                step="0.1"
                value={profile.height_cm
                  ? metric
                    ? profile.height_cm
                    : Math.round(profile.height_cm / 2.54 * 10) / 10
                  : ''}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  const cm = isNaN(v) ? null : metric ? v : v * 2.54
                  setProfile(p => p && ({ ...p, height_cm: cm }))
                }}
                placeholder={metric ? '178' : '70'}
                style={inputStyle}
              />
            ))}
          </div>
        </div>

        {field(`Weekly Training Hours — ${profile.weekly_training_hours}h`, (
          <>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={profile.weekly_training_hours}
              onChange={e => setProfile(p => p && ({ ...p, weekly_training_hours: parseInt(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>2h</span><span>20h</span>
            </div>
          </>
        ))}

      </Card>

      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Heart rate zones</CardTitle>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -4, marginBottom: 20, lineHeight: 1.5 }}>
          Used to show personal effort targets on each running session. Seeded from your age
          (220 − age) and editable here. These are estimates, not lab values.
        </p>

        {field('Max heart rate (bpm)', (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={120}
              max={220}
              value={profile.hr_max_bpm ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value)
                setProfile(p => p && ({ ...p, hr_max_bpm: isNaN(v) ? null : v }))
              }}
              placeholder={profile.age ? String(220 - profile.age) : '190'}
              style={{ ...inputStyle, minHeight: 44, fontSize: 16 }}
            />
            {hrError && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{hrError}</p>
            )}
            {!hrError && profile.hr_max_bpm == null && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {profile.age
                  ? 'Leave blank to seed from your age on save.'
                  : 'Add your age above, or enter your max HR directly, to unlock zones.'}
              </p>
            )}
          </>
        ))}

        {zones && (
          <div style={{ marginTop: 4 }}>
            {zones.map(([z, [lo, hi]]) => (
              <div key={z} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: z < 5 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ZONE_COLOR[z] || 'var(--text-muted)',
                }} />
                <span style={{ fontSize: 13, width: 28, color: 'var(--text-muted)' }}>Z{z}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{ZONE_LABELS[z]}</span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{lo}–{hi} bpm</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <StravaCard />

      <button
        onClick={handleSave}
        disabled={saving || !!hrError}
        style={{
          background: saved ? '#14532d' : 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: 'white',
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 600,
          opacity: saving || hrError ? 0.7 : 1,
          cursor: hrError ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
