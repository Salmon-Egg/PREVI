"""검색·표본 임베딩을 읽기 전용으로 점검한다. DB 수정이나 재임베딩은 하지 않는다."""
import json
import math

from server.ai import client as ai
from server.routes.chat import _title_asked
from server.scripts.load_yoram import _db


def similarity(left, right):
    if len(left) != len(right) or not left:
        raise ValueError('벡터 차원이 다르거나 비어 있습니다.')
    scale = math.sqrt(sum(x * x for x in left) * sum(x * x for x in right))
    if not scale:
        raise ValueError('영벡터는 비교할 수 없습니다.')
    return sum(x * y for x, y in zip(left, right)) / scale


def main():
    if ai.AI_FAKE or not ai.EMBED_MODEL:
        raise SystemExit('실제 임베딩 모델 설정이 필요합니다. 설정은 변경하지 않았습니다.')
    with _db() as db:
        chunks = []
        while True:
            page = db.get('/doc_chunks', params={'select': 'id,content,embedding,documents(title)',
                'order': 'id.asc', 'limit': 100, 'offset': len(chunks)}).raise_for_status().json()
            chunks.extend(page)
            if len(page) < 100:
                break
        print(json.dumps({'chunks': len(chunks), 'missing_vectors': sum(c['embedding'] is None for c in chunks),
                          'embed_model': ai.EMBED_MODEL, 'max_distance': ai.DOC_MAX_DISTANCE}), flush=True)
        for heading in ('전과의 허가', '졸업학점'):
            chunk = next((c for c in chunks if ai.article_title(c['content']) == heading), None)
            if not chunk or chunk['embedding'] is None:
                print(json.dumps({'sample': heading, 'available': False}, ensure_ascii=False), flush=True)
                continue
            title = chunk['documents']['title']
            vectors = ai.embed([ai.doc_text(title, chunk['content']), ai.DOC_FMT.format(title, chunk['content'])])
            if not vectors:
                raise SystemExit('임베딩 응답이 없습니다. DB는 변경하지 않았습니다.')
            stored = json.loads(chunk['embedding']) if isinstance(chunk['embedding'], str) else chunk['embedding']
            current, previous = (similarity(stored, vector) for vector in vectors)
            print(json.dumps({'sample': heading, 'chunk_id': chunk['id'],
                'cosine_with_heading': round(current, 8), 'cosine_without_heading': round(previous, 8),
                'matches_current_format': abs(1 - current) < 0.00001}, ensure_ascii=False), flush=True)
        for question in ('졸업 총 학점', '전과'):
            vectors = ai.embed([ai.QUERY_FMT.format(question)])
            if not vectors:
                raise SystemExit('검색 임베딩 응답이 없습니다.')
            rows = db.post('/rpc/match_doc_chunks', json={'query_embedding': str(vectors[0]),
                'match_count': 10}).raise_for_status().json()
            filtered = [r for r in rows if r['distance'] <= ai.DOC_MAX_DISTANCE]
            hit = next((r for r in filtered if _title_asked(ai.article_title(r['content']), question)), None)
            ranked = ([hit] + [r for r in filtered if r is not hit] if hit else filtered)[:3]
            print(json.dumps({'question': question,
                'raw_top3': [{'article': ai.article_title(r['content']), 'distance': round(r['distance'], 5)} for r in rows[:3]],
                'production_top3': [{'article': ai.article_title(r['content']), 'distance': round(r['distance'], 5)} for r in ranked]},
                ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
