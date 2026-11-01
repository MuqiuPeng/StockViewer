"""Systems whose causal structure is known, for calibrating against ground truth.

These exist so an implementation and a parameter choice can be checked against
an answer that is not in doubt before either is pointed at market data, where
nobody knows the answer. The coupled logistic map is the system CCM was
introduced with.
"""
from __future__ import annotations

import numpy as np


def coupled_logistic(
    n: int,
    r_x: float = 3.8,
    r_y: float = 3.5,
    effect_of_y_on_x: float = 0.0,
    effect_of_x_on_y: float = 0.1,
    x0: float = 0.4,
    y0: float = 0.2,
    burn_in: int = 500,
) -> tuple[np.ndarray, np.ndarray]:
    """Two logistic maps coupled with independently settable strengths.

        x[t+1] = x[t] * (r_x - r_x * x[t] - effect_of_y_on_x * y[t])
        y[t+1] = y[t] * (r_y - r_y * y[t] - effect_of_x_on_y * x[t])

    The defaults make X drive Y and nothing drive X, so cross mapping from Y's
    manifold to X should converge while the reverse direction should not.

    Raises if the orbit leaves the unit interval, which is what a coupling
    strength too large for these growth rates does — better a refusal than a
    diverged series that silently tests nothing.
    """
    if n < 1:
        raise ValueError("n must be positive")
    total = n + burn_in
    x = np.empty(total, dtype=float)
    y = np.empty(total, dtype=float)
    x[0], y[0] = x0, y0

    for t in range(total - 1):
        x[t + 1] = x[t] * (r_x - r_x * x[t] - effect_of_y_on_x * y[t])
        y[t + 1] = y[t] * (r_y - r_y * y[t] - effect_of_x_on_y * x[t])
        if not (0.0 < x[t + 1] < 1.0 and 0.0 < y[t + 1] < 1.0):
            raise ValueError(
                f"the orbit left the unit interval at step {t + 1}; lower the "
                "coupling strengths or the growth rates"
            )

    return x[burn_in:], y[burn_in:]


def independent_logistic(
    n: int,
    r_x: float = 3.8,
    r_y: float = 3.7,
    x0: float = 0.4,
    y0: float = 0.7,
    burn_in: int = 500,
) -> tuple[np.ndarray, np.ndarray]:
    """Two uncoupled chaotic series: the case a test must report as no causality."""
    return coupled_logistic(
        n,
        r_x=r_x,
        r_y=r_y,
        effect_of_y_on_x=0.0,
        effect_of_x_on_y=0.0,
        x0=x0,
        y0=y0,
        burn_in=burn_in,
    )


def ar1(
    n: int,
    phi: float = 0.9,
    sigma: float = 1.0,
    rng: np.random.Generator | None = None,
    burn_in: int = 500,
) -> np.ndarray:
    """A strongly autocorrelated stochastic series.

    Not a dynamical system at all, which is the point: it is the shape of
    series that produces high cross-map skill with no causality, and so the
    case the surrogate null has to catch.
    """
    rng = np.random.default_rng() if rng is None else rng
    total = n + burn_in
    noise = rng.normal(0.0, sigma, size=total)
    out = np.empty(total, dtype=float)
    out[0] = noise[0]
    for t in range(1, total):
        out[t] = phi * out[t - 1] + noise[t]
    return out[burn_in:]
