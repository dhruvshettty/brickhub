# Roadmap

Tracks milestones, features, and known issues. Update this as work progresses.

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
- [ ] Coach can modify the current week's training plan through conversation — not just advise, but actually change sessions
- [ ] Two-phase flow: (1) coach gathers context through normal chat (e.g. "I have my period, should I take it easy?"), (2) when coach decides an adjustment is warranted it proposes specific changes and asks the user to confirm before applying
- [ ] On confirmation, coach calls a new `POST /coach/apply-plan-change` endpoint with a structured change intent (e.g. convert Thursday tempo → rest, reduce Friday to easy 5 km) which mutates the `WeeklyPlan` JSON in the DB
- [ ] Each coach-initiated change is written to a new `PlanEdit` log table: `week_start`, `module`, `changed_at`, `summary` (one line of what changed), `reason` (what the user said that prompted it)
- [ ] Calendar view shows an "Adjusted by coach" annotation inline on any day that was changed, with the reason surfaced on hover/expand — this is the persistent audit trail since chat history is capped
- [ ] Coach is given the current week's plan as part of its system context so it can reason about specific sessions by name and date, not just in the abstract
- [ ] Coach responses that suggest plan changes but haven't been confirmed yet show a distinct "Apply this change →" button in the chat UI rather than burying the action in prose

---

## M2 — Biking 🔲 NEXT

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

## M3 — Training Data Integration 🔲 FUTURE

Pull real workout data from the watch instead of manual logging. Improve training effort model with actual data.

### Strava Sync
- [ ] OAuth flow (`strava.com/settings/api`) + credentials in `.env`
- [ ] Webhook receiver — auto-ingest after every Strava upload
- [ ] Map Strava activity types → `WorkoutLog` entries (`WorkoutSource.imported`)
- [ ] HRV + sleep fields on `WorkoutLog` (from Strava or future provider)

### Training Effort & Fatigue (builds on Strava data)
- [ ] Training load score (TSS-like) calculated per session and per week
- [ ] Fatigue trend over time (not just current week snapshot)
- [ ] Recovery day auto-suggestion based on accumulated load
- [ ] Effort dashboard widget (visible from main dashboard)
- [ ] Cross-module signals improved: weight fatigue from each discipline separately
- [ ] Recovery score from HRV + sleep (Strava or provider data)
- [ ] Actual vs planned load comparison
- [ ] Long-term training load trend (CTL / ATL / TSB model)
- [ ] Readiness score on dashboard (should I train hard today?)

---

## M4 — Training Methodology & Education 🔲 FUTURE

Help athletes understand *why* their plan is structured the way it is, and let them choose a training philosophy that matches how they want to train. Education and methodology are merged — the explainer adapts to whichever method the user picks.

### Training methodology choice
- [ ] Add a methodology selector to onboarding (Step 4, training preferences section): 80/20 polarized / Norwegian double-threshold / base-first (Lydiard-style)
- [ ] 80/20 polarized: two hard sessions per week (one threshold, one interval or long), rest easy — the default for most athletes
- [ ] Norwegian double-threshold: two sub-maximal lactate threshold sessions per day on quality days (~90% easy overall), no true high-intensity — best for athletes who can train twice daily and have lab access or reliable HR data
- [ ] Base-first (Lydiard-style): no intensity work for 8–12 weeks, pure aerobic volume build — suited to beginners, returning athletes, or anyone with a long runway before their race
- [ ] Store as `training_methodology` in `running_config`; inject into Claude prompt so session types, structure, and intensity distribution match the chosen method
- [ ] Each tile includes a short tooltip: what the method is, who it suits, and what a typical week looks like

### In-app education (adapts to chosen methodology)
- [ ] Info panel on the Running page explaining the principles behind the user's chosen methodology — not generic running advice, but specific to what they picked
- [ ] For all methods: explain heart rate–based training, why effort feel matters more than pace, and how to gauge zones without a lab (talk test, RPE, rough HR formulas)
- [ ] For 80/20: explain the polarization principle — why easy days need to be genuinely easy, what "Zone 2" means in practice, and how the 20% hard work drives adaptation
- [ ] For Norwegian: explain double-threshold philosophy, why they avoid the "grey zone," and the importance of consistent lactate threshold work
- [ ] For base-first: explain aerobic base building, why patience now pays off later, and what signs indicate readiness to add intensity
- [ ] Link the pace zones on each session day card back to the user's HR zones so "Zone 2" isn't abstract

---

## M5 — Food 🔲 FUTURE

Nutrition adapts to training load — what you eat tonight depends on what you're doing tomorrow.


- [ ] Food onboarding (dietary preferences, calorie target baseline)
- [ ] Daily calorie + macro targets driven by cross-module signals (big ride tomorrow → carb up)
- [ ] Claude-generated meal plans (breakfast, lunch, dinner, snacks)
- [ ] Meal logging (`MealLog` table already exists)
- [ ] `GET /food/plan`, `POST /food/log`
- [ ] Food widget on dashboard (today's targets + what's logged)

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
- No test suite yet — add before M2 ships
- No multi-user design — add `user_id` FKs to all tables + auth when ready to open-source
