import asyncio
import copy
import json
from datetime import datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from server.ai import tasks
from server.jobs.pipeline import Pipeline, KST, verdict_for, quiet_now, extraction_values

UID = str(uuid4())
NOW = datetime(2026, 10, 28, 10, tzinfo=KST)
PROFILE = {'id':1, 'user_id':UID, 'grade':2, 'semester':2, 'department':'소프트웨어학과',
           'status':'enrolled','consent_agreed_at':'2026-10-01','assistant_scope':{},'notify_quiet':''}
NOTICE = {'id':1,'title':'장학 신청','body':'공지 본문','category':'장학','url':'https://www.skuniv.ac.kr/notice/test',
          'extraction_status':'ready','deadline':'2026-10-29T18:00:00+09:00','target':{},'conditions':{'min_credits':3},'summary':['요약']}
GRADE = {'id':1,'user_id':UID,'term':'2-1','course_name':'자료구조','credits':3,'grade':'A0','area':'전공'}


@pytest.fixture(autouse=True)
def template_reason(monkeypatch):
    monkeypatch.setattr(tasks,'explain_reason',lambda title,verdict,reasons:' · '.join(reasons))


class MemoryDB:
    def __init__(self):
        self.data = {'profiles':[copy.deepcopy(PROFILE)], 'notices':[copy.deepcopy(NOTICE)], 'grades':[copy.deepcopy(GRADE)],
                     'eligibility':[], 'todos':[], 'scholarship_applications':[], 'academic_calendar':[]}
        self.reads = []

    def handle(self, request):
        table = request.url.path.split('/')[-1]
        params = dict(request.url.params)
        rows = self.data[table]
        def match(row):
            for key, value in params.items():
                if key in ('select','order','limit','offset','on_conflict'): continue
                actual = str(row.get(key)).lower() if isinstance(row.get(key),bool) else str(row.get(key))
                if value.startswith('eq.') and actual != value[3:]: return False
                if value.startswith('in.(') and actual not in value[4:-1].split(','): return False
                if value.startswith('like.') and not actual.startswith(value[5:].rstrip('*')): return False
            return True
        if request.method == 'GET':
            self.reads.append(table)
            out = [r for r in rows if match(r)]
            offset, limit = int(params.get('offset',0)), int(params.get('limit',100))
            return httpx.Response(200,json=out[offset:offset+limit])
        if request.method == 'DELETE':
            self.data[table] = [r for r in rows if not match(r)]
            return httpx.Response(204)
        value = json.loads(request.content)
        if request.method == 'PATCH':
            for r in rows:
                if match(r): r.update(value)
            return httpx.Response(204)
        keys = params['on_conflict'].split(',')
        old = next((r for r in rows if all(r[k] == value[k] for k in keys)),None)
        if old is None:
            rows.append({'id':len(rows)+1,'done':False,**value})
        else:
            old.update(value)
        return httpx.Response(201)


def test_pipeline_idempotence_completion_and_withdrawal(monkeypatch):
    monkeypatch.setattr(tasks,'severity',lambda *_:2)
    from unittest.mock import Mock
    reason = Mock(return_value='직전 학기 기준에 해당해요.')
    monkeypatch.setattr(tasks,'explain_reason',reason)
    db = MemoryDB()
    async def run():
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            pipeline = Pipeline(client, AsyncMock(),now=NOW)
            await pipeline.recalculate(UID)
            await pipeline.recalculate(UID)
            assert len(db.data['todos']) == len(db.data['eligibility']) == 1
            reason.assert_called_once()
            assert '직전 학기 기준에 해당해요.' in db.data['todos'][0]['reason']
            assert db.data['eligibility'][0]['verdict'] == 'eligible'
            db.data['todos'][0]['done'] = True
            await pipeline.recalculate(UID)
            assert db.data['todos'][0]['done'] is True
            db.data['todos'][0]['done'] = False
            db.data['notices'][0]['target'] = {'grades':[4]}
            await pipeline.recalculate(UID)
            assert db.data['todos'] == []
            assert db.data['eligibility'][0]['verdict'] == 'ineligible'
    asyncio.run(run())


def test_failed_ai_retries_without_ready_fallback(monkeypatch):
    db = MemoryDB()
    db.data['notices'][0]['extraction_status'] = 'pending'
    def fail(*args, **kwargs): raise RuntimeError('AI offline')
    monkeypatch.setattr(tasks,'summarize_notice',fail)
    async def run():
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            pipeline = Pipeline(client,AsyncMock(),now=NOW)
            assert (await pipeline.extract()) == {'ready':0,'failed':1}
            assert db.data['notices'][0]['extraction_status'] == 'failed'
            monkeypatch.setattr(tasks,'summarize_notice',lambda *a,**kw:{**NOTICE,'documents':[]})
            assert (await pipeline.extract()) == {'ready':1,'failed':0}
    asyncio.run(run())


def test_strict_summary_surfaces_ai_failure(monkeypatch):
    def fail(*_): raise RuntimeError('offline')
    monkeypatch.setattr(tasks,'ask_json',fail)
    with pytest.raises(RuntimeError): tasks.summarize_notice('title','body',strict=True)
    assert tasks.summarize_notice('title','body')['summary'] == ['title']


