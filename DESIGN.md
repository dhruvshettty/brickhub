---
version: alpha
name: brickhub-design
description: "Dark, near-black training dashboard adapted from Linear's product canvas. Built on a deep canvas (#08090a) with a four-step surface ladder, light-gray text (#f7f8f8), hairline borders, and a single athletic electric-blue accent (#3b82f6 — swapped in for Linear's lavender). Type is Geist (free Linear-Display substitute) with measured negative tracking on display sizes; Geist Mono for numbers, durations, paces, and IDs. Cards are charcoal panels with 1px hairlines and 8px–12px corners, no drop shadows — depth comes from the surface ladder. A restrained per-module color palette (run/bike/swim/gym/food) identifies data in charts, tags, and module headers only; it is never used as fills. The system reads as dense, technical, quietly serious software for an athlete who lives in numbers."

# ── Provenance ──────────────────────────────────────────────────────
# Adapted from the Linear design system via getdesign.md
#   (npx getdesign add linear.app). Token structure, surface ladder,
#   type scale, radius, and spacing are Linear's. Three deliberate
#   departures for brickhub:
#     1. Accent: Linear lavender #5e6ad2 → athletic blue #3b82f6
#        (already brickhub's accent — continuity + avoids the purple-SaaS cliché).
#     2. Fonts: proprietary Linear Display/Text → Geist + Geist Mono (free, OFL).
#     3. Added: per-module color palette + full semantic set
#        (success/warning/error/info) for a data app, not a marketing page.

colors:
  primary: "#3b82f6"          # athletic electric blue — primary CTA, focus ring, links, "running" (primary sport)
  on-primary: "#ffffff"
  primary-hover: "#60a5fa"
  primary-focus: "#2563eb"

  ink: "#f7f8f8"              # headlines + emphasized body
  ink-muted: "#d0d6e0"        # secondary text, meta
  ink-subtle: "#8a8f98"       # tertiary — labels, deselected tabs, footer
  ink-tertiary: "#62666d"     # quaternary — disabled, footnotes

  canvas: "#08090a"           # page background — near-black (softer than Linear #010102, deeper than current #0f0f0f)
  surface-1: "#0f1011"        # cards, panels, day tiles
  surface-2: "#141516"        # featured/hovered cards, selected tabs
  surface-3: "#18191a"        # sub-nav, dropdowns, coach bubbles
  surface-4: "#191a1b"        # deepest lifted surface

  hairline: "#23252a"         # 1px card + divider borders
  hairline-strong: "#34343a"  # input focus borders
  hairline-tertiary: "#3e3e44" # nested-surface borders

  semantic-success: "#22c55e" # workout done, on-target
  semantic-warning: "#f59e0b" # caution, partial, recalibration suggested
  semantic-error: "#ef4444"   # missed session, error
  semantic-info: "#3b82f6"    # informational (= primary)
  semantic-overlay: "#000000" # modal scrim

  module-run: "#3b82f6"       # running (shares primary — it's the primary sport)
  module-bike: "#f97316"      # biking
  module-swim: "#06b6d4"      # swimming
  module-gym: "#a855f7"       # gym
  module-food: "#22c55e"      # food

  # HR zone scale: a 5-step scale used ONLY as small
  # dots + text on day cards, NEVER as fills — desaturated so it survives the dark
  # canvas without shouting. Cool = easy/aerobic (the 80%), warm = hard (the 20%).
  zone-1: "#5b8aa8"           # recovery — desaturated blue
  zone-2: "#5a9d6e"           # easy aerobic — desaturated green
  zone-3: "#b8954f"           # grey zone — amber
  zone-4: "#c47a45"           # threshold — desaturated orange
  zone-5: "#c25a5a"           # VO2 / intervals — desaturated red

