import numpy as np
import pytest

from ccm.simplex import scan_dimensions, simplex_forecast_skill
from ccm.systems import coupled_logistic


def test_a_deterministic_map_is_forecast_almost_perfectly():
    x, _ = coupled_logistic(600)

    assert simplex_forecast_skill(x, dimension=2, lag=1) > 0.95


def test_noise_is_not_forecastable():
    noise = np.random.default_rng(1).normal(size=600)

    assert simplex_forecast_skill(noise, dimension=3, lag=1) < 0.3


def test_scan_prefers_a_low_dimension_for_a_one_dimensional_map():
    x, _ = coupled_logistic(600)

    scan = scan_dimensions(x, dimensions=range(1, 9))

    assert scan.best <= 3
    assert max(scan.rho) > 0.95


def test_scan_skips_dimensions_the_series_cannot_support():
    short = coupled_logistic(20)[0]

    scan = scan_dimensions(short, dimensions=range(1, 40))

    assert max(scan.dimensions) < 40
    assert scan.best in scan.dimensions


def test_scan_with_nothing_scorable_is_refused():
    with pytest.raises(ValueError, match="no candidate dimension"):
        scan_dimensions([1.0, 2.0, 3.0, 4.0], dimensions=[20, 30])
