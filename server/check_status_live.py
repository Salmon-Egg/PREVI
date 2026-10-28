"""임시 계정으로 휴학 변경 즉시 재판정·학사일정·추가전공 조회를 검사한다."""
import os
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.jobs.pipeline import KST


def check(ok,label):
    if not ok: raise RuntimeError(label)
    print('PASS: ' + label,flush=True)


def main():
    settings = Settings.from_env()
    secret = os.getenv('SUPABASE_SECRET_KEY','')
    if not secret: raise RuntimeError('Missing server key')
    uid,notice_id,event_id = None,None,None
    now = datetime.now(KST)
    marker = uuid4().hex
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer ' + secret},timeout=30) as db:
        def insert(table,values):
            r=db.post('/rest/v1/' + table,headers={'Prefer':'return=representation'},json=values)
            r.raise_for_status()
            return r.json()[0]['id']
        def rows(table,**params):
            r=db.get('/rest/v1/' + table,params=params)
            r.raise_for_status()
            return r.json()
        try:
            email,password='codex-status-' + marker + '@skuniv.ac.kr',secrets.token_urlsafe(32)
            r=db.post('/auth/v1/admin/users',json={'email':email,'password':password,'email_confirm':True})
            r.raise_for_status();uid=r.json()['id']
            r=db.post('/auth/v1/token',params={'grant_type':'password'},headers={'apikey':settings.publishable_key,'Authorization':'Bearer ' + settings.publishable_key},json={'email':email,'password':password})
            r.raise_for_status();headers={'Authorization':'Bearer ' + r.json()['access_token']}
            notice_id=insert('notices',{'board_post_id':'status-check-' + marker,'title':'[통합검사 전용] 중간강의평가','body':'가상 검사',
                'url':'https://www.skuniv.ac.kr/notice/test-' + marker,'posted_at':now.isoformat(),'category':'학사',
                'deadline':(now+timedelta(days=1)).isoformat(),'extraction_status':'ready','summary':['가상 검사'],'target':{},'conditions':{}})
            event_id=insert('academic_calendar',{'title':'[통합검사 전용] 중간강의평가','start_date':now.date().isoformat(),
                'end_date':(now+timedelta(days=1)).date().isoformat(),'target_grades':[], 'source_url':'https://www.skuniv.ac.kr/academic-calendar'})
            with TestClient(create_app(settings)) as api:
                r=api.put('/me',headers=headers,json={'nickname':'가상검사','department':'소프트웨어학과','admission_year':2023,
                    'grade':2,'semester':2,'status':'enrolled','consent':{'agreed':True},'notify':{'quiet':'22:00-07:00'}})
                check(r.status_code==200,'enrolled profile saved')
                check(r.json()['notify']['quiet']=='22:00-07:00','quiet setting returned')
                check(any(e['id']==event_id for e in api.get('/calendar',headers=headers).json()),'evaluation calendar visible while enrolled')
                check(len(rows('todos',user_id='eq.'+uid,source_id=f'eq.{notice_id}',select='id'))==1,'evaluation automatic todo created')
                r=api.put('/me',headers=headers,json={'status':'leave'})
                check(r.status_code==200,'leave status update finishes')
                check(rows('eligibility',user_id='eq.'+uid,notice_id=f'eq.{notice_id}',select='verdict')[0]['verdict']=='ineligible','leave verdict updated before response')
                check(not rows('todos',user_id='eq.'+uid,source_id=f'eq.{notice_id}',select='id'),'unrelated automatic todo removed before response')
                check(not any(e['id']==event_id for e in api.get('/calendar',headers=headers).json()),'leave calendar hides evaluation')
                r=api.put('/me',headers=headers,json={'minor':'경영학과'})
                check(r.status_code==200,'minor profile saved')
                r=api.get('/graduation',headers=headers)
                check(r.status_code==200 and r.json()['requirements'][-1]['done'] is None,'minor keeps major progress and review notice')
                r=api.put('/me',headers=headers,json={'department':'전자컴퓨터공학과','minor':None})
                check(r.status_code==200 and api.get('/graduation',headers=headers).status_code==200,'supported electronic computer cohort remains readable')
        finally:
            failures=[]
            for table,identifier in (('notices',notice_id),('academic_calendar',event_id)):
                if identifier:
                    r=db.delete('/rest/v1/'+table,params={'id':f'eq.{identifier}'})
                    if r.status_code not in (200,204): failures.append(table)
            if uid:
                r=db.delete('/auth/v1/admin/users/' + uid)
                if r.status_code not in (200,204,404): failures.append('account')
            check(not failures,'temporary account notice and calendar deleted')


if __name__=='__main__': main()
