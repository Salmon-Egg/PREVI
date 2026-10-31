import base64
import io
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from server.config import Settings
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer student-token"}
ROW = {"id": 1, "created_at": "2026-10-30T09:00:00+09:00", "user_id": str(uuid4()), "title": "에어팟", "category": "전자기기",
       "place": "북악관 3층", "found_on": "2026-10-29", "description": "", "image_path": None, "question": "스티커 색은?", "status": "open"}
BODY = {"title": "에어팟", "category": "전자기기", "place": "북악관 3층", "found_on": "2026-10-29",
        "question": "스티커 색은?", "answer": "노란색", "storage_place": "학생지원팀"}


def encoded_photo(format="JPEG", **options):
    out = io.BytesIO()
    Image.new("RGB", (4, 2), "red").save(out, format=format, **options)
    return base64.b64encode(out.getvalue()).decode()


JPEG = encoded_photo()


def client_for(db):
    def handler(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_list_never_asks_for_answer_or_storage_place():
    def db(request):
        select = request.url.params["select"]
        assert "answer" not in select and "storage_place" not in select
        assert request.url.params["status"] == "eq.open"
        return httpx.Response(200, json=[{**ROW, "image_path": "u/a.jpg"}])
    with client_for(db) as client:
        item = client.get("/lost-items", headers=HEADERS).json()[0]
    assert item["mine"] is False and "user_id" not in item
    assert item["image_url"] == "https://example.supabase.co/storage/v1/object/public/lost-items/u/a.jpg"


def test_detail_keeps_found_place_and_adds_storage_place():
    def db(request):
        if request.url.path == "/rest/v1/rpc/lost_item_place":
            assert json.loads(request.content) == {"p_item": 1, "p_answer": None}
            return httpx.Response(200, json=[{"storage_place": None, "tries_left": 2}])
        return httpx.Response(200, json=[ROW])
    with client_for(db) as client:
        item = client.get("/lost-items/1", headers=HEADERS).json()
    assert item["place"] == "북악관 3층" and item["storage_place"] is None and item["tries_left"] == 2


def test_create_uploads_photo_to_own_folder_with_sniffed_type():
    calls = []
    def db(request):
        calls.append(request)
        if request.url.path.startswith("/storage/"):
            return httpx.Response(200, json={})
        payload = json.loads(request.content)
        assert "image_base64" not in payload and "user_id" not in payload
        return httpx.Response(201, json=[{**ROW, "user_id": USER_ID, "image_path": payload["image_path"]}])
    with client_for(db) as client:
        res = client.post("/lost-items", headers=HEADERS, json={**BODY, "image_base64": JPEG})
    assert res.status_code == 200 and res.json()["mine"] is True
    upload = calls[0]
    assert upload.url.path.startswith(f"/storage/v1/object/lost-items/{USER_ID}/") and upload.url.path.endswith(".jpeg")
    assert upload.headers["content-type"] == "image/jpeg"


def test_create_rejects_non_image_without_calls():
    with client_for(lambda r: (_ for _ in ()).throw(AssertionError("호출되면 안 됨"))) as client:
        res = client.post("/lost-items", headers=HEADERS, json={**BODY, "image_base64": base64.b64encode(b"<html>").decode()})
    assert res.status_code == 400


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
def test_create_removes_location_and_keeps_orientation(format):
    exif = Image.Exif()
    exif[0x0112] = 6  # 90도 돌려 찍음
    exif.get_ifd(0x8825)[1] = "N"  # GPS
    photo = encoded_photo(format, exif=exif, **({"xmp": b"<x:gps>secret</x:gps>"} if format != "PNG" else {}))
    assert base64.b64decode(photo).count(b"secret") == (0 if format == "PNG" else 1)
    uploads = []
    def db(request):
        if request.url.path.startswith("/storage/"):
            uploads.append(request.content)
            return httpx.Response(200, json={})
        return httpx.Response(201, json=[{**ROW, "user_id": USER_ID, "image_path": json.loads(request.content)["image_path"]}])
    with client_for(db) as client:
        assert client.post("/lost-items", headers=HEADERS, json={**BODY, "image_base64": photo}).status_code == 200
    with Image.open(io.BytesIO(uploads[0])) as saved:
        assert saved.format == format and saved.size == (2, 4) and not saved.getexif()
        assert "xmp" not in saved.info
    assert b"secret" not in uploads[0]


def test_create_rejects_broken_photo_without_calls():
    with client_for(lambda r: (_ for _ in ()).throw(AssertionError("호출되면 안 됨"))) as client:
        res = client.post("/lost-items", headers=HEADERS, json={**BODY, "image_base64": base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 20).decode()})
    assert res.status_code == 400


def test_create_removes_photo_when_row_fails():
    methods = []
    def db(request):
        methods.append((request.method, request.url.path.split("/")[1]))
        if request.url.path.startswith("/storage/"):
            return httpx.Response(200, json={})
        return httpx.Response(500, json={})
    with client_for(db) as client:
        assert client.post("/lost-items", headers=HEADERS, json={**BODY, "image_base64": JPEG}).status_code == 500
    assert methods == [("POST", "storage"), ("POST", "rest"), ("DELETE", "storage")]


def test_claim_wrong_exhausted_and_right():
    answers = iter([[{"storage_place": None, "tries_left": 1}], [{"storage_place": None, "tries_left": 0}],
                    [{"storage_place": "학생지원팀", "tries_left": 3}]])
    with client_for(lambda r: httpx.Response(200, json=next(answers))) as client:
        wrong = client.post("/lost-items/1/claim", headers=HEADERS, json={"answer": "파랑"})
        done = client.post("/lost-items/1/claim", headers=HEADERS, json={"answer": "파랑"})
        right = client.post("/lost-items/1/claim", headers=HEADERS, json={"answer": "노란색"})
    assert wrong.status_code == 400 and "1번" in wrong.json()["error"]["message"]
    assert done.status_code == 429
    assert right.json()["storage_place"] == "학생지원팀"
