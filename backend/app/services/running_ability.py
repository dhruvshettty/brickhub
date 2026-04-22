"""Deterministic running ability classification. No Claude involved."""

DISTANCE_KM: dict[str, float] = {
    "5k": 5.0,
    "10k": 10.0,
    "10_mile": 16.09,
    "half_marathon": 21.0975,
    "marathon": 42.195,
    "50k": 50.0,
}

# Pace thresholds in seconds/km: elite / advanced / intermediate
PACE_THRESHOLDS: dict[str, dict[str, int]] = {
    "5k":            {"elite": 210, "advanced": 255, "intermediate": 330},
    "10k":           {"elite": 222, "advanced": 270, "intermediate": 348},
    "10_mile":       {"elite": 234, "advanced": 285, "intermediate": 366},
    "half_marathon": {"elite": 240, "advanced": 294, "intermediate": 378},
    "marathon":      {"elite": 258, "advanced": 318, "intermediate": 408},
    "50k":           {"elite": 300, "advanced": 372, "intermediate": 480},
}

LEVEL_ORDER = ["beginner", "intermediate", "advanced", "elite"]


def classify_from_pace(distance: str, time_seconds: int) -> str:
    distance_km = DISTANCE_KM[distance]
    pace = time_seconds / distance_km
    thresholds = PACE_THRESHOLDS[distance]
    if pace <= thresholds["elite"]:
        return "elite"
    if pace <= thresholds["advanced"]:
        return "advanced"
    if pace <= thresholds["intermediate"]:
        return "intermediate"
    return "beginner"


def apply_effort_adjustment(base_level: str, effort_score: int) -> tuple[str, bool]:
    aerobic_base_priority = effort_score >= 8
    if effort_score >= 8:
        idx = LEVEL_ORDER.index(base_level)
        adjusted = LEVEL_ORDER[max(0, idx - 1)]
    else:
        adjusted = base_level
    return adjusted, aerobic_base_priority


def suggest_weekly_runs(recent_runs_4_weeks: int, ability_level: str) -> int:
    caps = {"beginner": 4, "intermediate": 5, "advanced": 6, "elite": 7}
    avg = recent_runs_4_weeks / 4
    suggested = max(2, round(avg * 0.8))
    return min(suggested, caps[ability_level])


def build_explanation(base_level: str, adjusted_level: str, aerobic_base_priority: bool) -> str:
    level_display = adjusted_level.capitalize()
    if aerobic_base_priority:
        return (
            f"Your times put you in the {base_level.capitalize()} category, but at high effort your aerobic "
            f"base is the primary limiter — classified as {level_display}. "
            "Your plan will emphasise Zone 2 running to build that engine."
        )
    return (
        f"Based on your time, you're in the {level_display} category. "
        "Your plan will be structured around appropriate pace zones for your level."
    )


def classify(distance: str, time_seconds: int, effort_score: int) -> dict:
    base_level = classify_from_pace(distance, time_seconds)
    adjusted_level, aerobic_base_priority = apply_effort_adjustment(base_level, effort_score)
    return {
        "base_level": base_level,
        "adjusted_level": adjusted_level,
        "aerobic_base_priority": aerobic_base_priority,
        "explanation": build_explanation(base_level, adjusted_level, aerobic_base_priority),
    }
