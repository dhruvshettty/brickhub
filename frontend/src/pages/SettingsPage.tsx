import { useEffect, useState } from 'react'
import { getProfile, updateProfile, Profile } from '../lib/api'
import Card, { CardTitle } from '../components/Card'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!profile) return
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
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>

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
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Settings</h1>

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
                      background: profile.sex === s ? 'var(--accent)' : 'var(--surface)',
                      color: profile.sex === s ? '#fff' : 'var(--text-muted)',
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
                  background: profile.unit_preference === u ? 'var(--accent)' : 'var(--surface)',
                  color: profile.unit_preference === u ? '#fff' : 'var(--text-muted)',
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

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          background: saved ? '#14532d' : 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: 'white',
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 600,
          opacity: saving ? 0.7 : 1,
          transition: 'background 0.2s',
        }}
      >
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
