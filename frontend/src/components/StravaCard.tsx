import { useEffect, useState } from 'react'
import Card, { CardTitle } from './Card'
import {
  getStravaStatus, syncStrava, disconnectStrava, matchStravaActivity,
  stravaAuthorizeUrl, StravaStatus, StravaActivity,
} from '../lib/api'

const STRAVA_ORANGE = '#fc4c02'

const REASON_LABEL: Record<string, string> = {
  no_planned_session: 'No planned session that day',
  multiple_activities: 'Multiple runs that day',
  already_logged: 'Day already logged',
}

function activityLine(a: StravaActivity): string {
  const bits = [a.date]
  if (a.distance_km != null) bits.push(`${a.distance_km}km`)
  if (a.duration_minutes != null) bits.push(`${Math.round(a.duration_minutes)}min`)
  if (a.avg_hr != null) bits.push(`${a.avg_hr}bpm`)
  return bits.join(' · ')
}

export default function StravaCard() {
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [imported, setImported] = useState<StravaActivity[]>([])
  const [ambiguous, setAmbiguous] = useState<StravaActivity[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  const refresh = () => getStravaStatus().then(setStatus).catch(() => {})

  useEffect(() => {
    refresh()
    // OAuth callback redirects back with ?strava=connected|error
    const params = new URLSearchParams(window.location.search)
    const s = params.get('strava')
    if (s === 'connected') setBanner('✓ Connected to Strava.')
    else if (s === 'error') setBanner('Strava connection failed — try again.')
    if (s) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setBanner(null)
    try {
      const res = await syncStrava(true)
      setImported(res.imported || [])
      setAmbiguous(res.ambiguous || [])
      await refresh()
    } catch {
      setBanner('Sync failed — your Strava connection may need reauthorizing.')
    } finally {
      setSyncing(false)
    }
  }

  const handleImport = async (a: StravaActivity) => {
    await matchStravaActivity({
      external_id: a.external_id, planned_at: a.date, type: a.type, start: a.start,
      duration_minutes: a.duration_minutes, distance_km: a.distance_km, avg_hr: a.avg_hr,
    })
    setAmbiguous(prev => prev.filter(x => x.external_id !== a.external_id))
    setImported(prev => [...prev, { ...a, planned_at: a.date }])
  }

  const dismiss = (a: StravaActivity) =>
    setAmbiguous(prev => prev.filter(x => x.external_id !== a.external_id))

  if (!status) return null

  const btn: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)',
    color: 'var(--text)', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardTitle>Strava</CardTitle>

      {banner && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{banner}</div>
      )}

      {!status.configured && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Add <code>STRAVA_CLIENT_ID</code> and <code>STRAVA_CLIENT_SECRET</code> to <code>.env</code>{' '}
          (register an app at strava.com/settings/api), then restart the server.
        </div>
      )}

      {status.configured && !status.connected && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Connect Strava to auto-import completed runs — no more marking sessions done by hand.
          </div>
          <button
            onClick={() => { window.location.href = stravaAuthorizeUrl }}
            style={{ ...btn, background: STRAVA_ORANGE, border: 'none', color: '#fff' }}
          >
            Connect with Strava
          </button>
        </>
      )}

      {status.connected && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Connected{status.athlete_id ? ` (athlete ${status.athlete_id})` : ''}.{' '}
            Last synced: {status.last_synced_at ? new Date(status.last_synced_at).toLocaleString() : 'never'}.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: imported.length || ambiguous.length ? 16 : 0 }}>
            <button onClick={handleSync} disabled={syncing} style={{ ...btn, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={handleDisconnect} style={{ ...btn, color: 'var(--text-muted)' }}>
              Disconnect
            </button>
          </div>

          {imported.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Imported {imported.length} run{imported.length > 1 ? 's' : ''}
              </div>
              {imported.map(a => (
                <div key={a.external_id} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  ✓ {a.name || 'Run'} — <span className="mono">{activityLine(a)}</span>
                </div>
              ))}
            </div>
          )}

          {ambiguous.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Needs review ({ambiguous.length})
              </div>
              {ambiguous.map(a => (
                <div
                  key={a.external_id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 12 }}>
                    <div>{a.name || 'Run'} — <span className="mono">{activityLine(a)}</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>{REASON_LABEL[a.reason || ''] || a.reason}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleImport(a)} style={{ ...btn, padding: '4px 10px', fontSize: 12 }}>
                      Import to {a.date}
                    </button>
                    <button onClick={() => dismiss(a)} style={{ ...btn, padding: '4px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )

  async function handleDisconnect() {
    await disconnectStrava()
    setImported([])
    setAmbiguous([])
    await refresh()
  }
}
