"""공지(A-1, S-2) · 장학(S-1, S-3) · 학사일정(A-2) · 졸업 요건(L-1, L-2) · 과목 검색(L-5)."""
from fastapi import APIRouter, Depends

import agent
import db
from auth import current_user
from errors import ApiError, not_found
from logic.eligibility import matches_target
from logic.schedule import d_day

router = APIRouter()


def _profile(uid: str) -> dict:
    p = agent.profile_of(uid)
    if not p:
        raise ApiError(404, "NO_PROFILE", "처음 설정이 필요해요")
    return p


@router.get("/notices")
def list_notices(uid: str = Depends(current_user)):
    p = _profile(uid)
    rows = db.all_rows("select * from notices where processed_at is not null order by posted_at desc nulls last limit 50")
    return [
        {"id": n["id"], "title": n["title"], "category": n["category"], "deadline": n["deadline"],
         "posted_at": n["posted_at"], "summary": n["summary"][:1]}
        for n in rows if matches_target(n["target"], p)  # 나에게 해당하는 공지만
    ]


@router.get("/notices/{notice_id}")
def get_notice(notice_id: int, uid: str = Depends(current_user)):
    n = db.one("select * from notices where id = %s", [notice_id])
    if not n:
        raise not_found("공지")
    e = db.one("select verdict, reasons from eligibility where user_id = %s and notice_id = %s", [uid, notice_id])
    todo = db.one("select id from todos where user_id = %s and source_kind = 'notice' and source_id = %s and not done",
                  [uid, notice_id])
    applied = db.one("select 1 from scholarship_applications where user_id = %s and notice_id = %s", [uid, notice_id])
    return {
        "id": n["id"], "title": n["title"], "category": n["category"], "summary": n["summary"],
        "deadline": n["deadline"], "documents": n["documents"], "url": n["url"], "posted_at": n["posted_at"],
        "eligibility": e, "todo_id": todo and todo["id"], "applied": applied is not None,  # S-2 신청 완료 체크용
    }


@router.get("/scholarships")
def scholarships(uid: str = Depends(current_user)):
    rows = db.all_rows(
        """select e.notice_id, n.title, n.deadline, e.verdict, e.reasons,
                  exists (select 1 from scholarship_applications a where a.user_id = e.user_id and a.notice_id = e.notice_id) as applied
           from eligibility e join notices n on n.id = e.notice_id
           where e.user_id = %s and (n.deadline is null or n.deadline >= now())
           order by case e.verdict when 'eligible' then 0 when 'check' then 1 else 2 end, n.deadline""",
        [uid],
    )
    return rows


@router.get("/scholarship-applications")
def applications(uid: str = Depends(current_user)):
    return db.all_rows(
        """select a.notice_id, n.title, a.applied_at from scholarship_applications a join notices n on n.id = a.notice_id
           where a.user_id = %s order by a.applied_at desc""",
        [uid],
    )


@router.get("/calendar")
def calendar(uid: str = Depends(current_user)):
    p = _profile(uid)
    today = agent.today()
    rows = db.all_rows(
        """select id, title, start_date, end_date, description from academic_calendar
           where (target_grades is null or %s = any(target_grades)) and coalesce(end_date, start_date) >= %s - 30
           order by start_date""",
        [p["grade"], today],
    )
    return [{**r, "d_day": d_day(r["start_date"], today)} for r in rows]


@router.get("/graduation")
def graduation(uid: str = Depends(current_user)):
    p = _profile(uid)
    g = agent.graduation_of(p, agent.grades_of(uid))
    if not g:
        raise ApiError(404, "NO_REQUIREMENT", "이 학과의 졸업 기준이 아직 없어요")
    return g


@router.get("/courses")
def courses(q: str = "", _: str = Depends(current_user)):
    return db.all_rows("select id, name, credits, area, times from courses where name like %s order by name limit 30",
                       [f"%{q}%"])
