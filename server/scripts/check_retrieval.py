"""검색·표본 임베딩을 읽기 전용으로 점검한다. DB 수정이나 재임베딩은 하지 않는다."""
import json
import math

from server.ai import client as ai
from server.routes.chat import rank_chunks
from server.scripts.load_yoram import _db

QUESTIONS = [('relevant', q) for q in (
    '졸업 총 학점', '전과', '전과 조건 알려줘', '휴학은 최대 몇 학기까지 할 수 있어?', '휴학 신청 방법 알려줘',
    '복학 신청은 언제 해?', '복학 신청 방법 알려줘', '졸업 요건이 뭐야?', '한 학기 최대 몇 학점까지 들을 수 있어?',
    '계절학기는 몇 학점까지 들을 수 있어?', '성적우수 장학금 조건이 뭐야?', '수강신청 절차 알려줘',
    '부전공은 어떻게 신청해?', '학사경고 기준이 뭐야?',
)] + [('unrelated', q) for q in (
    '오늘 학식 메뉴 뭐야?', '근처 맛집 추천해줘', '내일 날씨 어때?', '셔틀버스 시간표 알려줘', '기숙사 통금 시간 언제야?',
    '도서관 몇 시까지 열어?', '주차 등록은 어디서 해?', '미래인재 마일리지 제도 신청 절차 알려줘',
)]


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
        top_distances = {}
        for group, question in QUESTIONS:
            vectors = ai.embed([ai.QUERY_FMT.format(question)])
            if not vectors:
                raise SystemExit('검색 임베딩 응답이 없습니다.')
            rows = db.post('/rpc/match_doc_chunks', json={'query_embedding': str(vectors[0]),
                'match_count': 10}).raise_for_status().json()
            ranked = rank_chunks(rows, question)
            top_distances.setdefault(group, []).append(rows[0]['distance'])
            print(json.dumps({'group': group, 'question': question,
                'raw_top3': [{'article': ai.article_title(r['content']), 'distance': round(r['distance'], 5)} for r in rows[:3]],
                'production_top3': [{'article': ai.article_title(r['content']), 'distance': round(r['distance'], 5)} for r in ranked]},
                ensure_ascii=False), flush=True)
        # DOC_MAX_DISTANCE는 관련 최대와 무관 최소 사이에서 고름 (둘이 겹치면 숫자만으로 못 가름)
        print(json.dumps({'relevant_top1_max': round(max(top_distances['relevant']), 5),
                          'unrelated_top1_min': round(min(top_distances['unrelated']), 5)}), flush=True)


if __name__ == '__main__':
    main()
