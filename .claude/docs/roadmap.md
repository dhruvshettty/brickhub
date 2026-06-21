# Roadmap

Tracks milestones, features, and known issues. Update this as work progresses.

---

## M0 — App Onboarding ✅ COMPLETE

- [x] Fresh-user detection: `GET /settings/profile/exists` → redirect to `/onboarding` if no profile row
- [x] Welcome step: app description, module grid (5 cards, available/coming-soon state), SVG signals web showing cross-module connections
- [x] Profile step: name, age, sex (Male/Female), metric/imperial toggle, weight, height, weekly training hours → `PUT /settings/profile`
- [x] Profile model extended: `height_cm`, `sex`, `unit_preference` (migration 009)
- [x] Onboarding renders full-screen without sidebar nav

---

## M1 — Running Fundamentals 🔲 IN PROGRESS

Everything needed to nail the running experience end-to-end.

### Running — Onboarding ✅ Done
- [x] 5-step wizard: distance → ability assessment → schedule → timeline → confirm
- [x] Deterministic ability classification (pace + effort score)
- [x] Live classify endpoint (`POST /running/classify`)
- [x] Config persisted in `module_configs` table
- [x] Onboarding gate on Running page (redirect if not onboarded)
- [x] Plan invalidated on config save (forces fresh generation with new settings)
- [x] Race terrain + training terrain collected in Step 1 (flat / rolling / moderate / hilly, with m/km thresholds)
- [x] Terrain mismatch note injected into Claude prompt when race and training terrains differ
- [x] Training volume preference (gradual / steady / progressive) with SVG curve visualization
- [x] Training effort preference (comfortable / balanced / challenging)
- [x] Auto-derived from ability level — beginner→gradual/comfortable, intermediate→steady/balanced, advanced→progressive/challenging
- [x] Collapsible "Training preferences" section in Step 3 — shown collapsed with auto-selections, expandable to override
- [x] `preferences_user_set` flag — explicit user choices take precedence over cross-module signals
- [x] `is_primary_sport` flag — marks this module's schedule as load-bearing for other modules to plan around

### Running — Plan & Logging ✅ Done
- [x] Weekly plan generation (Claude Sonnet, cross-module aware)
- [x] Workout logging (done / missed per session)
- [x] Plan recalibration (adjusts based on missed sessions)
- [x] Ability badge + race countdown in header
- [x] Edit plan settings button

### Running — Onboarding Polish ✅ Done
- [x] Wizard Step 1: collect name, age, weight (optional), weekly training hours before distance selection
- [x] Wizard Step 2: add training goal tiles (just finish / beat a target time / build fitness) — target time input if chosen; "Build fitness" skips race/timeline step; "Beat a target time" makes race date required
- [x] Wizard Step 4: weekly km slider already existed; show logic behind weekly suggestion ("Based on X runs in the last 4 weeks")
- [x] Wizard Step 4: `recentRuns4Weeks` defaults to 0 (already was)
- [x] Wizard Step 6 (confirmation): "What week 1 looks like" computed day-by-day breakdown
- [x] Dashboard: guided first-run banner when running not set up; coach panel locked until running onboarded
- [x] `training_goal` + `goal_target_time_seconds` injected into Claude prompt for plan generation

### Running — Plan & UI Polish ✅ Done
- [x] Re-onboarding flow: editing config should offer to regenerate or keep current plan
- [x] Plan view shows preferred days highlighted
- [x] Completed sessions marked persistently (not just a button)
- [x] Week navigation (past weeks only; no forward navigation; past plans served from cache, never regenerated; explanatory note on why plans are week-by-week)
- [x] Plan explanation — why each session is what it is

### Running Fundamentals 🔲 To Do

