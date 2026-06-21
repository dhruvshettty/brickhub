"""Personalized HR zones + 80/20 session buckets — pure deterministic helpers.

AI-clause boundary: every HR value here is derived in Python from the athlete's
stored HRmax and only ever stitched onto UI-only fields at read-time
(`GET /running/plan`). No HR — and no HRmax — ever enters a Claude prompt. Same
seam as `cross_module.get_signals()`.

Session-type buckets are defined ONCE here and reused by both the 80/20 guardrail
(`plan_generator.check_polarization`) and the read-time HR/effort binding — so a
card's HR zone and its easy/hard tag can never disagree (both derive from `type`).

Zone bands are 80/20-tuned %HRmax (design doc, eng review 2026-06-21):
  Z1 <72%, Z2 72-82%, Z3 82-87% (grey zone), Z4 87-92%, Z5 >92% HRmax.
Z2 ceiling ≈ aerobic threshold, Z4 floor ≈ lactate threshold — the easy/hard
split aligns to the polarized model. These are estimates, not lab values.
"""

from __future__ import annotations

# (low_pct, high_pct) of HRmax per zone. Z1 floor is a practical aerobic floor
# (~55% HRmax), Z5 ceiling is HRmax itself.
ZONE_BANDS: dict[int, tuple[float, float]] = {
    1: (0.55, 0.72),
    2: (0.72, 0.82),
    3: (0.82, 0.87),
    4: (0.87, 0.92),
    5: (0.92, 1.00),
}

# Session-type buckets over the real plan enum (no `threshold` type exists).
EASY_TYPES = frozenset({"easy", "recovery", "long"})
HARD_TYPES = frozenset({"tempo", "interval", "race_pace"})

# Session type → prescribed HR zone (the grey-zone Zone 3 is never prescribed).
TYPE_TO_ZONE: dict[str, int] = {
    "recovery": 1,
    "easy": 2,
    "long": 2,
    "tempo": 4,
    "race_pace": 4,
    "interval": 5,
}

# Talk-test / RPE fallback when zones are unset (no age, HRmax not entered).
# Never blank, never a fake HR number.
_RPE_FALLBACK: dict[str, str] = {
    "recovery": "Very easy — fully conversational (RPE 2-3)",
    "easy": "Easy — conversational, full sentences (RPE 3-4)",
    "long": "Easy — conversational, full sentences (RPE 3-4)",
    "tempo": "Comfortably hard — short sentences only (RPE 6-7)",
    "race_pace": "Comfortably hard — short sentences only (RPE 6-7)",
    "interval": "Very hard — near max, can't talk (RPE 8-9)",
}

# Terse 80/20 role tag per bucket (the education line on each card).
_EASY_TAG = "the 80% — keep it easy"
_RECOVERY_TAG = "the 80% — recovery, very easy"
_HARD_TAG = "the 20% — go genuinely hard"


def seed_hrmax_from_age(age: int | None) -> int | None:
    """Classic age estimate: 220 − age. None when age is unknown."""
    if age is None:
        return None
    return 220 - age


def derive_zones(hr_max_bpm: int | None) -> dict[int, tuple[int, int]] | None:
    """HRmax → 5 zone (low_bpm, high_bpm) bands. None when HRmax is unknown."""
    if not hr_max_bpm or hr_max_bpm <= 0:
        return None
    return {
        zone: (round(hr_max_bpm * lo), round(hr_max_bpm * hi))
        for zone, (lo, hi) in ZONE_BANDS.items()
    }


def bucket_for_type(session_type: str) -> str | None:
    """'easy' | 'hard' for a non-rest session; None for rest/unknown."""
    if session_type in EASY_TYPES:
        return "easy"
    if session_type in HARD_TYPES:
        return "hard"
    return None


def zone_for_type(session_type: str) -> int | None:
    return TYPE_TO_ZONE.get(session_type)


def hr_range_label(zone: int, zones: dict[int, tuple[int, int]]) -> str:
    """e.g. 'Zone 4 · ~168-178 bpm'."""
    low, high = zones[zone]
    return f"Zone {zone} · ~{low}-{high} bpm"


def rpe_fallback(session_type: str) -> str | None:
    return _RPE_FALLBACK.get(session_type)


def effort_tag(session_type: str) -> str | None:
    """Terse 80/20 role tag for the card. None for rest/unknown."""
    if session_type == "recovery":
        return _RECOVERY_TAG
    if session_type in EASY_TYPES:
        return _EASY_TAG
    if session_type in HARD_TYPES:
        return _HARD_TAG
    return None


def bind_education(day: dict, zones: dict[int, tuple[int, int]] | None) -> dict:
    """Return a copy of a plan day enriched with UI-only education fields.

    Drives BOTH the HR range and the easy/hard tag off the session `type` (the
    single source of truth), so a card can never show a hard-zone HR next to an
    "easy" tag. Rest days get nothing. Claude's `pace_zone` literal is ignored
    here — it's advisory only.
    """
    enriched = dict(day)
    session_type = day.get("type")
    if session_type == "rest" or session_type is None:
        return enriched

    bucket = bucket_for_type(session_type)
    zone = zone_for_type(session_type)
    enriched["intensity"] = bucket           # 'easy' | 'hard' | None
    enriched["zone"] = zone
    enriched["effort_tag"] = effort_tag(session_type)

    if zones is not None and zone is not None:
        low, high = zones[zone]
        enriched["hr_low"] = low
        enriched["hr_high"] = high
        enriched["hr_range"] = hr_range_label(zone, zones)
        enriched["rpe_text"] = None
    else:
        # Zones unset → talk-test / RPE text instead of a dangling "~HR —".
        enriched["hr_low"] = None
        enriched["hr_high"] = None
        enriched["hr_range"] = None
        enriched["rpe_text"] = rpe_fallback(session_type)

    return enriched
