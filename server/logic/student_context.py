"""학적별 명확한 적용 범위. AI 대상 누락을 재학생 전용 안내에 한해 보완한다."""

ENROLLED_ONLY = ('강의평가', '수강정정', '중간시험', '기말시험', '정기시험', '중간고사', '기말고사')


def enrolled_activity(title):
    return any(word in ''.join(title.split()) for word in ENROLLED_ONLY)


def notice_target(notice):
    target = dict(notice.get('target') or {})
    # AI가 휴학생도 명시한 안내라면 제목 규칙으로 덮어쓰지 않는다.
    if 'leave' not in (target.get('statuses') or []) and enrolled_activity(notice.get('title','')):
        target['statuses'] = ['enrolled','returned']
    return target


def calendar_applies(event, profile):
    if event.get('target_grades') and profile.get('grade') not in event['target_grades']:
        return False
    if profile.get('status') == 'leave' and enrolled_activity(event.get('title','')):
        return False
    return True