**Historical training context** ✅ Done
- [x] Proactive trigger in Step 4 when `recentRuns4Weeks < 4`: "Looks like last month was quieter than usual — was this typical?" with Yes/No
- [x] Break context form: reason (vacation / injury / illness / life / other), duration (< 1mo / 1–3mo / 3–6mo / 6+mo), prior baseline km slider
- [x] Algorithm: `effective_start = prior_km × ability_factor × duration_factor × injury_cap`; injury/illness halve the cap; floors to current km
- [x] Option A default: shows recommended week-1 volume with explanation; Option B "Adjust this" slider from current km to prior baseline
- [x] Prompt injection: RETURNING FROM BREAK block with reason, duration, prior baseline, computed effective km, and injury/illness recovery note
- [x] Bug fix: `recentRuns4Weeks === 0` auto-resets km slider to 0; km inconsistency (0 runs but km > 0) now blocks Next with a clear message

**AI coach → plan control**

Design decisions (finalised):
- Coach only proposes a plan change when the user explicitly gives a reason — it does not proactively offer. It may also push back and encourage the user to complete a session if the reason doesn't warrant a change.
- Change proposal shown as an inline diff card inside the coach's message bubble — compact before/after table for each affected day, with a confirm button at the bottom of the card.
- Coach can change anything in the current week only (swap type, adjust distance, add/remove sessions, change the long run) — same authority as a real coach, constrained to this week.
- Coach gets the current week's running plan injected into its system context (sessions by date, type, distance, status). No cross-module context in v1.
- Single LLM call: Claude returns either normal prose or a JSON block with `plan_change` when it wants to propose a change. Backend detects and splits into `{response, plan_change}`.
- Recalibrate collision: if coach changes exist on the current week and the user hits recalibrate, show a confirmation warning before overwriting.
- Audit trail: minimal "Adjusted by coach" label on the calendar day card; tooltip on hover shows what the session was before and the reason the coach changed it.
- Undo: user goes back to the coach and asks to revert — no one-click undo in v1.

