"""Ground-truth tests: systems where the causal answer is known in advance."""
import numpy as np
import pytest

from ccm import __version__
from ccm.crossmap import ccm, cross_map_skill, default_library_sizes
from ccm.systems import ar1, coupled_logistic, independent_logistic

SEED = 20260101


def test_unidirectional_coupling_is_found_in_the_right_direction():
    # X drives Y and nothing drives X.
    x, y = coupled_logistic(1000, effect_of_y_on_x=0.0, effect_of_x_on_y=0.1)

    # Y's manifold should carry X's signature, because X forced it.
    y_xmap_x = ccm(
        manifold=y, target=x, dimension=3, n_surrogates=100,
        manifold_label="Y", target_label="X",
        rng=np.random.default_rng(SEED),
    )
    # X's manifold should not carry Y's, because Y never touched X.
    x_xmap_y = ccm(
        manifold=x, target=y, dimension=3, n_surrogates=100,
        manifold_label="X", target_label="Y",
        rng=np.random.default_rng(SEED),
    )

    assert y_xmap_x.supports_causality(), y_xmap_x.summary()
    assert not x_xmap_y.supports_causality(), x_xmap_y.summary()
    assert y_xmap_x.rho > x_xmap_y.rho
    assert y_xmap_x.implication == "X -> Y"


def test_the_driven_direction_converges_and_the_other_does_not():
    x, y = coupled_logistic(1000, effect_of_y_on_x=0.0, effect_of_x_on_y=0.1)

    driven = ccm(manifold=y, target=x, dimension=3, n_surrogates=1,
                 rng=np.random.default_rng(SEED))
    absent = ccm(manifold=x, target=y, dimension=3, n_surrogates=1,
                 rng=np.random.default_rng(SEED))

    assert driven.converged()
    assert driven.delta_rho > 0.1
    assert driven.monotonicity > 0.8
    assert not absent.converged()


def test_uncoupled_chaos_is_reported_as_no_causality_either_way():
    x, y = independent_logistic(1000)

    forward = ccm(manifold=y, target=x, dimension=3, n_surrogates=100,
                  rng=np.random.default_rng(SEED))
    backward = ccm(manifold=x, target=y, dimension=3, n_surrogates=100,
                   rng=np.random.default_rng(SEED))

    assert not forward.supports_causality(), forward.summary()
    assert not backward.supports_causality(), backward.summary()


def test_shared_autocorrelation_alone_does_not_pass_the_null():
    """The case that makes naive CCM dangerous on price data.

    Two unrelated AR(1) series embed into each other well enough to score a
    respectable rho. The surrogate null exists to refuse exactly this, and the
    test asserts the refusal rather than the rho.
    """
    rng = np.random.default_rng(SEED)
    a = ar1(800, phi=0.95, rng=rng)
    b = ar1(800, phi=0.95, rng=rng)

    result = ccm(manifold=a, target=b, dimension=3, n_surrogates=200, rng=rng)

    assert not result.supports_causality(), result.summary()


def test_a_result_without_a_null_cannot_be_requested():
    x, y = coupled_logistic(300)

    with pytest.raises(ValueError, match="n_surrogates must be at least 1"):
        ccm(manifold=y, target=x, dimension=3, n_surrogates=0)


def test_misaligned_series_are_refused():
    x, y = coupled_logistic(300)

    with pytest.raises(ValueError, match="one time index"):
        ccm(manifold=y[:200], target=x, dimension=3, n_surrogates=1)


def test_dimension_is_chosen_by_simplex_when_not_given():
    x, y = coupled_logistic(600)

    result = ccm(manifold=y, target=x, n_surrogates=1,
                 rng=np.random.default_rng(SEED))

    assert 1 <= result.dimension <= 10


def test_result_carries_the_library_version_for_cache_keys():
    x, y = coupled_logistic(300)

    result = ccm(manifold=y, target=x, dimension=3, n_surrogates=1,
                 rng=np.random.default_rng(SEED))

    assert result.library_version == __version__


def test_library_draws_are_reproducible_from_a_seed():
    x, y = coupled_logistic(400)

    first = cross_map_skill(y, x, dimension=3, library_size=100, n_draws=5,
                            rng=np.random.default_rng(7))
    second = cross_map_skill(y, x, dimension=3, library_size=100, n_draws=5,
                             rng=np.random.default_rng(7))

    assert np.allclose(first, second)


def test_full_library_collapses_repeated_draws():
    x, y = coupled_logistic(300)

    scores = cross_map_skill(y, x, dimension=3, n_draws=10)

    assert scores.size == 1


def test_library_size_beyond_the_state_count_is_refused():
    x, y = coupled_logistic(100)

    with pytest.raises(ValueError, match="exceeds"):
        cross_map_skill(y, x, dimension=3, library_size=10_000)


def test_default_library_sizes_span_the_usable_range():
    sizes = default_library_sizes(n_states=500, dimension=3)

    assert sizes[0] == 5
    assert sizes[-1] == 500
    assert list(sizes) == sorted(set(sizes))
