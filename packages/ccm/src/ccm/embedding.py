"""Time-delay embedding and the neighbour search every predictor here shares.

The search is brute force in numpy. That is a choice, not an oversight: a
KD-tree would mean a scipy dependency in the indicator venv, and the library
sizes a daily price or indicator series reaches (a few thousand points) are
small enough that the pairwise distance matrix, computed in chunks, costs less
than the tree would.
"""
from __future__ import annotations

import numpy as np


def as_series(values, name: str = "series") -> np.ndarray:
    """Coerce to a 1-D float array, refusing anything with gaps.

    A non-finite value is rejected rather than dropped. Dropping would change
    the time spacing underneath the delay vectors without saying so, and an
    embedding whose coordinates are no longer separated by a constant lag is
    not reconstructing the attractor it claims to.
    """
    array = np.asarray(values, dtype=float).ravel()
    if array.ndim != 1:
        raise ValueError(f"{name} must be one-dimensional")
    if array.size == 0:
        raise ValueError(f"{name} is empty")
    if not np.all(np.isfinite(array)):
        bad = int(np.count_nonzero(~np.isfinite(array)))
        raise ValueError(
            f"{name} holds {bad} non-finite value(s); fill or trim them before "
            "embedding, since dropping them here would break the lag spacing"
        )
    return array


def time_delay_embed(
    series,
    dimension: int,
    lag: int = 1,
) -> tuple[np.ndarray, np.ndarray]:
    """Reconstruct a shadow manifold by delay coordinates.

    Returns ``(vectors, times)`` where ``vectors[i]`` is the delay vector whose
    most recent coordinate is ``series[times[i]]``:

        vectors[i] = (x[t], x[t - lag], ..., x[t - (dimension - 1) * lag])

    The first ``(dimension - 1) * lag`` points of the series have no complete
    vector and are absent from ``times``.
    """
    x = as_series(series)
    if dimension < 1:
        raise ValueError("dimension must be at least 1")
    if lag < 1:
        raise ValueError("lag must be at least 1")

    span = (dimension - 1) * lag
    if x.size <= span:
        raise ValueError(
            f"series of length {x.size} is too short for dimension={dimension} "
            f"and lag={lag}, which needs more than {span} points"
        )

    times = np.arange(span, x.size)
    vectors = np.empty((times.size, dimension), dtype=float)
    for column in range(dimension):
        vectors[:, column] = x[times - column * lag]
    return vectors, times


def nearest_neighbours(
    library_vectors: np.ndarray,
    library_times: np.ndarray,
    query_vectors: np.ndarray,
    query_times: np.ndarray,
    k: int,
    exclusion_radius: int = 0,
    chunk: int = 256,
) -> tuple[np.ndarray, np.ndarray]:
    """Find the ``k`` nearest library vectors for each query vector.

    ``exclusion_radius`` is a Theiler window applied in the time index, not in
    the state space: any library point within that many steps of the query is
    ignored. A radius of 0 still excludes the query's own time, so a point is
    never its own neighbour. Raising it is how an autocorrelated series is kept
    from scoring well by predicting itself from its own immediate past.

    Returns ``(distances, positions)``, both shaped ``(n_queries, k)``, where
    ``positions`` indexes into ``library_vectors``.
    """
    if k < 1:
        raise ValueError("k must be at least 1")
    if library_vectors.shape[0] != library_times.shape[0]:
        raise ValueError("library_vectors and library_times disagree in length")
    if query_vectors.shape[0] != query_times.shape[0]:
        raise ValueError("query_vectors and query_times disagree in length")
    if library_vectors.shape[1] != query_vectors.shape[1]:
        raise ValueError("library and query vectors have different dimensions")

    n_queries = query_vectors.shape[0]
    distances = np.empty((n_queries, k), dtype=float)
    positions = np.empty((n_queries, k), dtype=np.intp)

    for start in range(0, n_queries, chunk):
        stop = min(start + chunk, n_queries)
        block = query_vectors[start:stop]

        # (block, library) pairwise Euclidean distance.
        diff = block[:, None, :] - library_vectors[None, :, :]
        block_distances = np.sqrt(np.einsum("ijk,ijk->ij", diff, diff))

        too_close_in_time = (
            np.abs(query_times[start:stop, None] - library_times[None, :])
            <= exclusion_radius
        )
        block_distances[too_close_in_time] = np.inf

        usable = np.count_nonzero(np.isfinite(block_distances), axis=1)
        if np.any(usable < k):
            shortfall = int(usable.min())
            raise ValueError(
                f"a query has only {shortfall} library point(s) outside the "
                f"exclusion window but {k} are needed; shrink exclusion_radius "
                "or lengthen the library"
            )

        picked = np.argpartition(block_distances, k - 1, axis=1)[:, :k]
        picked_distances = np.take_along_axis(block_distances, picked, axis=1)
        order = np.argsort(picked_distances, axis=1)

        positions[start:stop] = np.take_along_axis(picked, order, axis=1)
        distances[start:stop] = np.take_along_axis(picked_distances, order, axis=1)

    return distances, positions


def simplex_weights(distances: np.ndarray) -> np.ndarray:
    """Exponential neighbour weights, ``exp(-d / d_nearest)``, normalised.

    When the nearest distance is zero the query sits exactly on one or more
    library points; weight is then spread over those alone, because dividing by
    the nearest distance is undefined and the exact matches are the whole of
    the local information anyway.
    """
    nearest = distances[:, :1]
    weights = np.empty_like(distances)

    degenerate = (nearest <= 0).ravel()
    if np.any(~degenerate):
        rows = ~degenerate
        weights[rows] = np.exp(-distances[rows] / nearest[rows])
    if np.any(degenerate):
        rows = degenerate
        exact = distances[rows] <= 0
        weights[rows] = exact.astype(float)

    totals = weights.sum(axis=1, keepdims=True)
    # A row of all-zero weights cannot happen: either some distance is finite
    # and positive, or an exact match set the indicator above.
    return weights / totals


def pearson(a: np.ndarray, b: np.ndarray) -> float:
    """Pearson correlation, returning 0.0 when either side has no variance.

    A constant prediction carries no skill, and that is the honest reading of
    an undefined correlation here, so it is reported as zero rather than NaN.
    """
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    keep = np.isfinite(a) & np.isfinite(b)
    if np.count_nonzero(keep) < 3:
        return 0.0
    a = a[keep] - a[keep].mean()
    b = b[keep] - b[keep].mean()
    denominator = np.sqrt((a * a).sum() * (b * b).sum())
    if denominator <= 0:
        return 0.0
    return float((a * b).sum() / denominator)
