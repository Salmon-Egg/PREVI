import asyncio
import hashlib
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.notify import NotificationSender

USER_ID = str(uuid4())
HEADERS = {"Authorization":"Bearer student-token"}
ROW = {"id":1,"type":"calendar","title":"일정 안내","target_id":2,"read":False,"sent_at":"2026-10-27T09:00:00+09:00"}
TOKEN = "ExpoPushToken[test-device-token]"


def client_for(db):
    def handler(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200,json={"id":USER_ID,"email":"student@skuniv.ac.kr","email_confirmed_at":"2026-10-27T00:00:00Z"})
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co","test-key"),httpx.MockTransport(handler)))


def test_notification_api_owner_filter_and_private_fields_excluded():
    def db(request):
        assert request.url.params["user_id"] == "eq."+USER_ID
        assert request.url.params["select"] == "id,type,title,target_id,read,sent_at"
        return httpx.Response(200,json=[ROW])
    with client_for(db) as client:
        assert client.get("/notifications",headers=HEADERS).json() == [ROW]
        assert client.get("/notifications").status_code == 401


def test_read_patch_only_updates_read():
    def db(request):
        assert request.url.params["user_id"] == "eq."+USER_ID
        assert request.url.params["id"] == "eq.1"
        assert json.loads(request.content) == {"read":True}
        return httpx.Response(200,json=[{**ROW,"read":True}])
    with client_for(db) as client:
        assert client.patch("/notifications/1",headers=HEADERS,json={"read":True}).json()["read"] is True


@pytest.mark.parametrize("payload",[{"read":"false"},{"read":True,"user_id":USER_ID},{"read":1}])
def test_notification_patch_rejects_invalid_or_extra_fields(payload):
    with client_for(lambda request:pytest.fail("잘못된 값을 DB에 보내면 안 됨")) as client:
        assert client.patch("/notifications/1",headers=HEADERS,json=payload).status_code == 400


def test_other_notification_missing():
    with client_for(lambda request:httpx.Response(200,json=[])) as client:
        assert client.patch("/notifications/9",headers=HEADERS,json={"read":True}).status_code == 404


def run_send(*,token=TOKEN,enabled=True,skipped=None,push_status=200,push_json=None,network_error=False):
    updates, requests = [], []
    def db(request):
        if request.url.path.endswith("reserve_notification"):
            payload=json.loads(request.content)
            assert payload["p_user_id"]==USER_ID
            return httpx.Response(200,json={"skipped":skipped} if skipped else {"notification":ROW,"push_token":token})
        if request.method=="PATCH":
            updates.append(json.loads(request.content))
            return httpx.Response(204)
        if request.url.path.endswith("profiles"):
            return httpx.Response(200,json=[{"push_token":token}])
        pytest.fail("Unexpected DB call")
    def push(request):
        assert "apikey" not in request.headers
        assert request.headers.get("authorization")=="Bearer expo-test-access"
        requests.append(request)
        if network_error: raise httpx.ReadTimeout("private transport detail",request=request)
        return httpx.Response(push_status,json=push_json if push_json is not None else {"data":{"status":"ok","id":"ticket-1"}})
    async def scenario():
        async with httpx.AsyncClient(base_url="https://example.supabase.co",transport=httpx.MockTransport(db)) as database:
            async with httpx.AsyncClient(transport=httpx.MockTransport(push)) as expo:
                return await NotificationSender(database,expo,push_enabled=enabled,access_token="expo-test-access").send(USER_ID,"calendar","일정 안내",2)
    return asyncio.run(scenario()), updates, requests


@pytest.mark.parametrize("reason",["duplicate","disabled","profile_missing","target_unavailable"])
def test_reservation_skip_never_sends(reason):
    result,updates,requests=run_send(skipped=reason)
    assert result=={"status":"skipped","reason":reason}
    assert not updates and not requests


@pytest.mark.parametrize("token,enabled",[(None,True),("invalid-token",True),(TOKEN,False)])
def test_in_app_without_real_push(token,enabled):
    result,updates,requests=run_send(token=token,enabled=enabled)
    assert result["status"]=="in_app"
    assert updates==[{"delivery_status":"in_app"}]
    assert requests==[]


def test_push_payload_matches_notification_api_data():
    result,updates,requests=run_send()
    assert result["status"]=="accepted"
    payload=json.loads(requests[0].content)
    assert payload["data"]=={"type":"calendar","title":"일정 안내","target_id":2}
    assert payload["to"]==TOKEN
    assert updates[-1]=={"delivery_status":"accepted","push_ticket_id":"ticket-1"}
    assert updates[0]["push_token_hash"]==hashlib.sha256(TOKEN.encode()).hexdigest()


def test_uncertain_network_never_retries():
    result,updates,requests=run_send(network_error=True)
    assert result["status"]=="unknown"
    assert len(requests)==1
    assert updates[-1]["error_code"]=="TRANSPORT_UNKNOWN"


@pytest.mark.parametrize("status,expected",[(429,"failed"),(400,"failed"),(503,"unknown")])
def test_http_failure_not_recorded_as_accepted(status,expected):
    result,updates,requests=run_send(push_status=status)
    assert result["status"]==expected and len(requests)==1


def test_malformed_ticket_is_unknown():
    result,updates,requests=run_send(push_json={"data":[]})
    assert result["status"]=="unknown"
    assert updates[-1]["error_code"]=="INVALID_PUSH_RESPONSE"


def test_device_not_registered_clears_only_matching_token():
    result,updates,requests=run_send(push_json={"data":{"status":"error","details":{"error":"DeviceNotRegistered"}}})
    assert result["status"]=="failed"
    assert updates[-1]=={"push_token":None}


@pytest.mark.parametrize("receipt,expected",[(None,"accepted"),({"status":"ok"},"delivered"),({"status":"error","details":{"error":"InvalidCredentials"}},"failed")])
def test_receipt_handling(receipt,expected):
    updates=[]
    def db(request):
        if request.method=="PATCH":
            updates.append(json.loads(request.content)); return httpx.Response(204)
        return httpx.Response(200,json=[{"id":1,"user_id":USER_ID,"delivery_status":"accepted","push_ticket_id":"ticket-1","push_token_hash":"hash"}])
    def push(request):
        assert json.loads(request.content)=={"ids":["ticket-1"]}
        return httpx.Response(200,json={"data":{"ticket-1":receipt} if receipt is not None else {}})
    async def scenario():
        async with httpx.AsyncClient(base_url="https://example.supabase.co",transport=httpx.MockTransport(db)) as database:
            async with httpx.AsyncClient(transport=httpx.MockTransport(push)) as expo:
                return await NotificationSender(database,expo).check_receipt(1)
    assert asyncio.run(scenario())["status"]==expected
    if expected=="accepted": assert not updates


def test_new_device_token_is_not_deleted_for_old_receipt():
    patches=[]
    def db(request):
        if request.method=="PATCH": patches.append(request); return httpx.Response(204)
        return httpx.Response(200,json=[{"push_token":"ExpoPushToken[new-device]"}])
    async def scenario():
        async with httpx.AsyncClient(base_url="https://example.supabase.co",transport=httpx.MockTransport(db)) as database:
            async with httpx.AsyncClient() as expo:
                await NotificationSender(database,expo).clear_invalid_token(USER_ID,hashlib.sha256(TOKEN.encode()).hexdigest())
    asyncio.run(scenario())
    assert not patches
