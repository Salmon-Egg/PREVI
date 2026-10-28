"""기존 Supabase 표로 공지 해석 → 학생 판정 → 자동 할 일 → 알림을 연결한다."""
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import httpx
from starlette.concurrency import run_in_threadpool

from server.ai import tasks
from server.config import Settings
from server.logic.eligibility import judge
from server.logic.grades import semester_gpa
from server.logic.schedule import d_day, priority
from server.notify import NotificationSender

log = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))
AUTO_REASON = "[자동] "


def quiet_now(value, now):
    if not value:
        return False
    start, end = value.split("-")
    current = now.astimezone(KST).strftime("%H:%M")
    return start <= current < end if start < end else current >= start or current < end


def previous_grades(profile, grades):
    """현재 학기보다 이전인 직전 정규 학기만 사용. 미입력 학기를 건너뛰지 않는다."""
    year, semester = profile.get("grade"), profile.get("semester")
    if not year or not semester or (year == 1 and semester == 1):
        return []
    term = f"{year}-1" if semester == 2 else f"{year - 1}-2"
    return [g for g in grades if g["term"] == term]


def verdict_for(notice, profile, grades):
    target, conditions = notice["target"], dict(notice["conditions"])
    scope = profile.get("assistant_scope") or {}
    hidden = []
    if not scope.get("status", True):
        hidden = ["학적 정보 사용이 꺼져 있어 대상 확인 필요"]
        target = {}
    if not all(profile.get(k) is not None for k in ("grade", "semester", "department")):
        hidden.append("학생 기본 정보 확인 필요")
        target = {}
    items = previous_grades(profile, grades) if scope.get("grades", True) else []
    if conditions.get("min_gpa") is not None or conditions.get("min_credits") is not None:
        names = [g["course_name"] for g in items]
        if not items or len(names) != len(set(names)):
            hidden.append("직전 학기 성적 미입력·중복 또는 성적 사용 설정 확인 필요")
            conditions.pop("min_gpa", None)
            conditions.pop("min_credits", None)
    conditions["unknown"] = list(conditions.get("unknown") or []) + hidden
    gpa = semester_gpa(items) if items else None
    credits = sum(float(g["credits"]) for g in items if g["grade"] != "F")
    return judge(target, conditions, profile, gpa, credits)


def extraction_values(result):
    """깨진 AI JSON을 ready로 확정하지 않는다."""
    for key in ("summary", "documents"):
        value = result[key]
        if not isinstance(value, list) or any(not isinstance(s, str) for s in value):
            raise ValueError("잘못된 AI 목록")
    if not 1 <= len(result["summary"]) <= 3:
        raise ValueError("공지 요약 누락")
    for key in ("target", "conditions"):
        if not isinstance(result[key], dict):
            raise ValueError("잘못된 AI 조건")
    deadline = result.get("deadline")
    if deadline:
        parsed = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("마감 시각의 시간대 누락")
    # 수집기의 게시판 분류를 유지한다. 잘못된 AI 분류로 장학이 일반으로 사라지지 않게 한다.
    return {k: result[k] for k in ("summary", "deadline", "documents", "target", "conditions")}


