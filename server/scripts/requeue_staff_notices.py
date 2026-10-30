"""교수·교직원 대상·폐강 공지 중 예전 규칙으로 해석된 것을 다시 해석 대기(pending)로 돌림. 기본값은 미리보기.
다음 공지 작업이 지금 규칙(tasks.NOT_FOR_STUDENTS → staff)으로 다시 해석하고, 재계산이 학생 판정·자동 할 일을 정리한다."""
import argparse
import json
import os

import httpx

from server.ai.tasks import NOT_FOR_STUDENTS
from server.config import Settings
from server.scripts.load_graduation_catalog import all_rows


def stale(notices):
    """summarize_notice와 같은 기준(제목·조건 문장)인데 아직 staff로 저장되지 않은 공지."""
    return [n for n in notices if (n.get('target') or {}).get('statuses') != ['staff'] and (
        NOT_FOR_STUDENTS.search(n['title'])
        or any(NOT_FOR_STUDENTS.search(s) for s in (n.get('conditions') or {}).get('unknown') or []))]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    settings=Settings.from_env();secret=os.getenv('SUPABASE_SECRET_KEY','').strip()
    if not secret:raise RuntimeError('서버 전용 키가 필요합니다.')
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer ' + secret},timeout=40) as db:
        found=stale(all_rows(db,'notices',extraction_status='eq.ready'))
        print(json.dumps([{'id':n['id'],'title':n['title']} for n in found],ensure_ascii=False,indent=2))
        print(f'{len(found)}개' + ('' if args.apply else ' (미리보기. 바꾸려면 --apply)'))
        if args.apply and found:
            response=db.patch('/rest/v1/notices',params={'id':'in.(' + ','.join(str(n['id']) for n in found) + ')'},json={'extraction_status':'pending'})
            response.raise_for_status()


if __name__=='__main__':main()
