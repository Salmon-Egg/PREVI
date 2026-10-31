"""읽을 수 있는 첨부(사진·PDF·HWP)가 있는데 아직 안 읽은 공지를 다시 해석 대기(pending)로 돌림. 기본값은 미리보기.
다음 공지 작업이 첨부를 읽어 다시 해석하고, 재계산이 학생 판정·자동 할 일을 정리한다."""
import argparse
import json
import os

import httpx

from server.config import Settings
from server.jobs.attachments import MARK, readable
from server.scripts.load_graduation_catalog import all_rows


def stale(notices):
    return [n for n in notices if readable(n.get('attachments')) and MARK not in (n.get('body') or '')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    settings = Settings.from_env()
    secret = os.getenv('SUPABASE_SECRET_KEY', '').strip()
    if not secret:
        raise RuntimeError('서버 전용 키가 필요합니다.')
    with httpx.Client(base_url=settings.supabase_url, headers={'apikey': secret, 'Authorization': 'Bearer ' + secret}, timeout=40) as db:
        found = stale(all_rows(db, 'notices', extraction_status='eq.ready'))
        print(json.dumps([{'id': n['id'], 'title': n['title']} for n in found], ensure_ascii=False, indent=2))
        print(f'{len(found)}개' + ('' if args.apply else ' (미리보기. 바꾸려면 --apply)'))
        if args.apply:
            for n in found:
                db.patch('/rest/v1/notices', params={'id': f"eq.{n['id']}"}, json={'extraction_status': 'pending'}).raise_for_status()


if __name__ == '__main__':
    main()