class Pipeline:
    def __init__(self, database, sender, *, now=None):
        self.db, self.sender = database, sender
        self.now = now or datetime.now(KST)
        self.severities = {}

    async def rows(self, table, **params):
        result = []
        while True:
            response = await self.db.get('/rest/v1/' + table, params={"select":"*", "order":"id.asc", **params, "offset":len(result), "limit":100})
            response.raise_for_status()
            page = response.json()
            result.extend(page)
            if len(page) < 100:
                return result

    async def write(self, method, table, **kwargs):
        response = await self.db.request(method, '/rest/v1/' + table, **kwargs)
        response.raise_for_status()
        return response.json() if response.content else []

    async def extract(self, limit=20, notice_id=None):
        stats = {"ready":0, "failed":0}
        rows = await self.rows('notices', extraction_status='in.(pending,failed)', **({'id':f'eq.{notice_id}'} if notice_id else {}))
        rows.sort(key=lambda n: (n['extraction_status'] != 'pending', n['id']))
        for notice in rows[:limit]:
            try:
                result = await run_in_threadpool(tasks.summarize_notice, notice['title'], notice['body'], strict=True)
                values = extraction_values(result)
                await self.write('PATCH', 'notices', params={'id':f"eq.{notice['id']}"}, json={**values, 'extraction_status':'ready'})
                stats['ready'] += 1
            except Exception as exc:
                # 본문이나 학생 정보 없이 오류 종류만 기록하고 다음 회차에 재시도한다.
                log.warning('notice extraction failed id=%s type=%s', notice['id'], type(exc).__name__)
                await self.write('PATCH', 'notices', params={'id':f"eq.{notice['id']}"}, json={'extraction_status':'failed'})
                stats['failed'] += 1
        return stats

    async def notify(self, p, kind, title, target_id, event_key='once', *, scheduled=False):
        if quiet_now(p.get('notify_quiet'), self.now):
            return
        if scheduled and self.now.astimezone(KST).strftime('%H:%M') < str(p.get('notify_time') or '09:00')[:5]:
            return
        await self.sender.send(UUID(p['user_id']), kind, title[:200], target_id, event_key)

    async def recalculate(self, user_id=None):
        profiles = await self.rows('profiles', **({'user_id':'eq.' + str(user_id)} if user_id else {}))
        notices = await self.rows('notices', extraction_status='eq.ready')
        stats = {'students':0, 'judged':0, 'errors':0}
        for p in profiles:
            try:
                await self.student(p, notices)
                stats['students'] += 1
                stats['judged'] += len(notices)
            except Exception as exc:
                log.warning('student pipeline failed type=%s', type(exc).__name__)
                stats['errors'] += 1
        return stats

    async def student(self, p, notices):
        uid = p['user_id']
        if p.get('consent_agreed_at') is None:
            await self.write('DELETE', 'eligibility', params={'user_id':'eq.' + uid})
            await self.write('DELETE', 'todos', params={'user_id':'eq.' + uid,'done':'eq.false','reason':'like.' + AUTO_REASON + '*'})
            return
        scope = p.get('assistant_scope') or {}
        grades = await self.rows('grades', user_id='eq.' + uid) if scope.get('grades', True) else []
        todos = await self.rows('todos', user_id='eq.' + uid, source_kind='eq.notice')
        by_notice = {t['source_id']:t for t in todos}
        applied = {a['notice_id'] for a in await self.rows('scholarship_applications', user_id='eq.' + uid)}
        for n in notices:
            verdict, reasons = verdict_for(n, p, grades)
            await self.write('POST', 'eligibility', params={'on_conflict':'user_id,notice_id'},
                headers={'Prefer':'resolution=merge-duplicates'}, json={'user_id':uid,'notice_id':n['id'],'verdict':verdict,'reasons':reasons})
            deadline = datetime.fromisoformat(n['deadline'].replace('Z','+00:00')) if n.get('deadline') else None
            active = deadline is None or deadline >= self.now
            old = by_notice.get(n['id'])
            if verdict == 'ineligible' or not active or n['id'] in applied:
                if old and not old['done'] and old['reason'].startswith(AUTO_REASON):
                    await self.write('DELETE','todos',params={'id':f"eq.{old['id']}",'done':'eq.false'})
                continue
            # 일반 안내를 무기한 할 일로 만들지 않는다.
            if n['category'] in ('학사','장학') and (deadline or n['category'] == '장학'):
                if old is None or (not old['done'] and old['reason'].startswith(AUTO_REASON)):
                    kind = 'scholarship' if n['category'] == '장학' else 'deadline'
                    if n['id'] not in self.severities:
                        self.severities[n['id']] = await run_in_threadpool(tasks.severity, kind, n['title'])
                    severity = self.severities[n['id']]
                    due = deadline.astimezone(KST).date() if deadline else None
                    facts = ' · '.join(reasons) or '공지 대상에 해당해요. 원문 조건을 확인해 주세요.'
                    # 근거가 바뀐 경우만 문장을 다시 생성. 원래 판정 근거도 함께 남긴다.
                    if old and old['reason'].endswith('\n근거: ' + facts):
                        explanation = old['reason']
                    else:
                        text = await run_in_threadpool(tasks.explain_reason, n['title'], verdict, reasons)
                        explanation = AUTO_REASON + (text if isinstance(text,str) and text.strip() else facts) + '\n근거: ' + facts
                    value = {'user_id':uid,'source_kind':'notice','source_id':n['id'],'type':kind,
                        'title':n['title'][:200], 'due_date':due.isoformat() if due else None,
                        'reason':explanation,
                        'link':n['url'],'priority':priority(severity,d_day(due,self.now.astimezone(KST).date()))}
                    # 완료 여부를 보내지 않아 학생이 동시에 완료한 상태를 유지한다.
                    await self.write('POST','todos',params={'on_conflict':'user_id,source_kind,source_id'},
                        headers={'Prefer':'resolution=merge-duplicates'},json=value)
            await self.notify(p,'notice',n['title'],n['id'])

    async def reminders(self, user_id=None):
        profiles = await self.rows('profiles', **({'user_id':'eq.' + str(user_id)} if user_id else {}))
        today = self.now.astimezone(KST).date()
        for p in profiles:
            if p.get('consent_agreed_at') is None:
                continue
            for t in await self.rows('todos', user_id='eq.' + p['user_id'], done='eq.false'):
                if t.get('due_date') and (date.fromisoformat(t['due_date']) - today).days in (0,1):
                    await self.notify(p,'deadline',t['title'],t['id'], 'due:' + t['due_date'] + ':' + today.isoformat(), scheduled=True)
            if (p.get('assistant_scope') or {}).get('status', True):
                for e in await self.rows('academic_calendar', start_date='eq.' + today.isoformat()):
                    if not e.get('target_grades') or p.get('grade') in e['target_grades']:
                        await self.notify(p,'calendar',e['title'],e['id'],'start:' + today.isoformat(),scheduled=True)


@asynccontextmanager
async def pipeline_client():
    settings = Settings.from_env()
    secret = os.getenv('SUPABASE_SECRET_KEY','').strip()
    if not secret:
        raise RuntimeError('서버 전용 Supabase 키가 필요합니다.')
    async with httpx.AsyncClient(base_url=settings.supabase_url, timeout=30,
        headers={'apikey':secret,'Authorization':'Bearer ' + secret}) as database, httpx.AsyncClient(timeout=15) as push:
        sender = NotificationSender(database,push,push_enabled=os.getenv('PUSH_ENABLED','false').lower() == 'true',
                                    access_token=os.getenv('EXPO_ACCESS_TOKEN') or None)
        yield Pipeline(database,sender)


async def refresh_student(user_id):
    """저장 성공 뒤 실패해도 저장 결과는 유지. 아침 전체 재계산으로 복구한다."""
    if not os.getenv('SUPABASE_SECRET_KEY','').strip():
        return
    try:
        async with pipeline_client() as pipeline:
            await pipeline.recalculate(user_id)
    except Exception as exc:
        log.warning('student refresh deferred type=%s', type(exc).__name__)
