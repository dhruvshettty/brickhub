import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getRunningPlan, recalibrateRunning, logWorkout, PlanDay, PlanResponse } from '../lib/api'
import Card, { CardTitle } from '../components/Card'

const RUN_TYPE_COLOR: Record<string, string> = {
  easy: '#22c55e',
  tempo: '#f97316',
  interval: '#ef4444',
  long: '#3b82f6',
  race_pace: '#a855f7',
  recovery: '#6b7280',
  rest: 'transparent',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0]
}

export default function Running() {
  const [planData, setPlanData] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [recalibrating, setRecalibrating] = useState(false)
  const [logging, setLogging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPlan()
  }, [])

  const loadPlan = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRunningPlan()
      setPlanData(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRecalibrate = async () => {
    setRecalibrating(true)
    try {
      await recalibrateRunning()
      await loadPlan()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRecalibrating(false)
    }
  }

  const handleLog = async (day: PlanDay, completed: boolean) => {
    setLogging(day.date)
    try {
      await logWorkout({
        planned_at: day.date,
        completed_at: completed ? day.date : null,
        duration_minutes: completed ? day.duration_minutes : null,
        distance_km: completed ? day.distance_km : null,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLogging(null)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Generating your running plan...</div>
  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>

  const plan = planData?.plan
  const aiUnavailable = planData?.ai_unavailable

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Running</h1>
          {plan && (
            <p style={{ color: 'var(--text-muted)' }}>
              Week of {new Date(plan.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
        <button
          onClick={handleRecalibrate}
          disabled={recalibrating}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            padding: '8px 16px',
            fontSize: 13,
            opacity: recalibrating ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} className={recalibrating ? 'spin' : ''} />
          {recalibrating ? 'Recalibrating...' : 'Recalibrate week'}
        </button>
      </div>

      {aiUnavailable && (
        <div style={{
          background: '#2a1a00',
          border: '1px solid #5a3a00',
          borderRadius: 'var(--radius)',
          padding: 16,
          marginBottom: 24,
          color: '#f97316',
          fontSize: 13,
        }}>
          AI coach unavailable. {planData?.message || 'Check your ANTHROPIC_API_KEY in .env.'}
        </div>
      )}

      {plan?.recalibration_note && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          padding: 16,
          marginBottom: 24,
          fontSize: 13,
          color: 'var(--text-muted)',
        }}>
          <strong style={{ color: 'var(--accent)' }}>Recalibrated: </strong>
          {plan.recalibration_note}
        </div>
      )}

      {plan && (
        <div style={{ marginBottom: 24 }}>
          <Card style={{ marginBottom: 16 }}>
            <CardTitle>Week Focus</CardTitle>
            <p style={{ fontSize: 14 }}>{plan.summary}</p>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plan.days.map(day => (
              <div
                key={day.date}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isToday(day.date) ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  display: 'grid',
                  gridTemplateColumns: '120px 80px 1fr auto',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {formatDate(day.date)}
                  </div>
                  {isToday(day.date) && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>Today</div>
                  )}
                </div>

                <div>
                  {day.type === 'rest' ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Rest</span>
                  ) : (
                    <span style={{
                      background: RUN_TYPE_COLOR[day.type] || 'var(--border)',
                      color: 'white',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {day.type}
                    </span>
                  )}
                </div>

                <div>
                  {day.type !== 'rest' && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{day.distance_km} km</span>
                      {day.pace_zone && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{day.pace_zone}</span>
                      )}
                      <div style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 12 }}>
                        {day.description}
                      </div>
                    </div>
                  )}
                </div>

                {day.type !== 'rest' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleLog(day, true)}
                      disabled={logging === day.date}
                      style={{
                        background: '#14532d',
                        border: '1px solid #166534',
                        borderRadius: 6,
                        color: '#22c55e',
                        padding: '4px 10px',
                        fontSize: 12,
                      }}
                    >
                      Done
                    </button>
                    <button
                      onClick={() => handleLog(day, false)}
                      disabled={logging === day.date}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--text-muted)',
                        padding: '4px 10px',
                        fontSize: 12,
                      }}
                    >
                      Missed
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
