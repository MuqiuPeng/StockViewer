"""Convergent cross mapping.

Read the direction carefully, because it inverts and this is the single most
common way a CCM result gets reported backwards:

    cross-mapping from A's manifold to B means using states of A to predict B.
    It succeeds when information about B is present in A's attractor, and B
    leaves its signature in A only if B drives A.

    high, converging skill for "A xmap B"  =>  B causes A.

Skill alone is not evidence. Two series with similar autocorrelation embed into
each other well, so a single rho is expected to be high between any two price
series. What distinguishes causation here is *convergence* — skill rising as
more of the attractor is filled in — and separation from a phase-randomised
null. ``ccm()`` therefore refuses to return a result without both.

A third check guards the other kind of mistake. Cross mapping recovers nothing
from a manifold whose own states do not predict its own future, and a series
like equity returns is close to that case: coupling of any strength goes
undetected, and the low rho reads as an absence of causality when it is really
an absence of power. ``ccm()`` measures that predictability first and refuses
rather than return an uninterpretable number. See ``min_embeddability``.

What none of the three *gates* catch: pairing a series with something
computed *from* it — an indicator against the prices it was derived from.
Those are two observations of one system, they reconstruct one attractor, and
cross mapping reports strong convergent skill for a random walk. The pairing
still has to be avoided by the caller. ``CcmResult.leakage_suspected`` is a
diagnostic for the common version of it and is deliberately not a gate: it
reads the gap between cross-map skill and the target's own predictability, so
it goes blind exactly when the target is predictable on its own.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .embedding import (
    as_series,
    nearest_neighbours,
    pearson,
    simplex_weights,
    time_delay_embed,
)
from .simplex import embeddability, scan_dimensions
from .surrogate import ebisuzaki_surrogate, surrogate_p_value

__all__ = [
    "DEFAULT_MIN_EMBEDDABILITY",
    "LEAKAGE_GAP_THRESHOLD",
    "CcmResult",
    "UnembeddableManifold",
    "ccm",
    "cross_map_skill",
]

#: Self-prediction skill below which a cross map carries no detectable signal.
#: Both the default refusal threshold and the floor ``had_power`` reads against,
#: so switching the refusal off cannot also switch off the record that there
#: was nothing to find.
DEFAULT_MIN_EMBEDDABILITY = 0.1

#: Excess of cross-map skill over the target's own self-predictability above
#: which ``leakage_suspected`` fires. Calibrated on synthetic runs across six
#: classes (``tests/test_leakage.py``), which bound two bands:
#:
#:   legitimate, worst case   up to +0.382   (a real coupling whose target is
#:                                            seen through observation noise
#:                                            of roughly the signal's size)
#:   functional leakage       from +0.568    (the weakest leak constructed: a
#:                                            10-bar mean of the target)
#:
#: 0.45 sits in that 0.187-wide gap, nearer the middle than the top. Placing it
#: low is the cheaper error for a diagnostic: a false flag costs a second look
#: at a result whose rho was mediocre anyway, while a miss lets an identity be
#: reported as causality. Both bands are synthetic, and the leakage floor is
#: the weakest leak that was *constructed* — real partial leakage can sit
#: below it, which no measurement here bounds.
LEAKAGE_GAP_THRESHOLD = 0.45


class UnembeddableManifold(ValueError):
    """The manifold series is too unpredictable for a cross map to mean anything.

    Carries the measured skill so a caller scanning many pairs can log why a
    pair was skipped instead of recording a false negative.
    """

    def __init__(self, message: str, measured: float, required: float) -> None:
        super().__init__(message)
        self.measured = measured
        self.required = required


@dataclass(frozen=True)
class CcmResult:
    """One direction of a cross-map test, with its convergence and its null.

    ``p_value`` and ``converged`` are fields rather than optional extras on
    purpose: a caller that renders only ``rho`` is reporting a number that is
    high for unrelated series too.
    """

    manifold_label: str
    target_label: str
    dimension: int
    lag: int
    exclusion_radius: int
    library_sizes: tuple[int, ...]
    rho_mean: tuple[float, ...]
    rho_std: tuple[float, ...]
    n_draws: int
    p_value: float
    n_surrogates: int
    manifold_embeddability: float
    target_embeddability: float
    min_embeddability: float
    library_version: str = field(default="")

    @property
    def rho(self) -> float:
        """Skill at the largest library size."""
        return self.rho_mean[-1]

    @property
    def delta_rho(self) -> float:
        """Gain in skill from the smallest library size to the largest."""
        return self.rho_mean[-1] - self.rho_mean[0]

    @property
    def monotonicity(self) -> float:
        """Rank correlation between library size and skill, in [-1, 1]."""
        sizes = np.asarray(self.library_sizes, dtype=float)
        rho = np.asarray(self.rho_mean, dtype=float)
        if sizes.size < 3:
            return 0.0
        return pearson(_ranks(sizes), _ranks(rho))

    def converged(self, tolerance: float = 0.05) -> bool:
        """Whether skill genuinely rises with library size.

        A heuristic, and the curve itself remains the real evidence: skill must
        trend upward in rank, and the total gain must clear both the spread
        across random library draws and an absolute ``tolerance``. The absolute
        floor is there because a tiny but tidy increase is what an
        autocorrelation artefact also looks like.
        """
        spread = max(self.rho_std) if self.rho_std else 0.0
        return (
            self.monotonicity >= 0.5
            and self.delta_rho > max(2.0 * spread, tolerance)
        )

    def significant(self, alpha: float = 0.05) -> bool:
        """Whether the skill beats the phase-randomised null at ``alpha``."""
        return self.p_value <= alpha

    @property
    def had_power(self) -> bool:
        """Whether the manifold was predictable enough for a null result to mean anything.

        False only when the embeddability gate was switched off and the series
        would not have passed it. A False here turns "no causality found" back
        into "nothing could have been found".

        Read against ``DEFAULT_MIN_EMBEDDABILITY`` even when the caller lowered
        the threshold: permission to compute an uninterpretable number is not
        permission to record it as interpretable.
        """
        floor = max(self.min_embeddability, DEFAULT_MIN_EMBEDDABILITY)
        return self.manifold_embeddability >= floor

    @property
    def excess_skill(self) -> float:
        """How far cross-map skill exceeds the target's own self-predictability.

        Under CCM's premises this sits at or below zero. If both series are
        observations of one attractor, the target's own history is the shortest
        route to its future: information reaching the manifold took a longer
        path through the shared dynamics and arrived degraded, never improved.
        A large positive value is therefore evidence against the premise — the
        manifold is holding the target itself, by construction, rather than
        sharing a system with it.
        """
        return self.rho - self.target_embeddability

    @property
    def leakage_suspected(self) -> bool:
        """Whether ``excess_skill`` is large enough to read as functional leakage.

        A diagnostic to read alongside the verdict, not a fourth gate:
        ``supports_causality()`` ignores it on purpose. Two reasons. It is
        one-sided — a quiet gap is no reassurance, because the measure only
        has resolution when the target is hard to predict from its own past,
        so leakage onto a *predictable* target passes with a gap near zero
        (``tests/test_leakage.py`` pins that blind spot). And a real coupling
        whose target is heavily corrupted by observation noise drifts into the
        same region from below, since self-prediction is hurt twice by that
        noise and cross mapping only once.

        Only meaningful when the other gates passed. With no power, ``rho``
        itself is not interpretable, and neither is its distance from anything.
        """
        return self.excess_skill > LEAKAGE_GAP_THRESHOLD

    def supports_causality(self, alpha: float = 0.05, tolerance: float = 0.05) -> bool:
        """Every gate passed, i.e. this direction is worth believing.

        Reads the three gates only. ``leakage_suspected`` is reported beside
        this and never folded into it: it has a blind spot and a false-positive
        region of its own, so a caller has to see the two verdicts separately
        to know which one it is looking at.
        """
        return (
            self.had_power
            and self.converged(tolerance)
            and self.significant(alpha)
        )

    @property
    def implication(self) -> str:
        """The causal claim this direction would support, spelled out."""
        return f"{self.target_label} -> {self.manifold_label}"

    def summary(self) -> str:
        if not self.had_power:
            verdict = "no power (manifold unpredictable)"
        elif self.supports_causality():
            verdict = "supported"
        else:
            verdict = "not supported"
        # Appended rather than folded into the verdict: the diagnostic is a
        # reason to look again, not a different answer.
        leakage = (
            f" [leakage suspected: excess={self.excess_skill:+.2f}]"
            if self.had_power and self.leakage_suspected
            else ""
        )
        return (
            f"{self.manifold_label} xmap {self.target_label}: "
            f"rho={self.rho:.3f} delta={self.delta_rho:+.3f} "
            f"p={self.p_value:.3f} E={self.dimension} tau={self.lag} "
            f"emb={self.manifold_embeddability:.2f}/{self.target_embeddability:.2f} "
            f"-> {self.implication} {verdict}{leakage}"
        )


def _ranks(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="stable")
    ranks = np.empty(values.size, dtype=float)
    ranks[order] = np.arange(values.size, dtype=float)
    return ranks


def _aligned_states(
    manifold,
    target,
    dimension: int,
    lag: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Delay vectors of ``manifold`` and the ``target`` values at the same times."""
    manifold_series = as_series(manifold, "manifold")
    target_series = as_series(target, "target")
    if manifold_series.size != target_series.size:
        raise ValueError(
            f"manifold has {manifold_series.size} points and target has "
            f"{target_series.size}; cross mapping needs them on one time index, "
            "so align and trim before calling"
        )

    vectors, times = time_delay_embed(manifold_series, dimension, lag)
    return vectors, times, target_series


