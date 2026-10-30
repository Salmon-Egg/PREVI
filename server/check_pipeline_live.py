"""실제 Supabase + 고정 AI 결과로 파이프라인 검사. 만든 계정·공지만 삭제한다."""
import asyncio
import argparse
import os
import secrets
from datetime import datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import httpx

from server.config import Settings
from server.jobs.pipeline import Pipeline, KST
from server.notify import NotificationSender


def check(ok, name):
    if not ok:
        raise RuntimeError(name)
    print('PASS: ' + name, flush=True)


async def main(skip_notifications=False):
    settings = Settings.from_env()
    secret = os.getenv('SUPABASE_SECRET_KEY','')
    if not secret:
        raise RuntimeError('서버 전용 키가 필요합니다.')
    uid, notice_id = None, None
    now = datetime.now(KST).replace(hour=12,minute=0,second=0,microsecond=0)
    headers = {'apikey':secret,'Authorization':'Bearer ' + secret}
    async def report_error(response):
        if response.status_code >= 400:
            await response.aread()
            error = response.json()
            print('DB ERROR:', response.status_code, error.get('code'), error.get('message'), flush=True)
    async with httpx.AsyncClient(base_url=settings.supabase_url,headers=headers,timeout=30,event_hooks={'response':[report_error]}) as db, httpx.AsyncClient() as push:
        async def write(method, table, **kwargs):
            r = await db.request(method,'/rest/v1/' + table,**kwargs)
            r.raise_for_status()
            return r.json() if r.content else []
        try:
            email = 'codex-pipeline-' + uuid4().hex + '@skuniv.ac.kr'
            r = await db.post('/auth/v1/admin/users',json={'email':email,'password':secrets.token_urlsafe(32),'email_confirm':True})
            r.raise_for_status()
            uid = r.json()['id']
            profile = {'user_id':uid,'nickname':'가상검사','grade':2,'semester':2,'department':'소프트웨어학과',
                'admission_year':2023,'status':'enrolled','consent_agreed_at':now.isoformat(),
                'notify_notice':True,'notify_deadline':True,'notify_calendar':True,'notify_time':'09:00'}
            await write('POST','profiles',json=profile)
            await write('POST','grades',json={'user_id':uid,'term':'2-1','course_name':'가상검사 과목','credits':3,'grade':'A0','area':'전공'})
            notice = {'board_post_id':'pipeline-check-' + uuid4().hex,'title':'[통합검사 전용] 가상 장학',
                'body':'실제 제도가 아닌 파이프라인 검사입니다.','url':'https://www.skuniv.ac.kr/notice/test-' + uuid4().hex,
                'posted_at':now.isoformat(),'category':'장학'}
            inserted = await write('POST','notices',headers={'Prefer':'return=representation'},json=notice)
            notice_id = inserted[0]['id']
            result = {'summary':['가상 검사 요약'],'deadline':(now + timedelta(days=1)).isoformat(), 'documents':[],
                'target':{'grades':[2]},'conditions':{'min_gpa':3.0,'min_credits':3}}
            sender = NotificationSender(db,push,push_enabled=False)
            if skip_notifications:
                from unittest.mock import AsyncMock
                sender = AsyncMock()
            pipeline = Pipeline(db,sender,now=now)
            with patch('server.ai.tasks.summarize_notice',return_value=result), patch('server.ai.tasks.severity',return_value=2), patch('server.ai.tasks.explain_reason',return_value='가상 검사 기준에 해당해요.'):
                check((await pipeline.extract(notice_id=notice_id))['ready'] == 1,'pending notice becomes ready')
                for _ in range(2):
                    stats = await pipeline.recalculate(uid)
                    check(stats['errors'] == 0,'student recalculation')
                eligibility = await pipeline.rows('eligibility',user_id='eq.' + uid,notice_id=f'eq.{notice_id}')
                check(len(eligibility) == 1 and eligibility[0]['verdict'] == 'eligible','eligibility saved once')
                todos = await pipeline.rows('todos',user_id='eq.' + uid,source_id=f'eq.{notice_id}')
                check(len(todos) == 1,'automatic todo saved once')
                if not skip_notifications:
                    notifications = await pipeline.rows('notifications',user_id='eq.' + uid,type='eq.notice',target_id=f'eq.{notice_id}')
                    check(len(notifications) == 1 and notifications[0]['delivery_status'] == 'in_app','notice notification reserved once without external push')
                    await pipeline.reminders(uid)
                    await pipeline.reminders(uid)
                    rows = await pipeline.rows('notifications',user_id='eq.' + uid,type='eq.deadline',target_id=f"eq.{todos[0]['id']}")
                    check(len(rows) == 1,'deadline reminder saved once')
                await write('PATCH','todos',params={'id':f"eq.{todos[0]['id']}"},json={'done':True})
                await pipeline.recalculate(uid)
                rows = await pipeline.rows('todos',user_id='eq.' + uid,source_id=f'eq.{notice_id}')
                check(rows[0]['done'] is True,'student completion survives recalculation')
                await write('PATCH','todos',params={'id':f"eq.{todos[0]['id']}"},json={'done':False})
                await write('PATCH','profiles',params={'user_id':'eq.' + uid},json={'grade':3})
                await pipeline.recalculate(uid)
                rows = await pipeline.rows('eligibility',user_id='eq.' + uid,notice_id=f'eq.{notice_id}')
                check(rows[0]['verdict'] == 'ineligible','changed grade reclassifies student')
                check(not await pipeline.rows('todos',user_id='eq.' + uid,source_id=f'eq.{notice_id}'),'obsolete unfinished automatic todo removed')
        finally:
            failures = []
            if notice_id:
                r = await db.delete('/rest/v1/notices',params={'id':f'eq.{notice_id}'})
                if r.status_code not in (200,204): failures.append('notice')
            if uid:
                r = await db.delete('/auth/v1/admin/users/' + uid)
                if r.status_code not in (200,204): failures.append('account')
            check(not failures,'temporary account and notice deleted')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-notifications',action='store_true',help='011 적용 전 판정·할 일만 검사. 알림 통과로 보지 않음')
    asyncio.run(main(parser.parse_args().skip_notifications))
