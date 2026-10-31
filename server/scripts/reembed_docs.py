"""모든 문단의 임베딩을 조 제목 포함 형식으로 덮어씀. 기본은 확인만, GPU 서버에서 --apply로 실행.
embedding을 비우지 않고 한 묶음씩 덮어써서 도중에도 검색이 끊기지 않음. 중간에 실패하면 다시 실행하면 됨.
python -m server.scripts.reembed_docs [--apply | --restore 백업파일]
백업(*.private.json)은 git에 안 올라감. 복원 전까지 지우지 말 것."""
import argparse
import json
import math
from datetime import datetime
from pathlib import Path

from server.ai import client as ai
from server.scripts.load_yoram import _db


def all_chunks(db) -> list[dict]:
    rows = []
    while True:
        page = db.get('/doc_chunks', params={'select': 'id,content,embedding,documents(title)',
                                             'order': 'id.asc', 'limit': 100, 'offset': len(rows)}).raise_for_status().json()
        rows.extend(page)
        if len(page) < 100:
            return rows


def reembed(db, rows: list[dict]) -> int:
    done = 0
    for start in range(0, len(rows), 32):  # 한 번에 다 보내면 문단이 많을 때 Ollama가 실패함 (load_yoram과 같은 크기)
        part = rows[start:start + 32]
        vectors = ai.embed([ai.doc_text(r['documents']['title'], r['content']) for r in part])
        # 잘못된 벡터가 검색을 망가뜨리지 않게 쓰기 전에 확인
        if not vectors or len(vectors) != len(part) or any(len(v) != 768 or not all(map(math.isfinite, v)) for v in vectors):
            raise SystemExit(f'임베딩 결과가 이상해 중지합니다. {done}개까지 덮어썼습니다. 다시 실행하거나 --restore 하세요.')
        for row, vector in zip(part, vectors):
            db.patch('/doc_chunks', params={'id': f"eq.{row['id']}"}, json={'embedding': str(vector)}).raise_for_status()
            done += 1
        print(f'{done}/{len(rows)}', flush=True)
    return done


def restore(db, saved: list[dict]) -> int:
    for row in saved:
        db.patch('/doc_chunks', params={'id': f"eq.{row['id']}"}, json={'embedding': row['embedding']}).raise_for_status()
    return len(saved)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='백업 후 덮어쓰기')
    parser.add_argument('--restore', type=Path, help='백업 파일의 임베딩으로 되돌리기')
    args = parser.parse_args()
    with _db() as db:
        if args.restore:
            print(f'복원 완료: {restore(db, json.loads(args.restore.read_text(encoding="utf-8")))}개')
            return
        if ai.AI_FAKE or not ai.EMBED_MODEL:
            raise SystemExit('실제 임베딩 모델 설정이 필요합니다. DB는 변경하지 않았습니다.')
        rows = all_chunks(db)
        print(f'문단 {len(rows)}개, 임베딩 없음 {sum(r["embedding"] is None for r in rows)}개, 모델 {ai.EMBED_MODEL}', flush=True)
        if not args.apply:
            print('확인만 했습니다. 덮어쓰려면 --apply')
            return
        backup = Path(f'doc_chunks_backup_{datetime.now():%Y%m%d_%H%M%S}.private.json')
        backup.write_text(json.dumps([{'id': r['id'], 'embedding': r['embedding']} for r in rows]), encoding='utf-8')
        print(f'백업: {backup.resolve()}', flush=True)
        print(f'덮어쓰기 완료: {reembed(db, rows)}개. 이제 python -m server.scripts.check_retrieval')


if __name__ == '__main__':
    main()
