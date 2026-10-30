import pytest

from server.scripts.check_retrieval import similarity


def test_similarity_and_invalid_vectors():
    assert similarity([1, 0], [2, 0]) == pytest.approx(1)
    assert similarity([1, 0], [0, 1]) == pytest.approx(0)
    for left, right in [([], []), ([0], [1]), ([1], [1, 2])]:
        with pytest.raises(ValueError):
            similarity(left, right)
