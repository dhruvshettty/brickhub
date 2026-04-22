import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardSummary, DashboardSummary } from '../lib/api'
import Card, { CardTitle } from '../components/Card'
import CoachPanel from '../components/CoachPanel'

const RUN_TYPE_COLOR: Record<string, string> = {
  easy: '#22c55e',
  tempo: '#f97316',
  interval: '#ef4444',
  long: '#3b82f6',
  race_pace: '#a855f7',
  recovery: '#6b7280',
  rest: 'var(--border)',
}

const FATIGUE_COLOR: Record<string, string> = {
  low: '#22c55e',
  moderate: '#f97316',
  high: '#ef4444',
}

function formatDaysToRace(days: number): string {
  if (days <= 0) return 'Race day!'
  if (days === 1) return '1 day to go'
  if (days < 7) return `${days} days to go`
  const weeks = Math.floor(days / 7)
  return `${weeks} week${weeks > 1 ? 's' : ''} to go`
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboardSummary()
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <div style={{ color: 'var(--red)', padding: 20 }}>
      Failed to load dashboard: {error}
      <br />
      <small style={{ color: 'var(--text-muted)' }}>Run `make logs` to check the backend.</small>
    </div>
  )

  if (!data) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Good {getTimeOfDay()}, {data.profile.name || 'Athlete'}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {new Date(data.today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {data.race_countdown && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 20px',
            textAlign: 'right',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
              {formatDaysToRace(data.race_countdown.days)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {data.race_countdown.distance} · {data.race_countdown.date}
            </div>
          </div>
        )}
        {!data.race_countdown && (
          <Link to="/settings" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            Set race goal →
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Today's run */}
        <Card>
          <CardTitle>Today's Run</CardTitle>
          {data.today_run ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  background: RUN_TYPE_COLOR[data.today_run.type] || 'var(--border)',
                  color: 'white',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {data.today_run.type}
                </span>
                {data.today_run.pace_zone && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {data.today_run.pace_zone}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                {data.today_run.distance_km} km
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {data.today_run.description}
              </div>
            </div>
          ) : (
            <div>
              {data.plans_available.includes('running') ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Rest day. Recovery is training too.</p>
              ) : (
                <Link to="/running" style={{ fontSize: 13 }}>
                  Generate your running plan →
                </Link>
              )}
            </div>
          )}
        </Card>

        {/* This week */}
        <Card>
          <CardTitle>This Week</CardTitle>
          {(['running', 'biking', 'swimming', 'gym'] as const).map(module => {
            const prog = data.module_progress[module] || { completed: 0, total: 0 }
            return (
              <div key={module} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: 13 }}>
                  {module}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {prog.total === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  ) : (
                    <span style={{ color: prog.completed === prog.total ? 'var(--green)' : 'var(--text)' }}>
                      {prog.completed}/{prog.total}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </Card>

        {/* Recovery / signals */}
        <Card>
          <CardTitle>Training Status</CardTitle>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Fatigue</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: FATIGUE_COLOR[data.signals.fatigue_level],
              textTransform: 'capitalize',
            }}>
              {data.signals.fatigue_level}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>{data.signals.total_training_minutes_this_week} min trained this week</span>
            {data.signals.missed_sessions > 0 && (
              <span style={{ color: 'var(--orange)' }}>
                {data.signals.missed_sessions} missed session{data.signals.missed_sessions > 1 ? 's' : ''}
              </span>
            )}
            {data.signals.brick_yesterday && (
              <span style={{ color: 'var(--accent)' }}>Brick session yesterday</span>
            )}
          </div>
        </Card>
      </div>

      {/* Coach panel - full width */}
      <CoachPanel />
    </div>
  )
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
