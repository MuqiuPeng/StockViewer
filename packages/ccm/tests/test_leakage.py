"""The leakage diagnostic, and the evidence for where its threshold sits.

``excess_skill`` is ``rho - embeddability(target)``: how far cross mapping
beats the target at predicting itself. Under CCM's premises it cannot be much
above zero, so a large positive value is evidence against the premises — the
manifold holds the target by construction rather than sharing a system with it.

These tests are the calibration behind ``LEAKAGE_GAP_THRESHOLD``, kept as
tests so the threshold cannot be edited without the numbers that justify it
being re-run. Six classes, each with a known answer:

    A  deterministic coupling              causal, excess at or below 0
    B  functional leakage onto returns     leakage, excess from +0.568 up
    C  real but stochastic driver          causal, excess below 0
    D  unrelated series                    nothing, rejected by the gates
    E  leakage onto a predictable target   leakage the diagnostic cannot see
    F  real coupling, noise-corrupted      causal, excess up to +0.382

B's floor and F's ceiling are what fix the threshold, and both were swept
across seeds rather than read off one run — a single realisation put F's peak
at +0.333 and overstated the margin. Nothing here is market data: the whole
0.187-wide margin is synthetic, and B's floor is the weakest leak that was
*constructed*, not a bound on how weak real leakage can be.

The runs are deliberately not cheap — each builds a convergence curve and a
surrogate null at the same settings the numbers above were measured at, so the
file takes roughly half a minute.
"""
import numpy as np
import pytest

from ccm import CcmResult, LEAKAGE_GAP_THRESHOLD, ccm
from ccm.systems import ar1, coupled_logistic, independent_logistic

N = 1500
TRIM = 60  # drop the transient the rolling windows leave behind
E = 3
SIZES = (5, 300, 700, 1000, 1350)
SEED = 20260101


def run(manifold, target, **labels):
    return ccm(
        manifold=manifold, target=target, dimension=E,
        library_sizes=SIZES, n_draws=10, n_surrogates=30,
        rng=np.random.default_rng(SEED), **labels,
    )


# ---- generators for the cases the package's own systems module lacks -------

def logistic(n, r=3.9, x0=0.5):
    out = np.empty(n)
    out[0] = x0
    for t in range(n - 1):
        out[t + 1] = r * out[t] * (1 - out[t])
    return out


def random_walk(n, seed):
    """Returns and the price path they generate. No causality anywhere in it."""
    rng = np.random.default_rng(seed)
    returns = rng.normal(0.0, 0.015, n)
    return returns, 100 * np.exp(np.cumsum(returns))


def moving_average_gap(close, window=20):
    kernel = np.ones(window) / window
    return close[window - 1:] / np.convolve(close, kernel, mode="valid") - 1


def rolling_z(close, window=20):
    out = np.full(close.size, np.nan)
    for t in range(window, close.size):
        past = close[t - window:t]
        out[t] = (close[t] - past.mean()) / (past.std() + 1e-12)
    return out


def modulated_logistic(driver, base_r=3.7, amplitude=0.1):
    """A logistic map whose growth rate a *real* external series drives.

    The class that decides whether the diagnostic is usable: genuine forcing
    by something stochastic. If it looked like leakage, the measure could not
    tell the two apart and would have to be dropped.
    """
    standardised = (driver - driver.mean()) / driver.std()
    r = np.clip(base_r + amplitude * standardised, 3.2, 3.95)
    out = np.empty(driver.size)
    out[0] = 0.4
    for t in range(driver.size - 1):
        out[t + 1] = r[t] * out[t] * (1 - out[t])
    return out


# ---- A: deterministic coupling --------------------------------------------

def test_a_real_coupling_shows_no_excess_skill():
    x, y = coupled_logistic(N, effect_of_y_on_x=0.0, effect_of_x_on_y=0.1)

    result = run(y[TRIM:], x[TRIM:], manifold_label="Y", target_label="X")

    assert result.supports_causality(), result.summary()
    # X predicts itself perfectly, and cross mapping cannot beat that.
    assert result.excess_skill < 0.0
    assert not result.leakage_suspected


# ---- B: functional leakage onto returns -----------------------------------