Tasks:
- [x] Add `PlanEdit` table: `id`, `module`, `week_start`, `date` (affected day), `changed_at`, `original_session` (JSON snapshot), `new_session` (JSON snapshot), `reason` (one sentence from the coach's rationale)
- [x] `POST /running/apply-plan-change`: validates change intent, mutates `WeeklyPlan.plan_json` for the affected days, writes `PlanEdit` rows, returns updated plan
- [x] Update `POST /coach/message`: inject current week's running plan (all days with status) into system context; detect `<plan_change>…</plan_change>` block in Claude response and return `{response, plan_change}` alongside normal `{response}`
- [x] Update coach system prompt: instruct Claude to think carefully before proposing a change — push back if the reason is vague; when a change is warranted, return a `<plan_change>` JSON block alongside prose; only affect today or future days
- [x] Frontend `CoachPanel`: render inline diff card when `plan_change` is present in the response; confirm/dismiss buttons; "Plan updated" confirmation after applying; `onPlanChanged` callback
- [x] Frontend `Running.tsx`: show "coach edit" badge on day cards that have a `PlanEdit` entry; tooltip on hover shows original session + reason
- [x] Frontend `Running.tsx`: recalibrate confirmation dialog when coach edits exist on the current week; user must confirm before recalibrate overwrites coach changes

---

## M2 — Food 🔬 ALPHA (built, not actively developed)

Core is built and usable end-to-end (onboarding, plan generation, logging, dashboard widget)
but development is paused — surfaced to the user as an "Alpha" badge on the onboarding module
card, the Food page header, and the sidebar nav item (`Badge` primitive, `var(--module-food)`).
Stretch/future items below are deferred until work resumes.

Nutrition adapts to training load — what you eat tonight depends on what you're doing tomorrow. The meal plan is generated from the training calendar: each day's food is shaped by the session type AND the window around it (carb-load the day before a long run, recovery focus the day after).

Design doc: `~/.gstack/projects/dhruvshettty-brickhub/dhruvshetty-main-design-20260425-002915.md`

### Food — Prerequisite
- [x] `race_date` already in running module's `module_configs` JSON (no separate migration needed — already in RunningConfigRequest)
- [x] Update `CLAUDE.md`: Food = M2, Biking = M3

### Food — Onboarding ✅ Done
- [x] 4-screen onboarding wizard (FoodSetup.tsx):
  - Screen 1: dietary preference (omnivore / vegetarian / vegan / other) + food intolerances
  - Screen 2: meal prep frequency (daily / every 2 days / every 3 days)
  - Screen 3: weight (kg, optional) + calorie baseline (auto-estimated as `weight_kg × 35`, user-confirmable; default 2200 kcal if skipped)
  - Screen 4: cuisine preference (Mediterranean / Asian / Western / Mix) — soft prompt hint
- [x] Config stored in `module_configs` (key: `food`). Snapshot fields for invalidation: `dietary_preference`, `intolerances`, `prep_frequency`, `calorie_baseline_kcal`, `weight_kg`, `cuisine_preference`
- [x] `PUT /food/config` — save config; `regenerate: true` deletes current week's plan (same pattern as running)
- [x] Onboarding gate on Food page — blocked until running module is configured

### Food — Plan Generation ✅ Done
- [x] Migration 008: `weekly_plans.config_snapshot` added; `meal_logs` recreated with `meal_slot`/`module`/`prep_batch`/`feedback`
- [x] `food_plan_generator.py`: `generate_food_plan(week_start, user_config, running_plan)`
  - Forward-looking window algorithm in Python (priority-ordered: race check → tomorrow's session → yesterday's session → default)
  - `nutrition_context` assigned per day before calling Claude
  - Prep batch assignment: batch 1 = Mon–Wed, batch 2 = Thu–Sun
- [x] Claude Sonnet call with `max_tokens=16384`: cached system block (nutrition profiles + JSON schema) + dynamic user block
- [x] JSON output validation + parse fallback (regex extraction on failure)
- [x] `GET /food/plan?week_start=` — cached plan + meal_logs; generates if missing; past weeks return `{plan: null}`
- [x] `ClaudeService.generate_with_cache` updated with `max_tokens` param (default 4096)
- [x] pytest suite for window algorithm + prep batch assignment (`backend/tests/test_food_plan_generator.py`, 26 tests)
- [x] Coach is NOT food-aware in M2 — deferred

### Food — Logging ✅ Done
- [x] `POST /food/log` — log a meal slot against a date
- [x] `DELETE /food/log/{id}` — clear log entry
- [x] Day detail shows logged vs. planned with macro totals + progress bars

### Food — Dashboard Widget ✅ Done
- [x] Food widget: today's calorie/macro targets + logged progress bar
- [x] Shows `nutrition_context` label (e.g., "Carb-loading day")
- [x] Links to food plan page

### Food — Frontend ✅ Done
- [x] `Food.tsx` page: weekly view (7-day strip) + day detail with logging buttons per meal slot
- [x] `nutrition_context` badge on day cards (Carb-loading / Recovery / Race morning / etc.)
- [x] Add `/food` + `/food/setup` routes in `App.tsx`, food API functions + types in `api.ts`

### Food — Stretch Goals (after core is stable)
- [ ] Grocery list: `GET /food/grocery-list?week_start=` — flatten `ingredients` arrays from plan JSON, group by category (produce / proteins / grains / dairy / pantry). Frontend: checkable list in a modal.
- [ ] Race week protocol: special plan variant when `race_date` is within 7 days (carb-loading T-3/T-2, race morning protocol, post-race recovery)

### Food — Future (deferred, add when ready)
- [ ] **"What worked" feedback loop**: add `worked_for_session_type` + `rating` to `meal_logs`; surface top-rated meals by session type in future plan generation. The `feedback` column is reserved in M2 schema.
- [ ] Restaurant / eating out mode: "I'm eating out tonight — what should I order?"
- [ ] Morning session timing awareness: add `session_time` field to running plan day schema; use to trigger `pre_workout_light` context for early sessions
- [ ] Multi-module coach context: inject food plan into `/coach/message` alongside running plan

---

## M3 — Biking 🔲 FUTURE

Full biking experience, at feature parity with running. Biking and running plans adapt to each other in real time.

### Biking — Onboarding
- [ ] FTP input or estimation wizard (20-min test protocol)
- [ ] Power zone generation (Z1–Z5 from FTP)
- [ ] Ride days, preferred ride type (road / trainer / gravel), goal distance
- [ ] Config stored in `module_configs` (same pattern as running)

### Biking — Plan & Logging
- [ ] Weekly bike plan generation (Claude, power zones, cross-module aware)
- [ ] Ride logging (duration, distance, avg power/HR, feel)
- [ ] Plan recalibration (same pattern as running)
- [ ] FTP update → invalidate current plan (same pattern as running config save)

### Running ↔ Biking Sync
- [ ] Bike fatigue feeds into running plan (reduce intensity day after hard ride)
- [ ] Run fatigue feeds into bike plan (easy spin after long run)
- [ ] Brick session detection (bike + run same day) already in signals — surface it in both plan views
- [ ] Coach aware of both plans simultaneously

---

## M4 — Training Data Integration 🔲 FUTURE

Replace manual logging with real activity data. Manual "mark done" is friction (skip it and
the plan drifts from reality) and inaccurate (you did 6k, not the planned 8k, at a different
pace). Pull what actually happened from the watch — via Strava first — so completion is
automatic and next week's plan reacts to real results. The training-load calc is accidental
complexity, not the product; real data just feeds it truth instead of guesses.

### Design decisions (from discovery, 2026-06-15)

- **Provider-agnostic ingestion.** One `ActivitySource` interface; Strava is the first adapter.
  Suunto / Garmin / Apple Health / a Manual adapter slot in later without touching the load
  calc or the Claude boundary. Strava chosen first because it aggregates every device
  (Garmin, Suunto, Coros, Apple, Polar all sync into it) — integrate once, support all watches.
  Direct-device APIs (e.g. Suunto APIZone) lock to one vendor and need partner-program approval.

```
 Garmin ┐
 Suunto ┤                          ActivitySource (interface)
 Coros  ├──► STRAVA ──► adapter ──►   ├── StravaAdapter   (build first)
 Apple  ┤                            ├── SuuntoAdapter   (future, device-direct)
 Polar  ┘                            └── ManualAdapter   (existing mark-done flow)
                                              │ normalized {start, duration, distance, hr}
                                              ▼
                                     WorkoutLog ──► get_signals() ──► Claude
                                                    (calc never knows the source)
```

- **Distribution = clone-and-self-host, single-user per deployment.** Not multi-tenant. Each
  self-hoster registers their own Strava API app, puts `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`
  in `.env` (same pattern as `ANTHROPIC_API_KEY`), and connects their own account. OAuth token
  stored on the single `Profile` row — no per-user token table, no multi-user display. This
  makes Strava's "don't display data to other users" clause moot.
- **AI-clause boundary (Strava API agreement, Nov 2024).** Strava bans putting API data into AI
  models. brickhub stays clear: Strava data feeds the deterministic load calc + UI only; Claude
  receives derived signals (fatigue bucket, counts) and — at recalibration — derived deltas
  ("ran tempo 18s/km faster than prescribed"), never raw activity JSON or splits. Inference-only
  + single-user self-host ⇒ enforcement risk ≈ 0, ToS risk low. Keep the aggregation step between
  Strava and any prompt; never shortcut raw fields into a prompt.
- **API cost:** free for the self-hoster as long as they have a Strava subscription (a sub is the
  prerequisite to create an API app — no separate per-call fee). Rate limits (200/15min, 2000/day)
  are far above single-athlete needs.
- **Sync on app-open only, no background cron.** Server is often off (personal localhost), so sync
  triggers when the app loads, plus a manual "Sync now" button. Debounce: skip if synced
  < ~15 min ago. Webhook adapter slot left for anyone who *does* host (needs a public URL).
- **Store locally, fetch incrementally.** Imported activities land in `WorkoutLog`
  (`source=imported`). Keep a `last_synced_at` cursor and fetch `GET /athlete/activities?after=`
  — never re-fetch history. Bounded first sync: pull only the current training window
  (since plan start / last ~4 weeks), not lifetime. Add `external_id` (Strava activity id) for
  idempotent dedupe so re-syncs never double-insert. What we fetch we keep (logs are tiny and
  feed the 4-week completion-rate signal); "don't fetch all weeks" ≠ prune what's imported.
- **Auto-match, confirm on ambiguity.** Map activity → planned session by date + type
  (run→running, ride→biking). Auto-import when the match is obvious; ask the user to
  confirm/override only when ambiguous (two runs same day, or no planned session). Keeps
  friction near-zero *and* completion accurate.
- **Scope this pass:** completion confirmation + accurate weekly volume; recalibration consumes
  derived actual-vs-prescribed deltas for next-week planning. No live per-session coaching.

### Phase 1 — Strava connect + import (completion) ✅ Done
- [x] `ActivitySource` interface (`activity_source.py`) + `StravaAdapter` (`strava_adapter.py`):
      OAuth2, token refresh, `GET /athlete/activities`. Scope `activity:read_all` (private runs too)
- [x] `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` in `.env` + `.env.example` (already present)
- [x] OAuth token (access + refresh + expiry epoch) and `strava_last_synced_at` on `Profile` (migration 010)
- [x] `external_id` column + index on `WorkoutLog` for dedupe (migration 010)
- [x] OAuth connect/disconnect flow (`/api/v1/strava/{authorize,callback,disconnect}`) +
      "Connect with Strava" button (`StravaCard.tsx`); disconnect clears token + deletes imported data
- [x] Sync service (`strava_sync.py`): on app-open (`App.tsx`) + manual "Sync now"; incremental
      `after=last_synced_at`; bounded first window (28d); ~15 min debounce; `force` bypass
- [x] Activity → planned session matching by date + type; auto-import on clear match; ambiguous
      (no_planned_session / multiple_activities / already_logged) surfaced in Settings with
      per-activity "Import to {date}" / "Dismiss" confirm controls
- [x] Map activity → `WorkoutLog` (source=imported, completed_at, duration_minutes, distance_km,
      avg_hr); feeds existing `get_signals()` unchanged — nothing reaches Claude (green band)
- [x] Tests: matching (all branches), adapter normalization + scope, incremental cursor, debounce,
      dedupe idempotency, token refresh — `backend/tests/test_strava_sync.py` (18 tests)
- [ ] Polish (deferred): "Imported from Strava" badge on the Running page day cards — imports show
      in the Settings sync summary today, but day_logs would need a `source` field to badge per-day

### Relative Effort → training status ✅ Done
- [x] Dashboard "Training Status" fatigue now uses Strava **Relative Effort** (`suffer_score`) as the
      source of truth when connected, falling back to the duration-based bucket otherwise. Captured in
      the adapter (`_activity_from`), persisted on `WorkoutLog.relative_effort` (migration 011) by sync,
      and aggregated in `cross_module.get_signals` as a weekly `training_load` (low/mod/high at the same
      300/150 thresholds). **Hybrid:** runs with HR use RE; HR-less runs fall back to a ~1-point/minute
      estimate so the week isn't undercounted. `training_load_source` (relative_effort / mixed / minutes)
      surfaced on the dashboard card. AI-clause: only the derived fatigue bucket reaches Claude, never raw
      `suffer_score`. Tests: adapter normalization + 3 hybrid-fatigue cases.

### Phase 2 — Recalibration off actuals (deltas)
- [ ] Compute derived per-session deltas: actual vs prescribed pace/duration/distance; weekly
      actual volume vs planned
- [ ] Inject deltas (derived, not raw splits) into recalibration prompt so next week's plan
      reacts to real results
- [ ] Tests: delta computation; prompt-boundary test asserting no raw activity fields reach Claude

### Phase 3 — Strava onboarding profile prefill ✅ Done

Connect Strava at app onboarding (M0 `ProfileStep`) to prefill personal info instead of
typing it. Reuses the existing OAuth/token infra (Phase 1). Respects the AI-clause boundary:
prefill emits scalar suggestions the user reviews and saves; raw Strava data never reaches a
prompt. Profile values become the user's own data once confirmed.

Design decisions (from review, 2026-06-15):
- **Connect-first, suggest-and-confirm.** OAuth is a full-page redirect that wipes React form
  state, so the connect button sits at the top of `ProfileStep` as the first action. On return,
  the frontend calls the prefill endpoint, populates editable fields, the user adds what's
  missing (age, height), and saves via the existing `PUT /settings/profile`. Nothing persists
  until save — no clobber, preserves the confirm seam.
- **Sync surfaces profile diffs.** Settings "Sync" compares Strava profile against local Profile
  and shows changes for the user to confirm before applying — never silently overwrites (same
  confirm seam as onboarding).
- **age + height are NOT in the Strava API** — always user-entered.

Tasks:
- [x] Adapter `fetch_athlete()` → name, sex, weight, measurement_preference (units). Added
      `profile:read_all` to `_SCOPE` (one-time reconnect for the single self-host user); name/sex
      come from `GET /athlete`.
- [x] `strava_onboarding.py`: build prefill payload (profile fields) + Strava-vs-Profile diff.
      The aggregation/confirm seam — emits scalars only, never raw athlete/activity JSON.
- [x] `GET /strava/onboarding-prefill` → suggested profile values (not persisted; graceful empty on failure).
- [x] State-aware OAuth: `/authorize?return_to=onboarding` carries return path via `state`;
      `/callback` branches the redirect (`/onboarding` vs `/settings`), with `state` whitelisted.
- [x] `Onboarding.tsx` `ProfileStep`: "Connect Strava to autofill" at top; populate editable
      fields on return; jumps straight to the profile step when returning from OAuth.
- [x] Settings `StravaCard`: profile-diff section — surface Strava-vs-local changes, confirm to apply.
- [x] Backend tests: `fetch_athlete` normalization + scope; prefill null-drop; diff
      (changed / epsilon / blank-local); return-path whitelist guard (55 pass, `tsc` clean).
- [ ] Deferred: frontend / E2E tests (no FE test runner). Live OAuth round-trip still needs a
      manual check with real `STRAVA_CLIENT_*` + a one-time reconnect for the new scope.

### Phase 4 — Strava running-onboarding prefill (history) 🔶 IN PROGRESS

Use Strava history to prefill the running-onboarding fields that feed **plan generation**, so the
user confirms instead of self-reporting. This is plan-generation input, separate from
the M0 profile prefill (Phase 3).

- [x] **Training-load prefill (Step 3):** `running_prefill_from_activities()` aggregates the last
      4 weeks of runs (count + distance) from the existing tested `fetch_activities` (no new adapter
      method) → `recent_runs_4_weeks`, `current_weekly_km`, clamped to slider bounds. Endpoint
      `GET /strava/running-prefill` (read-only, degrades to empty prefill, never 500). Frontend:
      "Autofill from Strava" banner in `RunningSetup` Step 3, gated on `stravaConnected` (no
      mid-wizard OAuth — would wipe form state; muted "connect in Settings" hint otherwise).
      Suggest-and-confirm: fills editable sliders, user adjusts + saves. 5 backend tests.
- [x] **Run-day pattern (Step 3):** `_run_day_pattern()` (in `strava_onboarding.py`) buckets the
      window's runs by weekday → `preferred_days` = weekdays with a run in ≥ half the weeks (filters
      one-offs); `long_run_day` = the preferred weekday with the greatest avg distance (always within
      `preferred_days`). Irregular/sparse history → no day keys (manual fallback). Folded into the
      same `GET /strava/running-prefill` payload + the Step-3 "Autofill from Strava" handler. Day-name
      scalars only (AI-clause safe). 2 backend tests (pattern + irregular).
