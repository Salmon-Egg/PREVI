"""졸업 확인 목록의 표시 문구. 상세 조건은 DB JSON의 details에 보존한다."""
import re


COMMON_LABELS = {
    '교양필수 창의·문제해결역량': '필수교양 · 창의·문제해결 (택1)',
    '교양필수 대인관계역량': '필수교양 · 대인관계 (택1)',
    '교양필수 영어1': '필수교양 · 영어 1',
    '교양필수 영어2': '필수교양 · 영어 2',
    '교양필수 자기계발역량': '필수교양 · 자기계발 (택1)',
    '교양필수 실무역량': '필수교양 · 실무 (택1)',
    '교양선택:': '선택교양 · 5개 영역, 총 15학점',
    '교양 이수면제·대체재수강': '면제·대체이수 인정 확인',
    '교양 필수·선택 영역과 학과 지정 필수 교과목 전체 확인': '학과 지정 필수과목 확인',
}


def clean_label(value):
    value = re.sub(r'https?://\S+', '', value)
    value = re.sub(r'^(?:확인 필요:\s*)+', '', value).strip()
    return re.sub(r'\s+', ' ', value).strip(' .·—-')


def compact_rule(rule):
    courses=[]
    for original in rule['required_courses']:
        course=dict(original)
        name=course['name']
        label=next((v for k,v in COMMON_LABELS.items() if name.startswith(k)), None)
        if not label and name.startswith('교양선택 5개 영역'):
            label='선택교양 · 5개 영역 확인'
        if label:
            course['details']=course.get('details') or name
            course['name']=label
        else:
            cleaned='\n'.join(clean_label(line) for line in name.splitlines())
            if cleaned != name:
                course['details']=course.get('details') or name
                course['name']=cleaned or '세부 졸업요건 확인'
        # 택1 과목을 모두 필수로 표시하지 않도록 선택지는 별도 줄로 제한한다.
        if label and ' — ' in name:
            options=name.split(' — ',1)[1].split(' / ')
            preview=' · '.join(options[:2])
            if len(options)>2:preview+=' 등'
            course['name']+='\n'+preview
        courses.append(course)
    if rule.get('certifications'):
        courses.append({'name':'학과별 추가 졸업요건 확인', 'manual':True,
                        'details':list(rule['certifications'])})
    return {'required_courses':courses, 'certifications':[]}
