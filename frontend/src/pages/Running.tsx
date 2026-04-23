import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Settings2, Undo2 } from 'lucide-react'
import { getRunningConfig, getRunningPlan, recalibrateRunning, logWorkout, clearWorkoutLog, PlanDay, PlanResponse, RunningConfig } from '../lib/api'
import Card, { CardTitle } from '../components/Card'

const PLAN_MESSAGES = [
  'Analysing your fitness profile…',
  'Calculating weekly mileage…',
  'Balancing easy and hard sessions…',
  'Scheduling your long run…',
  'Checking terrain preferences…',
  'Locking in rest days…',
  'Almost there…',
]

function PlanGeneratingScreen() {
  const [msgIdx, setMsgIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMsgIdx(i => (i + 1) % PLAN_MESSAGES.length)
      setProgress(p => Math.min(p + 100 / PLAN_MESSAGES.length, 95))
    }, 1800)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 32,
    }}>
      {/* Running figure SVG animation */}
      <div style={{ position: 'relative', width: 120, height: 80 }}>
        <style>{`
          @keyframes run-body { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
          @keyframes run-arm-f { 0%,100%{transform:rotate(-30deg)} 50%{transform:rotate(30deg)} }
          @keyframes run-arm-b { 0%,100%{transform:rotate(30deg)} 50%{transform:rotate(-30deg)} }
          @keyframes run-leg-f { 0%,100%{transform:rotate(-40deg)} 50%{transform:rotate(40deg)} }
          @keyframes run-leg-b { 0%,100%{transform:rotate(40deg)} 50%{transform:rotate(-40deg)} }
          @keyframes shadow-pulse { 0%,100%{transform:scaleX(1);opacity:0.3} 50%{transform:scaleX(0.7);opacity:0.15} }
          .run-figure { animation: run-body 0.55s ease-in-out infinite; transform-origin: center; }
          .run-arm-f { animation: run-arm-f 0.55s ease-in-out infinite; transform-origin: 58px 28px; }
          .run-arm-b { animation: run-arm-b 0.55s ease-in-out infinite; transform-origin: 58px 28px; }
          .run-leg-f { animation: run-leg-f 0.55s ease-in-out infinite; transform-origin: 60px 46px; }
          .run-leg-b { animation: run-leg-b 0.55s ease-in-out infinite; transform-origin: 60px 46px; }
          .run-shadow { animation: shadow-pulse 0.55s ease-in-out infinite; transform-origin: 60px 72px; }
        `}</style>
        <svg viewBox="0 0 120 80" width="120" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Shadow */}
          <ellipse className="run-shadow" cx="60" cy="72" rx="18" ry="4" fill="var(--text-muted)" opacity="0.25" />
          <g className="run-figure">
            {/* Head */}
            <circle cx="60" cy="14" r="7" fill="var(--accent)" />
            {/* Body */}
            <line x1="60" y1="21" x2="60" y2="46" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            {/* Back arm */}
            <line className="run-arm-b" x1="58" y1="28" x2="44" y2="38" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            {/* Front arm */}
            <line className="run-arm-f" x1="58" y1="28" x2="72" y2="36" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            {/* Back leg */}
            <line className="run-leg-b" x1="60" y1="46" x2="46" y2="64" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            {/* Front leg */}
            <line className="run-leg-f" x1="60" y1="46" x2="74" y2="62" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          Building your training plan
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', minHeight: 20 }}>
          {PLAN_MESSAGES[msgIdx]}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: 240, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 1.6s ease',
        }} />
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
        This takes 10–20 seconds
      </p>
    </div>
  )
}

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