- [ ] Ability auto-classify (option undecided): (A) skip — keep manual race-time entry; (B)
      `best_efforts` per standard distance via per-activity detail fetch — accurate but N calls +
      rate-limit/latency + race-vs-training ambiguity; (C) avg recent pace — cheap but
      underestimates ability → plan too easy. Lean A for a first cut, B as the complete version.
- [ ] Replace self-reported volume in `_running_config_context` (`plan_generator.py:106`) with the
      Strava-derived aggregates the user confirmed.
- [ ] **Live-derived metrics:** stop freezing `recent_runs_4_weeks` / `current_weekly_km` as static
      config snapshots; derive on demand from `WorkoutLog` (kept current by sync) so the dashboard +
      recalibration reflect real current load, not signup-day values. Config keeps only the
      onboarding seed value.

### Future (deferred — most need a device-direct source, not Strava)
- [ ] Additional adapters: Suunto (APIZone partner program), Garmin, Apple Health, Manual
- [ ] Webhook adapter (push on upload) for hosted deployments
- [ ] Training load score (TSS-like) per session and per week
- [ ] Fatigue trend over time (not just current-week snapshot)
- [ ] Recovery day auto-suggestion based on accumulated load
- [ ] Effort dashboard widget (visible from main dashboard)
- [ ] Cross-module signals improved: fatigue weighted per discipline separately
- [ ] Recovery score from HRV + sleep (needs watch-direct API — Strava does not reliably expose these)
- [ ] Actual vs planned load comparison view
- [ ] Long-term training load trend (CTL / ATL / TSB model)
- [ ] Readiness score on dashboard (should I train hard today?)

