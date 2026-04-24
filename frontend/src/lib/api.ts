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
export const clearWorkoutLog = (date: string) =>
  request(`/running/log/${date}`, { method: 'DELETE' })
export const recalibrateRunning = () =>
  request('/running/recalibrate', { method: 'POST' })
export const applyPlanChange = (data: ApplyPlanChangeRequest) =>
  request<{ plan: PlanResponse['plan']; plan_edits: PlanResponse['plan_edits']; applied: boolean }>(
    '/running/apply-plan-change',
    { method: 'POST', body: JSON.stringify(data) },
  )
export const getRunningConfig = () =>
  request<RunningConfigResponse>('/running/config')
export const saveRunningConfig = (data: RunningConfigRequest) =>
  request<{ config: RunningConfig; saved: boolean }>('/running/config', { method: 'PUT', body: JSON.stringify(data) })
export const classifyRunningAbility = (data: ClassifyRequest) =>
  request<ClassifyResult>('/running/classify', { method: 'POST', body: JSON.stringify(data) })

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
  weekly_training_hours: number
}

export interface DashboardSummary {
  today: string
  week_start: string
  profile: { name: string | null }
  running_goal: string | null
  race_countdown: { days: number; distance: string; date: string } | null
  today_run: PlanDay | null
  today_food: {
    date: string
    nutrition_context: string
    targets: { calories: number; carbs_g: number; protein_g: number; fat_g: number }
    note: string
  } | null
  logged_calories_today: number
  module_progress: Record<string, { completed: number; total: number }>
  signals: CrossModuleSignals
  plans_available: string[]
  running_onboarded: boolean
  food_onboarded: boolean
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
  rationale?: string
  duration_minutes: number
  pace_zone: string | null
  description: string
}

export interface PlanEditEntry {
  original_session: PlanDay
  new_session: PlanDay
  reason: string
  changed_at: string
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
  day_logs: Record<string, 'done' | 'missed'>
  plan_edits: Record<string, PlanEditEntry>
}

export interface CoachMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

export interface PlanChangeSession {
  date: string
  type: string
  distance_km: number
  duration_minutes: number
  pace_zone: string | null
  description: string
}

export interface PlanChange {
  reason: string
  changes: Array<{ date: string; new_session: PlanChangeSession; original_session?: PlanChangeSession }>
}

export interface CoachResponse {
  response: string
  ai_unavailable: boolean
  plan_change?: PlanChange | null
}

export interface ApplyPlanChangeRequest {
  reason: string
  changes: Array<{ date: string; new_session: PlanChangeSession }>
}

export interface RunningConfig {
  target_distance: string
  has_previous_race: boolean
  best_time_seconds: number | null
  effort_score: number | null
  ability_level: string
  aerobic_base_priority: boolean
  recent_runs_4_weeks: number
  current_weekly_km: number | null
  suggested_runs_per_week: number
  preferred_days: string[]
  long_run_day: string
  plan_start_date: string
  race_date: string | null
  plan_weeks: number | null
  race_terrain: string | null
  training_terrain: string | null
  volume_preference: string | null
  effort_preference: string | null
  is_primary_sport: boolean
  preferences_user_set: boolean
  training_goal?: string | null
  goal_target_time_seconds?: number | null
  returning_from_break?: boolean
  break_reason?: string | null
  break_duration?: string | null
  prior_baseline_km?: number | null
  onboarded_at: string | null
}

export interface RunningConfigResponse {
  config: RunningConfig | null
  onboarded: boolean
}

export interface RunningConfigRequest {
  target_distance: string
  has_previous_race: boolean
  best_time_seconds?: number | null
  effort_score?: number | null
  ability_level: string
  aerobic_base_priority: boolean
  recent_runs_4_weeks: number
  current_weekly_km?: number | null
  suggested_runs_per_week: number
  preferred_days: string[]
  long_run_day: string
  plan_start_date: string
  race_date?: string | null
  plan_weeks?: number | null
  race_terrain?: string | null
  training_terrain?: string | null
  volume_preference?: string | null
  effort_preference?: string | null
  is_primary_sport?: boolean
  preferences_user_set?: boolean
  training_goal?: string | null
  goal_target_time_seconds?: number | null
  returning_from_break?: boolean
  break_reason?: string | null
  break_duration?: string | null
  prior_baseline_km?: number | null
  regenerate?: boolean
}

// Food
export const getFoodConfig = () =>
  request<FoodConfigResponse>('/food/config')
export const saveFoodConfig = (data: FoodConfigRequest) =>
  request<{ config: FoodConfig; saved: boolean }>('/food/config', { method: 'PUT', body: JSON.stringify(data) })
export const getFoodPlan = (weekStart?: string) =>
  request<FoodPlanResponse>(`/food/plan${weekStart ? `?week_start=${weekStart}` : ''}`)
export const logMeal = (data: MealLogRequest) =>
  request<{ id: number; logged: boolean }>('/food/log', { method: 'POST', body: JSON.stringify(data) })
export const deleteMealLog = (id: number) =>
  request(`/food/log/${id}`, { method: 'DELETE' })

export interface FoodConfig {
  dietary_preference: string
  intolerances: string | null
  prep_frequency: string
  weight_kg: number | null
  calorie_baseline_kcal: number
  cuisine_preference: string | null
  onboarded_at: string | null
}

export interface FoodConfigResponse {
  config: FoodConfig | null
  onboarded: boolean
  running_onboarded: boolean
}

export interface FoodConfigRequest {
  dietary_preference: string
  intolerances?: string | null
  prep_frequency: string
  weight_kg?: number | null
  calorie_baseline_kcal?: number
  cuisine_preference?: string | null
  regenerate?: boolean
}

export interface FoodMacros {
  carbs_g: number
  protein_g: number
  fat_g: number
}

export interface FoodIngredient {
  name: string
  quantity: string
  unit: string
  category: string
}

export interface FoodMeal {
  name: string
  description?: string
  timing?: string
  calories: number
  macros: FoodMacros
  ingredients: FoodIngredient[]
  instructions?: string[]
}

export interface FoodDayMeals {
  breakfast?: FoodMeal
  pre_workout?: FoodMeal
  post_workout?: FoodMeal
  lunch?: FoodMeal
  dinner?: FoodMeal
  snacks?: FoodMeal[]
}

export interface FoodDay {
  date: string
  session_type: string
  session_distance_km: number
  nutrition_context: string
  prep_batch: number
  targets: {
    calories: number
    carbs_g: number
    protein_g: number
    fat_g: number
  }
  meals: FoodDayMeals
  note: string
}

export interface FoodPlan {
  week_start: string
  module: string
  prep_frequency: string
  race_week: boolean
  days: FoodDay[]
}

export interface MealLogEntry {
  id: number
  date: string
  meal_slot: string
  meal_name: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  notes: string | null
}

export interface FoodPlanResponse {
  plan: FoodPlan | null
  ai_unavailable: boolean
  message?: string
  meal_logs: MealLogEntry[]
}

export interface MealLogRequest {
  date: string
  meal_slot: string
  meal_name?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  notes?: string | null
}

export interface ClassifyRequest {
  distance: string
  time_seconds: number
  effort_score: number
}

export interface ClassifyResult {
  base_level: string
  adjusted_level: string
  aerobic_base_priority: boolean
  explanation: string
}

export interface WorkoutLogRequest {
  planned_at: string
  completed_at?: string | null
  duration_minutes?: number | null
  distance_km?: number | null
  avg_hr?: number | null
  notes?: string | null
}
