const BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API ${res.status}: ${error}`)
  }
  return res.json()
}

// Dashboard
export const getDashboardSummary = () =>
  request<DashboardSummary>('/dashboard/summary')

// Settings
export const getProfile = () => request<Profile>('/settings/profile')
export const updateProfile = (data: Partial<Profile>) =>
  request<Profile>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) })

// Running
export const getRunningPlan = (weekStart?: string) =>
  request<PlanResponse>(`/running/plan${weekStart ? `?week_start=${weekStart}` : ''}`)
export const logWorkout = (data: WorkoutLogRequest) =>
  request('/running/log', { method: 'POST', body: JSON.stringify(data) })
export const recalibrateRunning = () =>
  request('/running/recalibrate', { method: 'POST' })

// Coach
export const sendCoachMessage = (content: string) =>
  request<CoachResponse>('/coach/message', { method: 'POST', body: JSON.stringify({ content }) })
export const getCoachHistory = () =>
  request<CoachMessage[]>('/coach/history')

// Types
export interface Profile {
  id: number
  name: string | null
  age: number | null
  weight_kg: number | null
  ftp_watts: number | null
  race_distance: 'sprint' | 'olympic' | '70.3' | 'ironman' | null
  race_date: string | null
  weekly_training_hours: number
}

export interface DashboardSummary {
  today: string
  week_start: string
  profile: { name: string | null; race_distance: string | null; race_date: string | null }
  race_countdown: { days: number; distance: string; date: string } | null
  today_run: PlanDay | null
  module_progress: Record<string, { completed: number; total: number }>
  signals: CrossModuleSignals
  plans_available: string[]
}

export interface CrossModuleSignals {
  fatigue_level: 'low' | 'moderate' | 'high'
  total_training_minutes_this_week: number
  completed_sessions: number
  missed_sessions: number
  brick_yesterday: boolean
  race_proximity: string | null
  days_to_race: number | null
}

export interface PlanDay {
  date: string
  type: string
  distance_km: number
  duration_minutes: number
  pace_zone: string | null
  description: string
}

export interface PlanResponse {
  plan: {
    week_start: string
    module: string
    summary: string
    recalibration_note?: string
    days: PlanDay[]
  } | null
  ai_unavailable: boolean
  message?: string
}

export interface CoachMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

export interface CoachResponse {
  response: string
  ai_unavailable: boolean
}

export interface WorkoutLogRequest {
  planned_at: string
  completed_at?: string | null
  duration_minutes?: number | null
  distance_km?: number | null
  avg_hr?: number | null
  notes?: string | null
}
