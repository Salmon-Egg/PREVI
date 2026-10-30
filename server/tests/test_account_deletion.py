import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app

UID = str(uuid4())


@pytest.mark.parametrize('result,expected',[(200,204),(204,204),(403,503),(500,503)])
def test_delete_only_verified_account(monkeypatch,result,expected):
    monkeypatch.setenv('SUPABASE_SECRET_KEY','test-server-secret')
    deletes = []
    def handler(request):
        if request.url.path == '/auth/v1/user':
            assert request.headers['apikey'] == 'public-key'
            return httpx.Response(200,json={'id':UID,'email':'fake@skuniv.ac.kr','email_confirmed_at':'2026-10-28T00:00:00Z'})
        if request.url.path == '/rest/v1/lost_items':
            return httpx.Response(200,json=[])
        deletes.append(request)
        assert request.method == 'DELETE'
        assert request.url.path == '/auth/v1/admin/users/' + UID
        assert request.headers['apikey'] == 'test-server-secret'
        assert request.headers['Authorization'] == 'Bearer test-server-secret'
        return httpx.Response(result)
    with TestClient(create_app(Settings('https://example.supabase.co','public-key'),httpx.MockTransport(handler))) as app:
        response = app.delete('/me',headers={'Authorization':'Bearer student-token'})
        assert response.status_code == expected
        assert len(deletes) == 1
        assert 'test-server-secret' not in response.text


@pytest.mark.parametrize('photo_result,expected,account_deleted',[(200,204,True),(500,503,False)])
def test_photos_deleted_before_account(monkeypatch,photo_result,expected,account_deleted):
    monkeypatch.setenv('SUPABASE_SECRET_KEY','test-server-secret')
    calls = []
    def handler(request):
        path = request.url.path
        if path == '/auth/v1/user':
            return httpx.Response(200,json={'id':UID,'email':'fake@skuniv.ac.kr','email_confirmed_at':'2026-10-28T00:00:00Z'})
        if path == '/rest/v1/lost_items':
            assert request.url.params['user_id'] == 'eq.' + UID
            return httpx.Response(200,json=[{'image_path':UID + '/a.jpg'}])
        calls.append(path)
        if path == '/storage/v1/object/lost-items':
            assert json.loads(request.content) == {'prefixes':[UID + '/a.jpg']}
            return httpx.Response(photo_result,json={})
        assert path == '/auth/v1/admin/users/' + UID
        return httpx.Response(200)
    with TestClient(create_app(Settings('https://example.supabase.co','public-key'),httpx.MockTransport(handler))) as app:
        assert app.delete('/me',headers={'Authorization':'Bearer student-token'}).status_code == expected
    assert calls == ['/storage/v1/object/lost-items'] + (['/auth/v1/admin/users/' + UID] if account_deleted else [])


def test_no_login_never_deletes_account(monkeypatch):
    monkeypatch.setenv('SUPABASE_SECRET_KEY','test-server-secret')
    def handler(request):
        raise AssertionError('unauthenticated request reached Supabase')
    with TestClient(create_app(Settings('https://example.supabase.co','public-key'),httpx.MockTransport(handler))) as app:
        assert app.delete('/me').status_code == 401


def test_missing_server_key_never_claims_deleted(monkeypatch):
    monkeypatch.setenv('SUPABASE_SECRET_KEY','')
    def handler(request):
        assert request.url.path == '/auth/v1/user'
        return httpx.Response(200,json={'id':UID,'email':'fake@skuniv.ac.kr','email_confirmed_at':'2026-10-28T00:00:00Z'})
    with TestClient(create_app(Settings('https://example.supabase.co','public-key'),httpx.MockTransport(handler))) as app:
        assert app.delete('/me',headers={'Authorization':'Bearer student-token'}).status_code == 503
