# Roadmap

Tracks milestones, features, and known issues. Update this as work progresses.

---

## M1 — Running + Training Effort 🔲 IN PROGRESS

Everything needed to nail the running experience end-to-end, plus a solid training effort and fatigue model that all future modules build on.

### Running — Onboarding ✅ Done
- [x] 5-step wizard: distance → ability assessment → schedule → timeline → confirm
- [x] Deterministic ability classification (pace + effort score)
- [x] Live classify endpoint (`POST /running/classify`)
- [x] Config persisted in `module_configs` table
- [x] Onboarding gate on Running page (redirect if not onboarded)
- [x] Plan invalidated on config save (forces fresh generation with new settings)

### Running — Plan & Logging ✅ Done
- [x] Weekly plan generation (Claude Sonnet, cross-module aware)
- [x] Workout logging (done / missed per session)
- [x] Plan recalibration (adjusts based on missed sessions)
- [x] Ability badge + race countdown in header
- [x] Edit plan settings button

### Running — Polish 🔲 To Do
- [ ] Re-onboarding flow: editing config should offer to regenerate or keep current plan
- [ ] Plan view shows preferred days highlighted
- [ ] Completed sessions marked persistently (not just a button)
- [ ] Week navigation (view past weeks, not just current)
- [ ] Plan explanation — why each session is what it is

### Training Effort & Fatigue 🔲 To Do
- [ ] Training load score (TSS-like) calculated per session and per week
- [ ] Fatigue trend over time (not just current week snapshot)
- [ ] Recovery day auto-suggestion based on accumulated load
- [ ] Effort dashboard widget (visible from main dashboard)
- [ ] Cross-module signals improved: weight fatigue from each discipline separately

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

### Suunto Watch Sync
- [ ] OAuth flow (`apizone.suunto.com`) + credentials in `.env`
- [ ] Webhook receiver — auto-ingest after every watch sync
- [ ] Map Suunto activity types → `WorkoutLog` entries
- [ ] HRV + sleep fields on `WorkoutLog`

### Training Effort Improvements (builds on M1)
- [ ] Recovery score from HRV + sleep (Suunto data)
- [ ] Actual vs planned load comparison
- [ ] Long-term training load trend (CTL / ATL / TSB model)
- [ ] Readiness score on dashboard (should I train hard today?)

---

## M4 — Food 🔲 FUTURE

Nutrition adapts to training load — what you eat tonight depends on what you're doing tomorrow.

- [ ] Food onboarding (dietary preferences, calorie target baseline)
- [ ] Daily calorie + macro targets driven by cross-module signals (big ride tomorrow → carb up)
- [ ] Claude-generated meal plans (breakfast, lunch, dinner, snacks)
- [ ] Meal logging (`MealLog` table already exists)
- [ ] `GET /food/plan`, `POST /food/log`
- [ ] Food widget on dashboard (today's targets + what's logged)

---

## M5 — Gym 🔲 FUTURE

Strength training from user-provided principles, coordinated with run/bike load.

- [ ] PDF upload + parsing (extract gym principles at setup time)
- [ ] Gym onboarding (equipment, session days, goals: strength vs mobility vs injury prevention)
- [ ] Weekly gym plan generated from parsed principles + cross-module load
- [ ] Gym fatigue feeds into run/bike plans (leg day yesterday → easy run today)
- [ ] Session logging

---

## M6 — Swimming 🔲 FUTURE

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
