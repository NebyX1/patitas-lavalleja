"""Small, continuous membership functions; no heavyweight fuzzy dependency."""

from __future__ import annotations

from collections.abc import Mapping


def clamp(value: float, lower: float = 0, upper: float = 1) -> float:
    return max(lower, min(upper, value))


def triangular(value: float, left: float, peak: float, right: float) -> float:
    if not left <= peak <= right or left == right:
        raise ValueError("Invalid triangular membership parameters")
    if value == peak:
        return 1.0
    if value <= left or value >= right:
        return 0.0
    return (value - left) / (peak - left) if value < peak else (right - value) / (right - peak)


def trapezoidal(value: float, left: float, start: float, end: float, right: float) -> float:
    if not left <= start <= end <= right or left == right:
        raise ValueError("Invalid trapezoidal membership parameters")
    if start <= value <= end:
        return 1.0
    if value <= left or value >= right:
        return 0.0
    return (value - left) / (start - left) if value < start else (right - value) / (right - end)


def sufficient(offered: float, needed: float) -> float:
    """Linear left shoulder: 60/70 min stays close, not a binary rejection."""
    return 1.0 if needed <= 0 else clamp(offered / needed)


def company(hours_away: float, tolerated_alone: float) -> float:
    """Full membership within the observed limit, gradual fall over six hours."""
    return clamp(1 - max(0, hours_away - tolerated_alone) / 6)


def closeness(first: float, second: float, span: float = 5) -> float:
    return clamp(1 - abs(first - second) / span)


def weighted_known(values: Mapping[str, float | None], weights: Mapping[str, float]) -> float | None:
    known = [(value, weights[key]) for key, value in values.items() if value is not None and key in weights]
    denominator = sum(weight for _, weight in known)
    return sum(float(value) * weight for value, weight in known) / denominator if denominator else None
