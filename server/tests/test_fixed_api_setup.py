import pytest

from server.scripts.use_fixed_api import patch_script


ORIGINAL = '''#!/bin/bash
children=()
check_url() { curl --fail "$1"; }
"$tunnel" tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8000 \\
  > "$state/api.log" 2>&1 &
api_pid=$!
children+=("$api_pid")
export PREVI_API_URL
PREVI_API_URL=$(wait_url "$state/api.log" "$api_pid")
check_url "$PREVI_API_URL/health"
echo "API 연결 완료: $PREVI_API_URL"
python build_settings.py
npm run export:web -- --clear
"$tunnel" tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8095 &
web_pid=$!
children+=("$web_pid")
printf 'API: %s\\nWEB: %s\\n' "$PREVI_API_URL" "$web_url"
while kill -0 "$api_pid" 2>/dev/null &&
      kill -0 "$web_pid" 2>/dev/null; do
  sleep 5
done
exit 1
'''


def test_fixed_api_keeps_web_build_and_web_tunnel_without_recreating_api():
    result = patch_script(ORIGINAL, 'https://assigned.ngrok-free.dev/')
    assert 'export PREVI_API_URL=https://assigned.ngrok-free.dev' in result
    assert 'http://127.0.0.1:8000' not in result
    assert '$api_pid' not in result
    assert 'children+=("$web_pid")' in result
    assert 'while kill -0 "$web_pid" 2>/dev/null; do' in result
    assert 'npm run export:web -- --clear' in result
    assert 'http://127.0.0.1:8095' in result


def test_reapplying_can_change_the_fixed_origin_without_duplicate_blocks():
    first = patch_script(ORIGINAL, 'https://first.example.com')
    second = patch_script(first, 'https://next.example.com')
    assert second.count('# PREVI_FIXED_API_BEGIN') == 1
    assert 'first.example.com' not in second
    assert 'https://next.example.com' in second


@pytest.mark.parametrize('url', ['http://example.com', 'https://u:p@example.com',
                                 'https://example.com/api', 'https://example.com?token=secret',
                                 'https://example.com#fragment'])
def test_invalid_origin_is_rejected_before_file_changes(url):
    with pytest.raises(ValueError):
        patch_script(ORIGINAL, url)


def test_unrecognized_api_process_handling_is_not_silently_removed():
    changed = ORIGINAL.replace('while kill -0 "$api_pid"', 'while kill -0 "$other_pid"')
    with pytest.raises(ValueError):
        patch_script(changed, 'https://example.com')
