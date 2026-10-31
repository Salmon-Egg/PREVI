"""사진 판독 표시가 있는 공지만 백업 후 첨부 추출분을 지우고 원문 기반 재해석 대기. 기본값은 미리보기."""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx

from server.config import Settings
from server.jobs.attachments import MARK
from server.jobs.image_ocr import REVIEW
from server.scripts.load_graduation_catalog import all_rows


def correction(notice):
    body = notice.get('body') or ''
    if MARK not in body or REVIEW not in body.split(MARK, 1)[1]:
        return None
    return {'body': body.split(MARK, 1)[0], 'extraction_status': 'pending',
            'summary': ['사진 판독 내용은 사용 중단했습니다. 공지 원문을 확인해 주세요.'],
            'target': {}, 'conditions': {'unknown': ['공지 원문 기준 재확인 필요']},
            'deadline': None, 'documents': []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    settings = Settings.from_env()
    if os.getenv('VISION_MODEL', '').strip() or os.getenv('NOTICE_OCR_DIR', '').strip():
        raise RuntimeError('VISION_MODEL과 NOTICE_OCR_DIR을 먼저 비워 주세요.')
    if not settings.secret_key:
        raise RuntimeError('서버 전용 키가 필요합니다.')
    with httpx.Client(base_url=settings.supabase_url,
                      headers={'apikey': settings.secret_key, 'Authorization': 'Bearer ' + settings.secret_key},
                      timeout=40) as db:
        found = [n for n in all_rows(db, 'notices') if correction(n)]
        print(json.dumps([{'id': n['id'], 'title': n['title']} for n in found], ensure_ascii=False, indent=2))
        print(f'{len(found)}개' + ('' if args.apply else ' (미리보기)'))
        if not args.apply or not found:
            return
        folder = Path.home() / '.local/state/previ-ocr'
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = folder / ('before-disable-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.private.json')
        with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as file:
            json.dump(found, file, ensure_ascii=True, indent=2)
        print(f'백업: {backup}')
        for n in found:
            response = db.patch('/rest/v1/notices', params={'id': f"eq.{n['id']}"}, json=correction(n))
            response.raise_for_status()
        print('원문·첨부 파일 보존, 사진 포함 추출 결과 사용 중단. 수집 작업 실행이 필요합니다.')


if __name__ == '__main__':
    main()