@pytest.mark.parametrize("indicator_name", ["ma_gap", "rolling_z"])
def test_an_indicator_against_its_own_returns_is_flagged(indicator_name):
    """The case the three gates cannot catch, which this one can.

    No causality exists — the underlying series is a random walk — and CCM
    reports convergent, significant skill anyway. The diagnostic is the only
    thing in the package that objects.
    """
    returns, close = random_walk(N, seed=1)
    indicator = (
        moving_average_gap(close) if indicator_name == "ma_gap"
        else rolling_z(close)[40:]
    )
    aligned = returns[-indicator.size:]
    keep = np.isfinite(indicator)

    result = run(indicator[keep][TRIM:], aligned[keep][TRIM:],
                 manifold_label=indicator_name, target_label="returns")

    assert result.supports_causality(), "the gates are expected to be fooled here"
    assert result.excess_skill > 0.8
    assert result.leakage_suspected
    assert "leakage suspected" in result.summary()


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_the_weakest_leakage_case_still_clears_the_threshold(seed):
    """The floor of the leakage band, and half the case for the threshold.

    A 10-bar mean of the returns leaks far less than a price-derived indicator
    does — rho lands near 0.6 rather than 0.97 — so this is the smallest
    excess any leakage case produced across the calibration: +0.568 to +0.575
    over three seeds, against a threshold of 0.5.
    """
    returns, _ = random_walk(N, seed=seed)
    smoothed = np.convolve(returns, np.ones(10) / 10, mode="valid")
    aligned = returns[-smoothed.size:]

    result = run(smoothed[TRIM:], aligned[TRIM:],
                 manifold_label="smoothed", target_label="returns")

    assert result.leakage_suspected, result.summary()
    assert 0.55 < result.excess_skill < 0.62


# ---- C: a real driver that happens to be stochastic -----------------------

def test_legitimate_stochastic_forcing_is_not_flagged():
    """The class that would have killed the measure, and did not.

    An AR(1) series genuinely drives the growth rate of a logistic map. CCM
    finds it, and the excess stays negative: a real driver's signature arrives
    degraded, so it cannot outrun the target's own memory.
    """
    rng = np.random.default_rng(11)
    driver = ar1(N, phi=0.8, rng=rng)
    driven = modulated_logistic(driver)

    result = run(driven[TRIM:], driver[TRIM:],
                 manifold_label="driven", target_label="AR1 driver")

    assert result.supports_causality(), result.summary()
    assert result.excess_skill < 0.0
    assert not result.leakage_suspected


def test_a_white_noise_driver_is_rejected_for_want_of_power_not_flagged():
    """Real forcing the gates miss. The diagnostic adds nothing either way."""
    rng = np.random.default_rng(11)
    driver = rng.normal(size=N)
    driven = modulated_logistic(driver)

    result = run(driven[TRIM:], driver[TRIM:])

    assert not result.supports_causality(), result.summary()
    assert not result.leakage_suspected


# ---- D: unrelated series ---------------------------------------------------

def test_unrelated_series_are_rejected_and_not_flagged():
    a, b = independent_logistic(N)

    result = run(a[TRIM:], b[TRIM:])

    assert not result.supports_causality(), result.summary()
    assert result.excess_skill < 0.0
    assert not result.leakage_suspected


# ---- E: the blind spot -----------------------------------------------------

@pytest.mark.parametrize("name,transform", [
    ("smoothed", lambda s: np.convolve(s, np.ones(3) / 3, mode="valid")),
    ("lagged", lambda s: np.roll(s, 1)),
])
def test_leakage_onto_a_predictable_target_is_invisible(name, transform):
    """The diagnostic's own blind spot, pinned so it stays documented.

    Same structural error as class B — the manifold is a function of the
    target — but the target is a deterministic map that predicts itself
    perfectly. There is no room above it for the excess to show, so every
    check in the package passes a pairing that contains no causality.

    This is why ``leakage_suspected`` is reported beside the verdict rather
    than folded into it: a quiet diagnostic is not a clean bill of health.
    """
    target = logistic(N)
    manifold = transform(target)
    aligned = target[-manifold.size:]

    result = run(manifold[TRIM:], aligned[TRIM:],
                 manifold_label=name, target_label="logistic")

    assert result.supports_causality(), result.summary()
    assert abs(result.excess_skill) < 0.05
    assert not result.leakage_suspected, (
        "if this starts failing, the diagnostic grew teeth it is not "
        "documented as having and the docstring should stop claiming blindness"
    )


