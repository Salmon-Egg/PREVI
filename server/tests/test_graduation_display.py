from server.logic.graduation_display import compact_rule, clean_label
from server.logic.graduation import calculate_graduation


def test_compaction_preserves_conditions_and_status_without_showing_urls():
    source='필수 기준 https://www.skuniv.ac.kr/notice/123'
    rule={'total_credits':120,'areas':[], 'required_courses':[
        {'name':'운영체제'},
        {'name':'교양필수 영어1: 다음 중 1과목 또는 공식 이수면제 — World Wide English 1 / Global English 1 / College English 1','manual':True}],
        'certifications':[source,'학과 졸업작품 심사 및 전공 48학점 확인']}
    compact=compact_rule(rule)
    assert compact['required_courses'][0]=={'name':'운영체제'}
    assert compact['required_courses'][-1]['details']==rule['certifications']
    assert compact['certifications']==[]
    result=calculate_graduation([], {**rule,**compact})
    assert result['requirements'][0]['done'] is False
    assert all(x['done'] is None for x in result['requirements'][1:])
    assert not any('http' in x['name'] for x in result['requirements'])
    assert compact_rule({**rule,**compact})==compact


def test_clean_label_removes_source_url_and_duplicate_status_prefix():
    assert clean_label('확인 필요: 확인 필요: 졸업작품 확인 https://example.org/test')=='졸업작품 확인'
