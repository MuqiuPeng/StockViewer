"""The power gate, and the one failure it deliberately does not fix."""
import numpy as np
import pytest

from ccm import ccm, embeddability
from ccm.crossmap import UnembeddableManifold
from ccm.systems import ar1, coupled_logistic

SEED = 20260101


def random_walk_returns(n, seed=SEED):
    rng = np.random.default_rng(seed)
    return rng.normal(0.0, 0.015, n)


def moving_average_gap(returns, window=20):
    """An indicator in the shape of the real ones: a smooth function of the price
    series it is computed from."""
    close = 100 * np.exp(np.cumsum(returns))
    kernel = np.ones(window) / window
    average = np.convolve(close, kernel, mode="valid")
    return close[window - 1:] / average - 1


def test_a_deterministic_map_is_highly_embeddable():
    x, _ = coupled_logistic(800)

    assert embeddability(x, dimension=3) > 0.9


def test_white_noise_is_not_embeddable():
    assert embeddability(random_walk_returns(800), dimension=3) < 0.1


def test_an_autocorrelated_stochastic_series_passes_the_gate():
    """The gate's blind spot, asserted so it stays documented.

    An AR(1) is predictable from its own past without being a dynamical
    system, so it scores high here. Catching that case is the surrogate null's
    job, not this one's.
    """
    series = ar1(800, phi=0.95, rng=np.random.default_rng(SEED))

    assert embeddability(series, dimension=3) > 0.5


def test_cross_mapping_onto_returns_is_refused():
    returns = random_walk_returns(800)
    driver, _ = coupled_logistic(800)

    with pytest.raises(UnembeddableManifold) as raised:
        ccm(manifold=returns, target=driver, dimension=3, n_surrogates=1,
            rng=np.random.default_rng(SEED))

    assert raised.value.measured < 0.1
    assert raised.value.required == 0.1
    assert "noise-dominated" in str(raised.value)


def test_the_gate_can_be_switched_off_but_the_result_says_so():
    returns = random_walk_returns(800)
    driver, _ = coupled_logistic(800)

    result = ccm(manifold=returns, target=driver, dimension=3, n_surrogates=20,
                 min_embeddability=0.0, rng=np.random.default_rng(SEED))

    assert not result.had_power
    assert not result.supports_causality()
    assert "no power" in result.summary()


def test_a_real_coupling_still_passes_the_gate():
    x, y = coupled_logistic(800, effect_of_y_on_x=0.0, effect_of_x_on_y=0.1)

    result = ccm(manifold=y, target=x, dimension=3, n_surrogates=50,
                 rng=np.random.default_rng(SEED))

    assert result.had_power
    assert result.manifold_embeddability > 0.9
    assert result.supports_causality()


def test_an_indicator_against_its_own_price_series_is_not_caught():
    """The documented limitation, pinned.

    The underlying series is a pure random walk, so there is no causality to
    find. The indicator is nonetheless smooth and so passes the power gate,
    and cross mapping reports the functional relationship as convergent
    causality. No statistic in this package detects this; the caller has to not
    make the pairing.
    """
    returns = random_walk_returns(1200)
    indicator = moving_average_gap(returns)
    aligned_returns = returns[-len(indicator):]

    result = ccm(manifold=indicator, target=aligned_returns, dimension=3,
                 n_surrogates=50, manifold_label="MAgap",
                 target_label="returns", rng=np.random.default_rng(SEED))

    assert result.had_power
    assert result.rho > 0.9
    assert result.supports_causality(), (
        "if this ever starts failing, something in the package began detecting "
        "the same-attractor case and the README should stop saying it cannot"
    )