def test_an_exact_transform_is_caught_by_convergence_instead():
    """Not the diagnostic's doing, but worth knowing it holds.

    A pointwise invertible transform gives rho = 1.000 at *every* library
    size, so delta_rho is zero and the convergence gate rejects it. Perfect
    leakage gives itself away; the partial kind in class E does not.
    """
    target = logistic(N)
    manifold = np.tanh(4 * (target - 0.5))

    result = run(manifold[TRIM:], target[TRIM:])

    assert result.rho > 0.999
    assert not result.converged()
    assert not result.supports_causality(), result.summary()


# ---- F: the ceiling on legitimate excess ----------------------------------

@pytest.mark.parametrize("noise_ratio,noise_seed,expected", [
    (0.5, 5, 0.197),
    (1.0, 5, 0.376),
    (1.25, 41, 0.382),   # the worst case found across ratios 0.75-1.25, 4 seeds
])
def test_observation_noise_on_the_target_lifts_excess_but_not_past_the_threshold(
    noise_ratio, noise_seed, expected
):
    """The ceiling on legitimate excess, and half the case for the threshold.

    X genuinely drives Y, and X is then observed through additive noise. Self
    prediction pays for that noise twice — dirty delay vectors predicting a
    dirty outcome — while cross mapping pays once, from a clean manifold. So a
    *real* coupling drifts upward into the leakage region from below, peaking
    where the noise is roughly the size of the signal and falling away again
    once rho itself collapses.

    The peak of +0.382 is what rules out the 0.3 threshold this started at. It
    came from sweeping ratios 0.75 to 1.25 over four noise seeds; the single
    run first used for this said +0.333, which is why the sweep exists.
    """
    x, y = coupled_logistic(N, effect_of_y_on_x=0.0, effect_of_x_on_y=0.1)
    rng = np.random.default_rng(noise_seed)
    observed_x = x + rng.normal(0.0, noise_ratio * x.std(), N)

    result = run(y[TRIM:], observed_x[TRIM:],
                 manifold_label="Y", target_label="noisy X")

    assert result.supports_causality(), result.summary()
    assert result.excess_skill == pytest.approx(expected, abs=0.02), result.summary()
    assert not result.leakage_suspected


def test_the_threshold_sits_between_the_two_measured_bands():
    """The arithmetic the other tests in this file supply the inputs for.

    Asserted rather than left in a comment so that moving the threshold
    outside the measured gap fails here instead of silently changing what the
    diagnostic means.
    """
    worst_legitimate = 0.382   # class F, ratio 1.25, noise seed 41
    weakest_leakage = 0.568    # class B, smoothed returns, seed 3

    assert worst_legitimate < LEAKAGE_GAP_THRESHOLD < weakest_leakage
    # Not jammed against either edge: the bands are synthetic, so a threshold
    # sitting a hair under the leakage floor would be false precision.
    assert LEAKAGE_GAP_THRESHOLD - worst_legitimate > 0.05
    assert weakest_leakage - LEAKAGE_GAP_THRESHOLD > 0.05


# ---- the field's own mechanics, without paying for a cross map ------------

def _result(rho, target_embeddability, manifold_embeddability=0.9):
    """A CcmResult built by hand, to test the arithmetic and not the estimator."""
    return CcmResult(
        manifold_label="M", target_label="T", dimension=3, lag=1,
        exclusion_radius=0, library_sizes=(10, 100), rho_mean=(0.1, rho),
        rho_std=(0.0, 0.0), n_draws=1, p_value=0.01, n_surrogates=100,
        manifold_embeddability=manifold_embeddability,
        target_embeddability=target_embeddability, min_embeddability=0.1,
    )


def test_excess_skill_is_rho_minus_the_targets_own_predictability():
    assert _result(0.9, 0.2).excess_skill == pytest.approx(0.7)
    assert _result(0.4, 0.9).excess_skill == pytest.approx(-0.5)


def test_a_powerless_result_does_not_claim_leakage_in_its_summary():
    """Without power, rho is not interpretable and nor is its distance from
    anything. The flag stays out of the string rather than offering a second
    uninterpretable number alongside the first."""
    powerless = _result(0.95, 0.0, manifold_embeddability=0.02)

    assert not powerless.had_power
    assert powerless.leakage_suspected          # the arithmetic still holds
    assert "leakage suspected" not in powerless.summary()
    assert "no power" in powerless.summary()