def _skill_from_neighbours(
    weights: np.ndarray,
    neighbour_times: np.ndarray,
    query_times: np.ndarray,
    target: np.ndarray,
) -> float:
    """Weighted-average prediction of ``target`` and its correlation with truth.

    Split out because the neighbour search depends only on the manifold: every
    surrogate of the target reuses one search instead of repeating it.
    """
    predictions = np.einsum("ij,ij->i", weights, target[neighbour_times])
    return pearson(predictions, target[query_times])


def cross_map_skill(
    manifold,
    target,
    dimension: int,
    lag: int = 1,
    library_size: int | None = None,
    n_draws: int = 1,
    exclusion_radius: int = 0,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Cross-map skill of ``manifold``'s states predicting ``target``.

    The low-level primitive: one library size, no convergence test and no null.
    Returns one rho per random library draw. Use it to explore; use ``ccm()``
    for anything that will be reported.
    """
    rng = np.random.default_rng() if rng is None else rng
    vectors, times, target_series = _aligned_states(manifold, target, dimension, lag)

    k = dimension + 1
    n_states = times.size
    if library_size is None:
        library_size = n_states
    if library_size > n_states:
        raise ValueError(
            f"library_size={library_size} exceeds the {n_states} states available"
        )
    if library_size < k + 1:
        raise ValueError(
            f"library_size={library_size} is below the {k + 1} points needed for "
            f"{k} neighbours at dimension={dimension}"
        )

    # With the whole library there is only one subset, so extra draws would be
    # identical work returning identical numbers.
    draws = 1 if library_size == n_states else max(1, n_draws)

    scores = np.empty(draws, dtype=float)
    for draw in range(draws):
        if library_size == n_states:
            chosen = np.arange(n_states)
        else:
            chosen = rng.choice(n_states, size=library_size, replace=False)

        distances, positions = nearest_neighbours(
            library_vectors=vectors[chosen],
            library_times=times[chosen],
            query_vectors=vectors,
            query_times=times,
            k=k,
            exclusion_radius=exclusion_radius,
        )
        weights = simplex_weights(distances)
        scores[draw] = _skill_from_neighbours(
            weights, times[chosen][positions], times, target_series
        )
    return scores


def default_library_sizes(n_states: int, dimension: int, count: int = 8) -> tuple[int, ...]:
    """A spread of library sizes from the smallest usable one up to all states."""
    smallest = dimension + 2
    if n_states <= smallest:
        raise ValueError(
            f"{n_states} states is not enough to build a convergence curve at "
            f"dimension={dimension}"
        )
    sizes = np.unique(
        np.linspace(smallest, n_states, num=max(3, count)).astype(int)
    )
    return tuple(int(s) for s in sizes)


def ccm(
    manifold,
    target,
    dimension: int | None = None,
    lag: int = 1,
    library_sizes=None,
    n_draws: int = 20,
    n_surrogates: int = 100,
    exclusion_radius: int = 0,
    min_embeddability: float = DEFAULT_MIN_EMBEDDABILITY,
    manifold_label: str = "manifold",
    target_label: str = "target",
    rng: np.random.Generator | None = None,
) -> CcmResult:
    """Test whether ``target`` drives ``manifold``, with convergence and a null.

    ``dimension`` is chosen by simplex projection on the manifold series when
    left as None, since that is the series being embedded.

    ``n_surrogates`` must be at least 1. A cross-map skill without a null is
    not interpretable, and making it skippable here would put the decision in
    whichever caller is in the most of a hurry. Reach for ``cross_map_skill``
    when exploring instead.

    ``min_embeddability`` raises ``UnembeddableManifold`` when the manifold
    series cannot predict its own future that well, because a cross map
    against such a series misses couplings of any strength. The default of 0.1
    is a floor rather than a blessing: just above it, power is still poor.
    Setting it to 0.0 disables the refusal, and the result then reports
    ``had_power`` as False so the distinction survives into whatever reads it.
    """
    if n_surrogates < 1:
        raise ValueError(
            "n_surrogates must be at least 1: cross-map skill is high between "
            "unrelated series too, so a result without its null cannot be read. "
            "Use cross_map_skill() for raw exploration."
        )
    rng = np.random.default_rng() if rng is None else rng

    if dimension is None:
        dimension = scan_dimensions(
            manifold, lag=lag, exclusion_radius=exclusion_radius
        ).best

    vectors, times, target_series = _aligned_states(manifold, target, dimension, lag)
    n_states = times.size

    # Measured at the dimension the cross map will actually use, so the number
    # describes this run rather than some best case.
    manifold_skill = embeddability(
        manifold, dimension=dimension, lag=lag, exclusion_radius=exclusion_radius
    )
    target_skill = embeddability(
        target, dimension=dimension, lag=lag, exclusion_radius=exclusion_radius
    )
    if manifold_skill < min_embeddability:
        raise UnembeddableManifold(
            f"{manifold_label} predicts its own future with skill "
            f"{manifold_skill:.3f}, below the {min_embeddability:.3f} required. "
            "A cross map against a series this unpredictable misses couplings "
            "of any strength, so a low rho here would say nothing about "
            f"whether {target_label} drives it. Returns and other "
            "noise-dominated series land here. Pass min_embeddability=0.0 to "
            "proceed anyway; the result will report had_power as False.",
            measured=manifold_skill,
            required=min_embeddability,
        )

    sizes = (
        default_library_sizes(n_states, dimension)
        if library_sizes is None
        else tuple(sorted(set(int(s) for s in library_sizes)))
    )

    rho_mean: list[float] = []
    rho_std: list[float] = []
    for size in sizes:
        scores = cross_map_skill(
            manifold,
            target,
            dimension=dimension,
            lag=lag,
            library_size=size,
            n_draws=n_draws,
            exclusion_radius=exclusion_radius,
            rng=rng,
        )
        rho_mean.append(float(scores.mean()))
        rho_std.append(float(scores.std()))

    # The null randomises the target, never the manifold, so one neighbour
    # search at the full library serves every surrogate.
    distances, positions = nearest_neighbours(
        library_vectors=vectors,
        library_times=times,
        query_vectors=vectors,
        query_times=times,
        k=dimension + 1,
        exclusion_radius=exclusion_radius,
    )
    weights = simplex_weights(distances)
    neighbour_times = times[positions]

    observed = _skill_from_neighbours(weights, neighbour_times, times, target_series)
    null_scores = [
        _skill_from_neighbours(
            weights,
            neighbour_times,
            times,
            ebisuzaki_surrogate(target_series, rng),
        )
        for _ in range(n_surrogates)
    ]

    from . import __version__

    return CcmResult(
        manifold_label=manifold_label,
        target_label=target_label,
        dimension=dimension,
        lag=lag,
        exclusion_radius=exclusion_radius,
        library_sizes=sizes,
        rho_mean=tuple(rho_mean),
        rho_std=tuple(rho_std),
        n_draws=n_draws,
        p_value=surrogate_p_value(observed, null_scores),
        n_surrogates=n_surrogates,
        manifold_embeddability=manifold_skill,
        target_embeddability=target_skill,
        min_embeddability=min_embeddability,
        library_version=__version__,
    )
