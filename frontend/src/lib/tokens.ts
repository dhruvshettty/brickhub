// Data-viz color palettes — single source for chart / tag / badge / dot colors.
// Mirrors the --module-* and semantic CSS tokens in index.css (see DESIGN.md).
// JS literals (not var()) because these feed SVG attributes and lucide props,
// where CSS custom properties don't resolve reliably.

// Workout / session type → color. (`rest` is handled per-page: Running uses
// 'transparent', Dashboard/Food use the hairline border — so it's not here.)
export const WORKOUT_TYPE_COLOR: Record<string, string> = {
  easy: '#22c55e',
  tempo: '#f97316',
  interval: '#ef4444',
  long: '#3b82f6',
  race_pace: '#a855f7',
  recovery: '#6b7280',
}

// Nutrition context → color.
export const NUTRITION_CONTEXT_COLOR: Record<string, string> = {
  carb_loading_day: '#3b82f6',
  pre_workout_moderate_carb: '#f97316',
  recovery_day: '#22c55e',
  maintenance: 'var(--text-muted)',
  race_morning: '#a855f7',
  post_race_recovery: '#ec4899',
}

// Macronutrient → color.
export const MACRO_COLOR = {
  carbs: '#3b82f6',
  protein: '#22c55e',
  fat: '#f97316',
} as const

// Fatigue level → color.
export const FATIGUE_COLOR: Record<string, string> = {
  low: '#22c55e',
  moderate: '#f97316',
  high: '#ef4444',
}

// Module → color. Matches --module-* in index.css.
export const MODULE_COLOR: Record<string, string> = {
  running: '#3b82f6',
  biking: '#f97316',
  swimming: '#06b6d4',
  gym: '#a855f7',
  food: '#22c55e',
}
