"""Convergent cross mapping for time series.

Pure numpy, no subprocesses and no network access, so the whole package is
importable from user-authored Python running under the host's audit-hook
sandbox.

Quick use::

    from ccm import ccm

    result = ccm(manifold=returns_b, target=returns_a,
                 manifold_label="B", target_label="A")
    print(result.summary())
    if result.supports_causality():
        ...  # A drives B

``__version__`` is part of the contract: anything that caches a value computed
here must put it in the cache key, or an upgrade will serve stale numbers.
"""
from __future__ import annotations

__version__ = "0.3.0"

from .crossmap import (
    DEFAULT_MIN_EMBEDDABILITY,
    LEAKAGE_GAP_THRESHOLD,
    CcmResult,
    UnembeddableManifold,
    ccm,
    cross_map_skill,
    default_library_sizes,
)
from .embedding import nearest_neighbours, pearson, time_delay_embed
from .simplex import (
    DimensionScan,
    embeddability,
    scan_dimensions,
    simplex_forecast_skill,
)
from .surrogate import ebisuzaki_surrogate, surrogate_p_value

__all__ = [
    "__version__",
    "DEFAULT_MIN_EMBEDDABILITY",
    "LEAKAGE_GAP_THRESHOLD",
    "CcmResult",
    "DimensionScan",
    "UnembeddableManifold",
    "ccm",
    "cross_map_skill",
    "default_library_sizes",
    "ebisuzaki_surrogate",
    "embeddability",
    "nearest_neighbours",
    "pearson",
    "scan_dimensions",
    "simplex_forecast_skill",
    "surrogate_p_value",
    "time_delay_embed",
]
