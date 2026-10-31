"""테스트 데이터 정리: 제출용 두 계정만 남기고, 확인이 안 되면 멈춘다."""
import pytest

from server.scripts.reset_test_data import split_accounts

ADMIN = {'id': 'a', 'email': 'test_admin@example.com', 'app_metadata': {'submission_account': 'test_admin'}}
STUDENT = {'id': 's', 'email': 'test_student@example.com', 'app_metadata': {'submission_account': 'test_student'}}
OTHER = {'id': 'o', 'email': '20210004@skuniv.ac.kr', 'app_metadata': {}}


def test_only_submission_accounts_are_kept():
    assert split_accounts([OTHER, ADMIN, STUDENT]) == ([ADMIN, STUDENT], [OTHER])


@pytest.mark.parametrize('users', [
    [ADMIN, OTHER],
    # 이메일만 같고 인증 서버 표시가 없는 계정은 제출용으로 보지 않는다
    [ADMIN, {**STUDENT, 'app_metadata': {}}],
])
def test_stops_when_submission_accounts_are_missing(users):
    with pytest.raises(SystemExit):
        split_accounts(users)
