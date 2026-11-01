import numpy as np
import pytest

from ccm.embedding import (
    as_series,
    nearest_neighbours,
    pearson,
    simplex_weights,
    time_delay_embed,
)


def test_embedding_layout_puts_most_recent_coordinate_first():
    vectors, times = time_delay_embed([0, 1, 2, 3, 4], dimension=3, lag=1)

    assert times.tolist() == [2, 3, 4]
    assert vectors[0].tolist() == [2, 1, 0]
    assert vectors[-1].tolist() == [4, 3, 2]


def test_embedding_respects_lag():
    vectors, times = time_delay_embed(np.arange(10), dimension=3, lag=2)

    assert times[0] == 4
    assert vectors[0].tolist() == [4, 2, 0]


def test_series_too_short_for_the_embedding_is_refused():
    with pytest.raises(ValueError, match="too short"):
        time_delay_embed([1, 2, 3], dimension=4, lag=1)


def test_non_finite_values_are_refused_rather_than_dropped():
    with pytest.raises(ValueError, match="non-finite"):
        as_series([1.0, np.nan, 3.0])


def test_a_point_is_never_its_own_neighbour():
    vectors, times = time_delay_embed(np.sin(np.linspace(0, 20, 200)), 2, 1)

    distances, positions = nearest_neighbours(
        vectors, times, vectors, times, k=3, exclusion_radius=0
    )

    assert np.all(times[positions] != times[:, None])
    assert np.all(distances > 0)


def test_exclusion_radius_keeps_temporal_neighbours_out():
    vectors, times = time_delay_embed(np.sin(np.linspace(0, 20, 200)), 2, 1)

    _, positions = nearest_neighbours(
        vectors, times, vectors, times, k=3, exclusion_radius=10
    )

    gaps = np.abs(times[positions] - times[:, None])
    assert gaps.min() > 10


def test_exclusion_window_that_starves_the_search_is_refused():
    vectors, times = time_delay_embed(np.arange(30.0), 2, 1)

    with pytest.raises(ValueError, match="exclusion"):
        nearest_neighbours(vectors, times, vectors, times, k=3, exclusion_radius=25)


def test_neighbour_distances_come_back_sorted():
    rng = np.random.default_rng(0)
    vectors, times = time_delay_embed(rng.normal(size=300), 3, 1)

    distances, _ = nearest_neighbours(vectors, times, vectors, times, k=4)

    assert np.all(np.diff(distances, axis=1) >= 0)


def test_weights_sum_to_one_and_favour_the_nearest():
    weights = simplex_weights(np.array([[1.0, 2.0, 4.0]]))

    assert weights.sum() == pytest.approx(1.0)
    assert weights[0, 0] > weights[0, 1] > weights[0, 2]


def test_exact_match_takes_all_the_weight():
    weights = simplex_weights(np.array([[0.0, 1.0, 2.0]]))

    assert weights[0].tolist() == [1.0, 0.0, 0.0]


def test_pearson_reports_zero_skill_for_a_constant_prediction():
    assert pearson(np.ones(50), np.arange(50.0)) == 0.0