---

## M5 — 80/20 Polarized Model & Education 🔲 FUTURE

Make brickhub an explicit **80/20 polarized** training app (one fixed model, not a choice), and open the
black box: explain *why* each session is what it is, in 80/20 language, using the athlete's own HR zones.

**Scope reduced 2026-06-20** (was "Training Methodology & Education" — a 3-method selector). The
multi-method plan (80/20 / Norwegian double-threshold / base-first Lydiard, with a switch-to-experiment
loop) is **scrapped, not deferred**: a self-coached single-sport-split triathlete can't faithfully execute
Norwegian doubles, and 80/20 already half-ships as `effort_preference=balanced`. M5 is now a single fixed
model + the education layer. Design doc (APPROVED): `~/.gstack/projects/dhruvshettty-brickhub/dhruvshetty-main-design-20260620-212356.md`
(supersedes the multi-method `…-20260616-095414.md`).

### 80/20 as the single model
- [ ] Encode one 80/20 distribution rule in Python (successor to the `effort_desc` dict) + a post-generation guardrail
- [ ] Session-type buckets over the real enum (no `threshold` type): easy = `easy`/`recovery`/`long`; hard = `tempo`/`interval`/`race_pace`; `rest` excluded
- [ ] Guardrail (in `plan_generator`, tested): 1–2 hard-bucket sessions, majority of non-rest sessions easy; regenerate-once-then-warn **+ log the trip** in `uvicorn.log` on violation. **Coarse session-count check (not volume-exact); at n=2 accept 1 easy + 1 hard, don't false-warn.** Exception: `aerobic_base_priority` -> 0 hard allowed **unconditionally** (no week-index — codebase has none)
- [ ] **Remove `effort_preference`** (comfortable/balanced/challenging) everywhere — schema, `effort_desc`, prompt note (`plan_generator.py:84-85`), RunningSetup `EFFORT_OPTIONS`/state/Step-5 tile/ability auto-derive/week-1 preview `challenging`→tempo branch, `api.ts`. Keep `preferences_user_set` rescoped to `volume_preference` only. Keep `volume_preference` unchanged.
- [ ] Recalibration (`workout_adjuster`) and coach `<plan_change>` stay 80/20 (inject the same rule) so week 2+ doesn't drift
- [ ] Coach reads raw `plan_json` (no HR), never the read-time HR-bound view (AI-clause boundary)

