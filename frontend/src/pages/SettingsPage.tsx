import { useEffect, useState } from 'react'
import { getProfile, updateProfile, Profile } from '../lib/api'
import Card, { CardTitle } from '../components/Card'

const RACE_DISTANCES = [
  { value: 'sprint', label: 'Sprint (750m / 20km / 5km)' },
  { value: 'olympic', label: 'Olympic (1.5km / 40km / 10km)' },
  { value: '70.3', label: 'Half Ironman / 70.3 (1.9km / 90km / 21km)' },
  { value: 'ironman', label: 'Full Ironman (3.8km / 180km / 42km)' },
]

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
        ftp_watts: profile.ftp_watts,
        race_distance: profile.race_distance,
        race_date: profile.race_date,
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

  const field = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Settings</h1>

      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Race Goal</CardTitle>

        {field('Race Distance', (
          <select
            value={profile.race_distance || ''}
            onChange={e => setProfile(p => p && ({ ...p, race_distance: e.target.value as any || null }))}
            style={{ width: '100%' }}
          >
            <option value="">Select race distance...</option>
            {RACE_DISTANCES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        ))}

        {field('Race Date', (
          <input
            type="date"
            value={profile.race_date || ''}
            onChange={e => setProfile(p => p && ({ ...p, race_date: e.target.value || null }))}
            style={{ width: '100%' }}
          />
        ))}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Profile</CardTitle>

        {field('Name', (
          <input
            type="text"
            value={profile.name || ''}
            onChange={e => setProfile(p => p && ({ ...p, name: e.target.value }))}
            placeholder="Your name"
            style={{ width: '100%' }}
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
                style={{ width: '100%' }}
              />
            ))}
          </div>
          <div>
            {field('Weight (kg)', (
              <input
                type="number"
                step="0.1"
                value={profile.weight_kg || ''}
                onChange={e => setProfile(p => p && ({ ...p, weight_kg: parseFloat(e.target.value) || null }))}
                placeholder="70"
                style={{ width: '100%' }}
              />
            ))}
          </div>
        </div>

        {field('Weekly Training Hours', (
          <input
            type="number"
            value={profile.weekly_training_hours}
            onChange={e => setProfile(p => p && ({ ...p, weekly_training_hours: parseInt(e.target.value) || 8 }))}
            style={{ width: 120 }}
          />
        ))}

        {field('FTP (watts) — for bike zones', (
          <input
            type="number"
            value={profile.ftp_watts || ''}
            onChange={e => setProfile(p => p && ({ ...p, ftp_watts: parseInt(e.target.value) || null }))}
            placeholder="200"
            style={{ width: 120 }}
          />
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