typography:
  display-xl:   { fontFamily: Geist, fontSize: 80px, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3.0px }
  display-lg:   { fontFamily: Geist, fontSize: 56px, fontWeight: 600, lineHeight: 1.10, letterSpacing: -1.8px }
  display-md:   { fontFamily: Geist, fontSize: 40px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -1.0px }
  headline:     { fontFamily: Geist, fontSize: 28px, fontWeight: 600, lineHeight: 1.20, letterSpacing: -0.6px }
  card-title:   { fontFamily: Geist, fontSize: 22px, fontWeight: 500, lineHeight: 1.25, letterSpacing: -0.4px }
  subhead:      { fontFamily: Geist, fontSize: 20px, fontWeight: 400, lineHeight: 1.40, letterSpacing: -0.2px }
  body-lg:      { fontFamily: Geist, fontSize: 18px, fontWeight: 400, lineHeight: 1.50, letterSpacing: -0.1px }
  body:         { fontFamily: Geist, fontSize: 16px, fontWeight: 400, lineHeight: 1.50, letterSpacing: -0.05px }
  body-sm:      { fontFamily: Geist, fontSize: 14px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }
  caption:      { fontFamily: Geist, fontSize: 12px, fontWeight: 400, lineHeight: 1.40, letterSpacing: 0 }
  button:       { fontFamily: Geist, fontSize: 14px, fontWeight: 500, lineHeight: 1.20, letterSpacing: 0 }
  eyebrow:      { fontFamily: Geist, fontSize: 13px, fontWeight: 500, lineHeight: 1.30, letterSpacing: 0.4px }
  metric:       { fontFamily: Geist Mono, fontSize: 28px, fontWeight: 500, lineHeight: 1.10, letterSpacing: -0.5px } # big stat numbers
  mono:         { fontFamily: Geist Mono, fontSize: 13px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }     # paces, durations, IDs, inline data

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 8px 14px }
  button-primary-hover:
    { backgroundColor: "{colors.primary-hover}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}" }
  button-primary-pressed:
    { backgroundColor: "{colors.primary-focus}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}" }
  button-secondary:
    { backgroundColor: "{colors.surface-1}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 8px 14px } # + 1px {colors.hairline}
  button-ghost:
    { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 8px 14px }
  stat-card:
    { backgroundColor: "{colors.surface-1}", textColor: "{colors.ink}", typography: "{typography.metric}", rounded: "{rounded.lg}", padding: 24px } # + 1px {colors.hairline}
  plan-day-card:
    { backgroundColor: "{colors.surface-1}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 24px } # + 1px {colors.hairline}
  plan-day-card-today:
    { backgroundColor: "{colors.surface-2}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 24px } # surface lift marks "today"
  log-row:
    { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-sm}", rounded: "{rounded.xs}", padding: 16px 0 } # + 1px {colors.hairline} bottom rule
  coach-bubble-user:
    { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 12px 16px }
  coach-bubble-assistant:
    { backgroundColor: "{colors.surface-3}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 12px 16px }
  module-tab-default:
    { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-subtle}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: 6px 14px }
  module-tab-selected:
    { backgroundColor: "{colors.surface-2}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: 6px 14px }
  text-input:
    { backgroundColor: "{colors.surface-1}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.md}", padding: 8px 12px } # + 1px {colors.hairline}; focus → 1px {colors.primary}
  status-badge:
    { backgroundColor: "{colors.surface-2}", textColor: "{colors.ink-muted}", typography: "{typography.caption}", rounded: "{rounded.pill}", padding: 2px 8px }
  sidebar-nav:
    { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-subtle}", typography: "{typography.body-sm}", rounded: "{rounded.xs}" }
  top-nav:
    { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-sm}", rounded: "{rounded.xs}", height: 56px }
---

# Design System — brickhub

> **Adapted from Linear** (via getdesign.md). Read this file before making any
> visual or UI decision. The YAML front matter above is the machine-readable
> token source; the prose below is the reasoning and usage guide. Don't deviate
> without explicit approval.

## Product Context

- **What this is:** Personal triathlon training dashboard. Five modules (running, biking, swimming, gym, food) share cross-module intelligence; Claude generates plans and coaches in real time.
- **Who it's for:** A single self-hosted athlete who lives in their training numbers.
- **Space:** Athlete-facing training/analytics tools (Strava, Whoop, TrainingPeaks, Intervals.icu).
- **Project type:** Data-dense dark web app / dashboard (React 18 + inline styles + CSS custom properties).

## Aesthetic Direction

- **Direction:** Near-black product canvas (Linear-derived). Dense, technical, quietly serious.
- **Decoration level:** Minimal. Depth comes from a surface ladder + hairlines, never gradients or shadows.
- **Mood:** Software-craft. The app feels like a precision instrument, not a consumer fitness toy. Numbers are the protagonist; chrome stays out of the way.
- **The one memorable thing:** *Serious software for serious training.* Every choice serves that — restraint over decoration, monospace metrics, a single confident accent.

## Color

- **Approach:** Restrained. One chromatic accent (`primary`) does the work; modules get muted hues used only for data identification.
- **Canvas:** `#08090a` — near-black anchor surface. Never `#000000` true black.
- **Surface ladder:** `surface-1 #0f1011` → `surface-2 #141516` → `surface-3 #18191a` → `surface-4 #191a1b`. Use it for hierarchy; don't skip levels. "Today" / featured / hovered = one step up.
- **Hairlines:** `#23252a` default, `#34343a` strong (focus), `#3e3e44` nested.
- **Text:** `ink #f7f8f8` (headlines/body) · `ink-muted #d0d6e0` (secondary) · `ink-subtle #8a8f98` (labels/tertiary) · `ink-tertiary #62666d` (disabled).
- **Accent (`primary #3b82f6`):** primary CTA, focus rings, links, selected state, and the running module. Scarce and meaningful — never a card fill or section background.
- **Semantic:** success `#22c55e` (done/on-target) · warning `#f59e0b` (partial/recalibrate) · error `#ef4444` (missed) · info `#3b82f6`.
- **Module palette** (app extension beyond Linear's single-accent rule): run `#3b82f6` · bike `#f97316` · swim `#06b6d4` · gym `#a855f7` · food `#22c55e`. **Usage:** chart series, small tags/dots, module headers, badge text. **Never** as a full background fill. Keep them desaturated on the dark canvas.
- **HR zone scale** (M5, user-approved deviation): a 5-step scale (`zone-1`…`zone-5`) for the running day-card intensity strip. Cool→warm encodes easy→hard (the 80/20 split). Deliberately **desaturated** so five hues coexist on the dark canvas; **dots + text only, never fills** — the no-fill rule still holds. Education tag text uses `ink-muted #d0d6e0` (not `ink-subtle`) to clear 4.5:1 on `surface-1`.
- **Dark mode:** This system *is* dark. There is no light theme; don't ship one without an explicit redesign of surfaces.

## Typography

- **Display + body:** **Geist** (Vercel, OFL — free). The recommended open substitute for Linear's proprietary display/text cut: same geometric-grotesk feel. Weights 400 / 500 / 600 only — resist 700+ on display.
- **Mono:** **Geist Mono** for all data tokens — paces (`4:32/km`), durations (`1:15:00`), distances, heart rate, IDs, code. The `metric` token (28px Geist Mono) is for big stat numbers on cards.
- **Loading:** Google Fonts — `Geist:wght@400;500;600` and `Geist Mono:wght@400;500`. Self-host via `@fontsource-variable/geist` for offline/self-hosted builds.
- **Fallback stack:** `Geist, 'SF Pro Display', -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif`.
- **Scale:** see the `typography` block. Display tracks aggressively negative (-3.0px at 80px down to ~0 at body); `eyebrow` is the only positive-tracked token (+0.4px) to mark it as taxonomy.
- **App usage:** display-xl/lg are for hero / empty-state / onboarding moments only. The dashboard runs on `body` (16), `body-sm` (14, card body), `caption` (12, meta), `metric` (stat numbers), and `mono` (inline data).

## Spacing & Layout

- **Base unit:** 4px. Tokens: `xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48 · section 96`.
- **Card padding:** `lg 24` default; `xl 32` for roomy panels.
- **Button padding:** 8px × 14px (compact). **Input padding:** 8px × 12px.
- **Grid:** module/stat cards 3-up desktop → 2-up tablet (≤1024px) → 1-up mobile (≤768px). Week plan = 7-up row collapsing to a vertical stack on mobile.
- **Whitespace philosophy:** the dark canvas IS the whitespace. Separate sections by lifting content onto `surface-1` panels, not by large empty gaps. `lg 24` between blocks inside a panel; `section 96` between major sections.

## Shapes (Border Radius)

`xs 4` chips/badges · `sm 6` inline tags · `md 8` **all buttons + inputs** · `lg 12` cards/panels · `xl 16` large feature/screenshot panels · `pill 9999` tabs + status pills · `full 9999` avatars. Note: `md 8` already matches the app's current `--radius`.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | No border, no shadow | Body text, headlines |
| 1 | `surface-1` + 1px `hairline` | Default cards, plan day tiles, stat cards |
| 2 | `surface-2` + 1px `hairline-strong` | Today / featured / hovered cards |
| 3 | `surface-3` | Sub-nav, dropdowns, coach assistant bubbles |
| 4 | 2px `primary` outline @ 50% | Focused input / button |

Depth = surface ladder + hairlines. **No drop shadows. No atmospheric gradients. No spotlight cards.**

## Components (dashboard vocabulary)

See the `components` block for exact tokens. Key patterns:

- **Buttons:** `button-primary` (blue CTA) · `button-secondary` (charcoal + hairline) · `button-ghost` (plain). 8px corners — never pill-round a CTA.
- **stat-card:** big `metric` number (Geist Mono) + `caption` label. The dashboard's core tile (weekly volume, sessions done, etc.).
- **plan-day-card / -today:** one tile per day in a week plan; today lifts to `surface-2`.
- **log-row:** workout/meal log entries — borderless on canvas, 1px hairline bottom rule, done/missed marked with a semantic dot.
- **coach-bubble-user / -assistant:** chat with the AI coach. User = primary fill; assistant = `surface-3`.
- **module-tab:** pill toggle for switching modules; selected = surface lift, not a colored fill.
- **status-badge:** small pill for state ("done", "missed", "rest day"); text colored by semantic/module.
- **text-input:** `surface-1` + hairline; focus → 1px `primary` border (matches current app behavior).

## Motion

- **Approach:** minimal-functional. Transitions only where they aid comprehension (state changes, panel reveals, tab switches).
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 50–100ms · short 150–250ms · medium 250–400ms. No scroll choreography, no decorative animation.

## Responsive

| Name | Width | Key changes |
|---|---|---|
| Desktop | ≥1280px | 3-up card grids, full week row |
| Tablet | ≤1024px | 3-up → 2-up |
| Mobile | ≤768px | 1-up; week plan stacks vertically; nav → hamburger; display-xl scales 80→~36px |

Touch targets ≥44px on touch viewports. Mono data never wraps mid-token; numbers use `tabular-nums`.

## Do's and Don'ts

**Do**
- Reserve `canvas #08090a` as the anchor surface; use the 4-step ladder for hierarchy.
- Use `primary #3b82f6` only for CTA, focus, links, selected, and the running module.
- Set all data (paces, durations, HR, distances) in Geist Mono with `tabular-nums`.
- Pair display weight 600 with body weight 400; apply negative tracking on display.
- Color-code modules with the muted palette in charts/tags/headers only.

**Don't**
- Don't ship a light theme.
- Don't use the accent or module colors as card fills or section backgrounds.
- Don't add gradients, drop shadows, or spotlight cards.
- Don't pill-round CTAs (pills are for tabs/badges).
- Don't use `#000000` true black, or `Inter`/system-ui as the display font.
- Don't introduce a second bright chromatic accent for chrome.

## Implementation

The system is live across the app. Where each part lives:

- **Tokens** (colors, surface ladder, type, radius, spacing, motion) — `frontend/src/index.css` `:root`. Old names (`--bg`/`--surface`/`--border`/`--text`/`--accent`/`--green`/`--orange`/`--red`/`--radius`) remain as aliases.
- **Data-viz palettes** (workout-type, nutrition-context, macro, fatigue, module) — `frontend/src/lib/tokens.ts`. JS literals, because they feed SVG/lucide where CSS vars don't resolve.
- **Type scale** — `frontend/src/components/Type.tsx` (`Heading`/`Text`/`Metric`). Use these for new UI instead of inline `fontSize`/`fontWeight`.
- **Numeric data** — `className="mono"` (Geist Mono + tabular-nums), or the global `input[type="number"]` rule.