### Personalized HR zones (fixed profile property)
- [ ] Add Profile `hr_max_bpm` (migration 012), seeded from `220 − age` at profile save, editable in Settings. No Strava ingest, no `WorkoutLog.max_hr`, no adapter change
- [ ] `hr_zones.py` — pure deterministic helper: HRmax → 5 zone `(low, high)` bands via fixed %HRmax. AI-clause safe (Python-derived; HR range never enters a prompt)
- [ ] Bind HR range from **session `type`** (not Claude's `pace_zone` literal) at read-time in `GET /running/plan` — one source for both the HR range and the easy/hard tag, so a card can't self-contradict. UI-only field, never Claude's `rationale`. Read-time = pre-M5 cached plans render fine, Settings edits reflect immediately

### Education (80/20-anchored)
- [ ] Day-card **intensity strip**: HR extends the mono zone line (`Zone 4 · ~168-178 bpm`) + a terse 80/20 **role tag** ("the 20% — hard" / "80% easy"), NOT prose — distinct from existing `description`/`rationale`. Tag text uses `ink-muted` (4.5:1 contrast)
- [ ] No-HR fallback: age-based zones; no age → RPE / talk-test text only (never blank, never fake)
- [ ] Learn panel on the Running page: polarization principle in prose on `surface-1` — **NO icon-grid / decorative cards** (anti-slop)
- [ ] **5-zone color scale** (DESIGN.md deviation, user-approved): desaturated/dark-safe, dots+text only never fills; add `zone-1..zone-5` to `frontend/src/lib/tokens.ts` **AND** DESIGN.md token block
- [ ] Settings HR-zone editor: `text-input` tokens, ≥44px touch targets, validate HRmax ~120-220 + inline error + save confirm
- [ ] Tests: 80/20 guardrail (incl. n=2 + unconditional aerobic-base + trip-log), HR-zone derivation + RPE fallback, AI-clause boundary, `effort_preference` removal, recalibration-stays-80/20

### Decisions settled (CEO + eng + design review, 2026-06-20/21)
All open questions resolved — see design doc for full rationale. Within-80/20 sub-dial: removed. `aerobic_base_priority`: unconditional 0-hard guardrail exception. No-age: unset + RPE + Settings nudge. Zone bands: 80/20-tuned %HRmax (Z1<72, Z2 72-82, Z3 82-87, Z4 87-92, Z5>92). Guardrail: regenerate-once-then-warn + log. Plan is implementation-ready.

---

## M6 — Gym 🔲 FUTURE

Strength training from user-provided principles, coordinated with run/bike load.

- [ ] PDF upload + parsing (extract gym principles at setup time)
- [ ] Gym onboarding (equipment, session days, goals: strength vs mobility vs injury prevention)
- [ ] Weekly gym plan generated from parsed principles + cross-module load
- [ ] Gym fatigue feeds into run/bike plans (leg day yesterday → easy run today)
- [ ] Session logging

---

## M7 — Swimming 🔲 FUTURE

- [ ] Swimming onboarding (pool vs open water, CSS pace estimate, goal distance)
- [ ] Yardage-based weekly plan generation
- [ ] Swim logging
- [ ] Swim volume + fatigue feeds into other modules

---

## Known Issues

- None open

---

## Dev Notes

- Docker setup exists (`docker-compose.yml`) but is deferred — native dev (`make dev-native`) is current path
- When switching to Docker: add `alembic upgrade head` to backend Dockerfile startup
- Test suite added (`backend/tests/`). Run with `make test`. Currently covers food module window algorithm + prep batch assignment (26 tests). pytest added to `requirements-native.txt`.
- No multi-user design — add `user_id` FKs to all tables + auth when ready to open-source