function weeksToRace(raceDateStr: string | null): number | null {
  if (!raceDateStr) return null
  const diff = new Date(raceDateStr).getTime() - Date.now()
  return Math.round(diff / (7 * 24 * 60 * 60 * 1000))
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

export default function Running() {
  const navigate = useNavigate()
  const [planData, setPlanData] = useState<PlanResponse | null>(null)
  const [runningConfig, setRunningConfig] = useState<RunningConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [recalibrating, setRecalibrating] = useState(false)
  const [logging, setLogging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logState, setLogState] = useState<Record<string, 'done' | 'missed' | null>>({})

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    setLoading(true)
    setError(null)
    try {
      const { config, onboarded } = await getRunningConfig()
      if (!onboarded) {
        navigate('/running/setup')
        return
      }
      setRunningConfig(config)
      const data = await getRunningPlan()
      setPlanData(data)
      setLogState(data.day_logs ?? {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadPlan = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRunningPlan()
      setPlanData(data)
      setLogState(data.day_logs ?? {})
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

  const handleLog = async (day: PlanDay, status: 'done' | 'missed') => {
    if (logState[day.date] === status) return
    const prev = logState[day.date] ?? null
    setLogState(s => ({ ...s, [day.date]: status }))
    setLogging(day.date)
    try {
      await logWorkout({
        planned_at: day.date,
        completed_at: status === 'done' ? day.date : null,
        duration_minutes: status === 'done' ? day.duration_minutes : null,
        distance_km: status === 'done' ? day.distance_km : null,
      })
    } catch (e: any) {
      setLogState(s => ({ ...s, [day.date]: prev }))
      setError(e.message)
    } finally {
      setLogging(null)
    }
  }

  const handleClearLog = async (day: PlanDay) => {
    const prev = logState[day.date] ?? null
    setLogState(s => ({ ...s, [day.date]: null }))
    setLogging(day.date)
    try {
      await clearWorkoutLog(day.date)
    } catch (e: any) {
      setLogState(s => ({ ...s, [day.date]: prev }))
      setError(e.message)
    } finally {
      setLogging(null)
    }
  }

  if (loading) return <PlanGeneratingScreen />
  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>

  const plan = planData?.plan
  const aiUnavailable = planData?.ai_unavailable

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Running</h1>
          {runningConfig && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                background: 'rgba(99,102,241,0.15)',
                color: 'var(--accent)',
                borderRadius: 20,
                padding: '2px 10px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                {capitalise(runningConfig.ability_level)}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {capitalise(runningConfig.target_distance)}
              </span>
              {runningConfig.race_date && weeksToRace(runningConfig.race_date) !== null && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {weeksToRace(runningConfig.race_date)} weeks to race
                  </span>
                </>
              )}
            </div>
          )}
          {plan && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
              Week of {new Date(plan.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/running/setup')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-muted)',
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Settings2 size={14} />
            Edit plan settings
          </button>
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
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={recalibrating ? 'spin' : ''} />
            {recalibrating ? 'Recalibrating...' : 'Recalibrate week'}
          </button>
        </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => handleLog(day, 'done')}
                      disabled={logging === day.date}
                      title="Mark as done"
                      style={{
                        background: logState[day.date] === 'done' ? '#16a34a' : 'transparent',
                        border: `1px solid ${logState[day.date] === 'done' ? '#16a34a' : 'var(--border)'}`,
                        borderRadius: 6,
                        color: logState[day.date] === 'done' ? '#fff' : 'var(--text-muted)',
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: logState[day.date] === 'done' ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      ✓ Done
                    </button>
                    <button
                      onClick={() => handleLog(day, 'missed')}
                      disabled={logging === day.date}
                      title="Mark as missed"
                      style={{
                        background: logState[day.date] === 'missed' ? '#7f1d1d' : 'transparent',
                        border: `1px solid ${logState[day.date] === 'missed' ? '#991b1b' : 'var(--border)'}`,
                        borderRadius: 6,
                        color: logState[day.date] === 'missed' ? '#fca5a5' : 'var(--text-muted)',
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: logState[day.date] === 'missed' ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      ✗ Missed
                    </button>
                    {logState[day.date] && (
                      <button
                        onClick={() => handleClearLog(day)}
                        disabled={logging === day.date}
                        title="Undo"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--text-muted)',
                          padding: '4px 7px',
                          fontSize: 11,
                          cursor: 'pointer',
                          lineHeight: 1,
                        }}
                      >
                        <Undo2 size={12} />
                      </button>
                    )}
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
