import numpy as np
import pytest

from ccm.surrogate import ebisuzaki_surrogate, surrogate_p_value
from ccm.systems import ar1


@pytest.mark.parametrize("n", [256, 257])
def test_surrogate_preserves_the_power_spectrum(n):
    rng = np.random.default_rng(2)
    series = ar1(n, rng=rng)

    surrogate = ebisuzaki_surrogate(series, rng)

    original = np.abs(np.fft.rfft(series - series.mean()))
    shuffled = np.abs(np.fft.rfft(surrogate - surrogate.mean()))
    assert np.allclose(original, shuffled, rtol=1e-6, atol=1e-6)


def test_surrogate_preserves_mean_and_variance():
    rng = np.random.default_rng(3)
    series = ar1(500, rng=rng)

    surrogate = ebisuzaki_surrogate(series, rng)

    assert surrogate.mean() == pytest.approx(series.mean(), abs=1e-8)
    assert surrogate.std() == pytest.approx(series.std(), rel=1e-8)


def test_surrogate_is_real_valued_and_reordered():
    rng = np.random.default_rng(4)
    series = ar1(300, rng=rng)

    surrogate = ebisuzaki_surrogate(series, rng)

    assert np.all(np.isfinite(surrogate))
    assert not np.allclose(surrogate, series)


def test_p_value_never_claims_more_than_the_surrogate_count_supports():
    assert surrogate_p_value(10.0, [0.0] * 99) == pytest.approx(0.01)
    assert surrogate_p_value(0.0, [1.0] * 99) == pytest.approx(1.0)


def test_p_value_counts_ties_against_the_observation():
    assert surrogate_p_value(0.5, [0.5, 0.1, 0.1, 0.1]) == pytest.approx(0.4)