def test_missing_hidden_and_non_previous_grades_need_check():
    assert verdict_for(NOTICE,PROFILE,[])[0] == 'check'
    assert verdict_for(NOTICE,PROFILE,[{**GRADE,'term':'1-2'}])[0] == 'check'
    assert verdict_for(NOTICE,{**PROFILE,'assistant_scope':{'grades':False}},[GRADE])[0] == 'check'
    assert verdict_for(NOTICE,PROFILE,[GRADE,GRADE])[0] == 'check'


def test_quiet_window_and_reminder_time():
    assert quiet_now('22:00-07:00',NOW.replace(hour=23))
    assert quiet_now('22:00-07:00',NOW.replace(hour=6))
    assert not quiet_now('22:00-07:00',NOW)
    async def run():
        sender = AsyncMock()
        pipeline = Pipeline(None,sender,now=NOW)
        await pipeline.notify({**PROFILE,'notify_time':'11:00'},'deadline','test',1,scheduled=True)
        await pipeline.notify({**PROFILE,'notify_quiet':'09:00-12:00'},'notice','test',1)
        sender.send.assert_not_called()
        await pipeline.notify(PROFILE,'notice','test',1)
        sender.send.assert_awaited_once()
    asyncio.run(run())


def test_scope_disabled_does_not_read_grades(monkeypatch):
    db = MemoryDB()
    db.data['profiles'][0]['assistant_scope'] = {'grades':False}
    monkeypatch.setattr(tasks,'severity',lambda *_:2)
    async def run():
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            await Pipeline(client,AsyncMock(),now=NOW).recalculate(UID)
        assert 'grades' not in db.reads
        assert db.data['eligibility'][0]['verdict'] == 'check'
    asyncio.run(run())


@pytest.mark.parametrize('broken',[
    {'summary':'not a list'}, {'deadline':'2026-10-29'}, {'deadline':'nonsense'},
    {'documents':[1]}, {'summary':[]},
])
def test_broken_ai_fields_cannot_be_saved_ready(broken):
    with pytest.raises((ValueError,TypeError)):
        extraction_values({**NOTICE,'documents':[],**broken})


def test_no_consent_cleans_only_unfinished_automatic_data():
    db = MemoryDB()
    db.data['profiles'][0]['consent_agreed_at'] = None
    db.data['eligibility'] = [{'id':1,'user_id':UID}]
    db.data['todos'] = [{'id':1,'user_id':UID,'reason':'[자동] 원문','done':False},
                        {'id':2,'user_id':UID,'reason':'수동','done':False},
                        {'id':3,'user_id':UID,'reason':'[자동] 완료','done':True}]
    async def run():
        sender = AsyncMock()
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            await Pipeline(client,sender,now=NOW).recalculate(UID)
        assert db.data['eligibility'] == []
        assert [t['id'] for t in db.data['todos']] == [2,3]
        sender.send.assert_not_called()
    asyncio.run(run())


def test_profile_refresh_does_not_wait_for_ai_or_send_push(monkeypatch):
    db = MemoryDB()
    def forbidden(*args,**kwargs):
        raise AssertionError('profile refresh must not call AI')
    monkeypatch.setattr(tasks,'severity',forbidden)
    monkeypatch.setattr(tasks,'explain_reason',forbidden)
    async def run():
        sender = AsyncMock()
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            pipeline = Pipeline(client,sender,now=NOW)
            result = await pipeline.recalculate(UID,use_ai=False,notify=False)
        assert result['errors'] == 0
        assert len(db.data['todos']) == 1
        sender.send.assert_not_called()
    asyncio.run(run())


def test_short_reasons_caps_check_items():
    from server.jobs.pipeline import short_reasons
    check = [f"조건 {i} " + "가" * 60 + " — 직접 확인이 필요해요" for i in range(5)]
    out = short_reasons(["재학생 ✓"] + check)
    assert out[0] == "재학생 ✓" and len(out) == 5 and out[-1] == "그 밖에 2가지는 공지 원문에서 확인해 주세요"
    assert all(len(r) <= 40 + len(" — 직접 확인이 필요해요") + 1 for r in out[1:4])
    assert short_reasons(["재학생 ✓"]) == ["재학생 ✓"]


def test_reason_is_not_written_twice_when_ai_falls_back(monkeypatch):
    # autouse 픽스처: AI 설명 = 근거 목록 그대로 (AI가 꺼졌거나 실패한 경우와 같음)
    monkeypatch.setattr(tasks,'severity',lambda *_:2)
    db = MemoryDB()
    async def run():
        async with httpx.AsyncClient(base_url='https://test',transport=httpx.MockTransport(db.handle)) as client:
            for use_ai in (True, False):
                db.data['todos'] = []
                await Pipeline(client, AsyncMock(),now=NOW).recalculate(UID, use_ai=use_ai)
                reason = db.data['todos'][0]['reason']
                assert reason.startswith('[자동] 근거: ') and reason.count('근거:') == 1 and '\n' not in reason
    asyncio.run(run())
