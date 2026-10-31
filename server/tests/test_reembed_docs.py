import pytest

from server.ai import client as ai
from server.scripts import reembed_docs

ROWS = [{'id': i, 'content': '[학칙] 제 22 조(전과) 내용', 'embedding': f'old{i}', 'documents': {'title': '요람'}} for i in range(33)]


class Db:
    def __init__(self):
        self.patched = {}

    def patch(self, _, params, json):
        self.patched[params['id']] = json['embedding']
        return self

    def raise_for_status(self):
        return self


def test_overwrites_all_batches_with_article_title(monkeypatch):
    sent, db = [], Db()
    monkeypatch.setattr(ai, 'embed', lambda texts: sent.extend(texts) or [[0.1] * 768 for _ in texts])
    assert reembed_docs.reembed(db, ROWS) == 33
    assert len(db.patched) == 33 and 'title: 요람 · 전과 |' in sent[0]


@pytest.mark.parametrize('bad', [None, [], [[0.1] * 767], [[float('nan')] * 768]])
def test_bad_vectors_never_written(monkeypatch, bad):
    db = Db()
    monkeypatch.setattr(ai, 'embed', lambda texts: bad)
    with pytest.raises(SystemExit):
        reembed_docs.reembed(db, ROWS[:1])
    assert not db.patched


def test_restore_puts_saved_vectors_back():
    db = Db()
    assert reembed_docs.restore(db, [{'id': 1, 'embedding': 'old1'}]) == 1
    assert db.patched == {'eq.1': 'old1'}
