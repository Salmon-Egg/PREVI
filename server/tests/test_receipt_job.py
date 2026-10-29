import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest

from server.jobs import daily_check
from server.notify import NotificationSender, RECEIPT_URL

NOW = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)
TOKEN = 'ExpoPushToken[old-device]'
ROW = {'id':1, 'user_id':'student', 'delivery_status':'accepted', 'push_ticket_id':'ticket-1',
       'push_token_hash':hashlib.sha256(TOKEN.encode()).hexdigest(), 'sent_at':'2026-10-29T11:30:00+00:00'}


def scenario(rows, receipts=None, failure=False, current_token=TOKEN):
    patches, requests = [], []

    def database(request):
        if request.method == 'PATCH':
            patches.append((request.url.path, dict(request.url.params), json.loads(request.content)))
            return httpx.Response(204)
        if request.url.path.endswith('/profiles'):
            return httpx.Response(200, json=[{'push_token':current_token}])
        assert request.url.params['delivery_status'] == 'eq.accepted'
        assert request.url.params['sent_at'] == 'lte.2026-10-29T11:45:00+00:00'
        assert request.url.params['limit'] == '1000'
        assert request.url.params['order'] == 'sent_at.asc,id.asc'
        return httpx.Response(200, json=rows)

    def expo(request):
        requests.append(request)
        assert str(request.url) == RECEIPT_URL
        assert 'apikey' not in request.headers
        assert request.headers['authorization'] == 'Bearer expo-only'
        if failure:
            raise httpx.ReadTimeout('test', request=request)
        return httpx.Response(200, json={'data':receipts or {}})

    async def run():
        async with httpx.AsyncClient(base_url='https://test', transport=httpx.MockTransport(database)) as db:
            async with httpx.AsyncClient(transport=httpx.MockTransport(expo)) as push:
                return await NotificationSender(db, push, access_token='expo-only').check_pending_receipts(now=NOW)

    return asyncio.run(run()), patches, requests


def test_batch_updates_success_and_failure_and_leaves_missing_receipts_pending():
    rows = [ROW, {**ROW, 'id':2, 'push_ticket_id':'ticket-2'}, {**ROW, 'id':3, 'push_ticket_id':'ticket-3'}]
    counts, patches, requests = scenario(rows, {'ticket-1':{'status':'ok'},
        'ticket-2':{'status':'error','details':{'error':'InvalidCredentials'}}})
    assert counts == {'checked':3,'delivered':1,'failed':1,'pending':1,'unknown':0,'errors':0}
    assert len(requests) == 1
    assert json.loads(requests[0].content)['ids'] == ['ticket-1','ticket-2','ticket-3']
    assert [p[2]['delivery_status'] for p in patches] == ['delivered','failed']


def test_expired_and_missing_ticket_never_reach_expo():
    counts, patches, requests = scenario([{**ROW,'sent_at':'2026-10-28T11:00:00Z'},
        {**ROW,'id':2,'push_ticket_id':None}])
    assert not requests
    assert counts['unknown'] == 2
    assert [p[2]['error_code'] for p in patches] == ['EXPO_RECEIPT_EXPIRED','MISSING_PUSH_TICKET']


def test_network_failure_keeps_accepted_for_later_result_check_without_resending():
    counts, patches, requests = scenario([ROW], failure=True)
    assert counts['errors'] == 1
    assert not patches
    assert len(requests) == 1


@pytest.mark.parametrize('new_device', [False, True])
def test_device_unregistered_only_removes_matching_old_token(new_device):
    counts, patches, _ = scenario([ROW], {'ticket-1':{'status':'error','details':{'error':'DeviceNotRegistered'}}},
        current_token='ExpoPushToken[new-device]' if new_device else TOKEN)
    assert counts['failed'] == 1
    profile_patches = [p for p in patches if p[0].endswith('/profiles')]
    assert len(profile_patches) == (0 if new_device else 1)
    if profile_patches:
        assert profile_patches[0][1]['push_token'] == 'eq.' + TOKEN


def test_empty_batch_never_calls_expo():
    counts, patches, requests = scenario([])
    assert not requests and not patches and counts['checked'] == 0


@pytest.mark.parametrize('reminders_only', [False, True])
def test_receipt_check_is_connected_to_daily_and_five_minute_job(monkeypatch, reminders_only):
    pipeline = AsyncMock()
    pipeline.sender.check_pending_receipts.return_value = {'errors':0}
    pipeline.recalculate.return_value = {'students':1,'judged':1,'errors':0}

    @asynccontextmanager
    async def client():
        yield pipeline

    monkeypatch.setattr(daily_check, 'pipeline_client', client)
    result = asyncio.run(daily_check.run(reminders_only=reminders_only))
    pipeline.sender.check_pending_receipts.assert_awaited_once()
    pipeline.reminders.assert_awaited_once()
    assert pipeline.recalculate.await_count == (0 if reminders_only else 1)
    assert result['receipts']['errors'] == 0
