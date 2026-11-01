"""Simplex projection: the univariate forecast used to pick an embedding.

Cross mapping needs an embedding dimension, and picking one by eye is how a
cross-map result becomes an artefact of its parameters. Simplex projection
gives a defensible choice: embed the series in each candidate dimension, let
each state predict its own future from its nearest neighbours, and keep the
dimension that forecasts best.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .embedding import (
    as_series,
    nearest_neighbours,
    pearson,
    simplex_weights,
    time_delay_embed,
)


@dataclass(frozen=True)
class DimensionScan:
    """Forecast skill at each candidate embedding dimension."""

    dimensions: tuple[int, ...]
    rho: tuple[float, ...]
    lag: int
    horizon: int

    @property
    def best(self) -> int:
        """The dimension with the highest skill, ties going to the smaller one."""
        return self.dimensions[int(np.argmax(self.rho))]


def simplex_forecast_skill(
    series,
    dimension: int,
    lag: int = 1,
    horizon: int = 1,
    exclusion_radius: int = 0,
) -> float:
    """Leave-one-out forecast skill of a series against its own manifold.

    Each delay vector is projected ``horizon`` steps ahead using its
    ``dimension + 1`` nearest neighbours, excluding itself. The returned value
    is the correlation between projection and outcome.
    """
    x = as_series(series)
    vectors, times = time_delay_embed(x, dimension, lag)

    # A vector can only be scored if its own future is inside the series.
    scorable = times + horizon < x.size
    vectors, times = vectors[scorable], times[scorable]
    if times.size < dimension + 3:
        raise ValueError(
            f"only {times.size} usable state(s) at dimension={dimension}; "
            "the series is too short to score this embedding"
        )

    distances, positions = nearest_neighbours(
        library_vectors=vectors,
        library_times=times,
        query_vectors=vectors,
        query_times=times,
        k=dimension + 1,
        exclusion_radius=exclusion_radius,
    )

    weights = simplex_weights(distances)
    neighbour_outcomes = x[times[positions] + horizon]
    predictions = np.einsum("ij,ij->i", weights, neighbour_outcomes)
    return pearson(predictions, x[times + horizon])


def scan_dimensions(
    series,
    dimensions=range(1, 11),
    lag: int = 1,
    horizon: int = 1,
    exclusion_radius: int = 0,
) -> DimensionScan:
    """Score every candidate embedding dimension, lowest to highest.

    Dimensions the series is too short to score are skipped rather than
    reported as zero skill, so a scan never recommends a dimension it could
    not actually measure.
    """
    scored: list[tuple[int, float]] = []
    for dimension in sorted(set(int(d) for d in dimensions)):
        try:
            rho = simplex_forecast_skill(
                series, dimension, lag, horizon, exclusion_radius
            )
        except ValueError:
            continue
        scored.append((dimension, rho))

    if not scored:
        raise ValueError("no candidate dimension could be scored on this series")

    return DimensionScan(
        dimensions=tuple(d for d, _ in scored),
        rho=tuple(r for _, r in scored),
        lag=lag,
        horizon=horizon,
    )


def embeddability(
    series,
    dimension: int | None = None,
    lag: int = 1,
    horizon: int = 1,
    exclusion_radius: int = 0,
) -> float:
    """How well a series predicts its own future from its own manifold.

    Cross mapping can only recover a signal from a series whose states carry
    information about their own future. Measured on white noise this is zero,
    and a cross map against such a series returns a low rho whatever the true
    coupling — a missed detection that looks exactly like an absence of
    causality. Reporting this number alongside a result is what separates
    "no evidence of a link" from "this test had no power to find one".

    The honest limit: a strongly autocorrelated *stochastic* series — an AR(1)
    with phi near 1, the shape of most financial data — also scores high here,
    because it genuinely is predictable from its own past. So this measures
    predictability, not determinism, and it cannot stand in for the assumption
    that an attractor exists. The surrogate null is what catches that case;
    this one catches only the absence of power.

    With ``dimension`` left as None the best score over a dimension scan is
    returned, which is the series' predictability at its own best embedding.
    """
    if dimension is None:
        scan = scan_dimensions(
            series, lag=lag, horizon=horizon, exclusion_radius=exclusion_radius
        )
        return max(scan.rho)
    return simplex_forecast_skill(series, dimension, lag, horizon, exclusion_radius)
