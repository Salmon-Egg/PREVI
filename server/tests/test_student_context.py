from server.logic.student_context import calendar_applies, notice_target
from server.jobs.pipeline import verdict_for


PROFILE = {'grade':2,'semester':2,'department':'소프트웨어학과','status':'leave','assistant_scope':{}}


def test_lecture_evaluation_does_not_match_student_on_leave_when_ai_omits_status():
    notice = {'title':'중간강의평가 실시 안내','target':{},'conditions':{}}
    assert verdict_for(notice,PROFILE,[])[0] == 'ineligible'
    assert verdict_for(notice,{**PROFILE,'status':'enrolled'},[])[0] == 'eligible'


def test_explicit_leave_target_is_not_overwritten():
    notice = {'title':'휴학생 강의평가 관련 안내','target':{'statuses':['leave']}}
    assert notice_target(notice)['statuses'] == ['leave']


def test_leave_calendar_excludes_evaluation_but_keeps_return_application():
    assert not calendar_applies({'title':'중간강의평가','target_grades':[]},PROFILE)
    assert calendar_applies({'title':'휴학·복학 신청','target_grades':[]},PROFILE)
    assert not calendar_applies({'title':'학사일정','target_grades':[4]},PROFILE)
    assert not calendar_applies({'title':'중간 강의 평가','target_grades':[]},PROFILE)
