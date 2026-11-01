"""Phase-randomised surrogates, the null hypothesis cross mapping is tested against.

A cross-map correlation on its own says nothing. Two series with similar
autocorrelation structure — which any two price series have — embed into each
other well enough to produce a high rho with no causal link at all. The null
that matters is therefore not "unrelated noise" but "same power spectrum,
scrambled dynamics", and that is what Ebisuzaki surrogates provide: identical
autocorrelation, identical variance, randomised phases.
"""
from __future__ import annotations

import numpy as np

from .embedding import as_series


def ebisuzaki_surrogate(series, rng: np.random.Generator) -> np.ndarray:
    """One phase-randomised surrogate preserving the series' power spectrum.

    The mean is held out and restored, the DC term keeps its phase, and for an
    even-length series the Nyquist term may only flip sign — both are real by
    construction, and giving either an arbitrary phase would make the inverse
    transform complex.
    """
    x = as_series(series)
    n = x.size
    if n < 4:
        raise ValueError("a surrogate needs at least 4 points")

    mean = x.mean()
    spectrum = np.fft.rfft(x - mean)
    amplitude = np.abs(spectrum)

    phases = rng.uniform(0.0, 2.0 * np.pi, size=spectrum.size)
    phases[0] = 0.0
    if n % 2 == 0:
        phases[-1] = 0.0 if rng.random() < 0.5 else np.pi

    randomised = amplitude * np.exp(1j * phases)
    surrogate = np.fft.irfft(randomised, n)

    # irfft spreads the original power over the new phases, so the variance is
    # preserved only in expectation. Rescaling makes it exact, which keeps a
    # surrogate from scoring differently merely for being flatter.
    spread = surrogate.std()
    if spread > 0:
        surrogate = surrogate * (x.std() / spread)
    return surrogate + mean


def surrogate_p_value(observed: float, surrogate_scores) -> float:
    """One-sided p-value: how often the null reached the observed skill.

    Uses the ``(1 + hits) / (1 + n)`` convention, so a p-value is never
    reported as exactly zero. 100 surrogates cannot evidence anything below
    about 0.01, and claiming otherwise would overstate what was run.
    """
    scores = np.asarray(list(surrogate_scores), dtype=float)
    if scores.size == 0:
        raise ValueError("no surrogate scores were supplied")
    hits = int(np.count_nonzero(scores >= observed))
    return (1.0 + hits) / (1.0 + scores.size)
