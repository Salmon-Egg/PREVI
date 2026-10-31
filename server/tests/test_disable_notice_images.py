from server.jobs.attachments import MARK
from server.jobs.image_ocr import REVIEW
from server.scripts.requeue_without_image_text import correction


def test_only_marked_attachment_content_is_removed_and_derived_values_reset():
    notice = {'body': '학교 원문' + MARK + 'PDF 내용\n' + REVIEW + '\n잘못된 숫자 150점',
              'attachments': [{'file_key': '2026/10/a.png'}], 'url': 'https://www.skuniv.ac.kr/test'}
    patch = correction(notice)
    assert patch['body'] == '학교 원문' and patch['extraction_status'] == 'pending'
    assert patch['deadline'] is None and patch['target'] == {} and patch['documents'] == []
    assert '재확인' in patch['conditions']['unknown'][0]
    assert 'attachments' not in patch and 'url' not in patch
    assert correction({**notice, **patch}) is None


def test_unmarked_or_text_only_notices_are_preserved():
    for body in ('원문', '원문' + MARK + 'HWP 글자', REVIEW + '원문에는 표시가 있지만 추출분 없음'):
        assert correction({'body': body}) is None
