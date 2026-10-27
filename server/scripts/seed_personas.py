"""시연용 가상 학생 4명(app/lib/config.ts PERSONAS)의 학적·성적 넣기. 서버 키(SUPABASE_SECRET_KEY) 사용.
먼저 Supabase 대시보드 > Authentication > Add user로 '학번@skuniv.ac.kr' 계정 4개를 만들어야 함 (Auto Confirm 체크).
저장소 맨 위 폴더에서:  python -m server.scripts.seed_personas   (다시 실행해도 됨: 학적은 덮어쓰고 홍길동 성적은 지우고 새로 넣음)
계정을 만들지는 않음. 없는 학생은 건너뜀."""
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# (학번, 이름, 학과, 학년, 학기, 입학년도) — 앱 예시 데이터(app/mocks)와 같게
PERSONAS = [
    ("20260001", "김새내", "소프트웨어학과", 1, 2, 2026),
    ("20250002", "이도전", "소프트웨어학과", 2, 2, 2025),
    ("20240003", "박바뻐", "전자컴퓨터공학과", 3, 2, 2024),
    ("20210004", "홍길동", "소프트웨어학과", 4, 2, 2021),
]
# 홍길동 성적 (app/mocks/index.ts AREA_COURSES): 영역 → [(학기, 과목, 학점, 성적)]
HONG_GRADES = {
    "전공 필수": [("1-1", "프로그래밍기초", 3, "A+"), ("1-2", "자료구조", 3, "A0"), ("2-1", "컴퓨터구조", 3, "B+"), ("2-1", "이산수학", 3, "A0"),
              ("2-2", "알고리즘", 3, "A+"), ("2-2", "객체지향프로그래밍", 3, "A0"), ("3-1", "운영체제", 3, "B+"), ("3-1", "데이터베이스", 3, "A0"),
              ("3-2", "컴퓨터네트워크", 3, "B0"), ("3-2", "소프트웨어공학", 3, "A0"), ("4-1", "캡스톤디자인I", 3, "A+"), ("4-1", "정보보호개론", 3, "A0")],
    "전공 선택": [("2-1", "웹프로그래밍", 3, "A+"), ("2-2", "리눅스시스템", 3, "B+"), ("2-2", "모바일프로그래밍", 3, "A0"), ("3-1", "인공지능개론", 3, "B+"),
              ("3-1", "컴파일러", 3, "B0"), ("3-1", "클라우드컴퓨팅", 3, "A0"), ("3-2", "머신러닝", 3, "A0"), ("3-2", "빅데이터처리", 3, "A+"),
              ("3-2", "컴퓨터그래픽스", 3, "B+"), ("4-1", "딥러닝응용", 3, "A0"), ("4-1", "분산시스템", 3, "B+"), ("4-1", "자연어처리", 3, "A+"),
              ("2-1", "시스템프로그래밍", 3, "B+"), ("1-2", "파이썬프로그래밍", 3, "A+"), ("4-1", "블록체인기초", 3, "P")],
    "교양 필수": [("1-1", "글쓰기와 소통", 2, "A+"), ("1-1", "서경인성리더십", 1, "P"), ("1-1", "대학영어I", 3, "B+"), ("1-2", "대학영어II", 3, "A0"),
              ("1-2", "미적분학", 3, "B0"), ("2-1", "진로탐색", 1, "P"), ("2-1", "사회봉사", 2, "P"), ("2-2", "창의적사고", 3, "A0")],
    "교양 선택": [("1-1", "심리학의 이해", 3, "A0"), ("1-2", "현대사회와 윤리", 3, "B+"), ("2-1", "경제학원론", 3, "B0"), ("2-2", "디자인씽킹", 3, "A+"),
              ("3-1", "영화로 보는 역사", 2, "A0"), ("3-2", "생활 속 통계", 3, "A0"), ("3-2", "창업과 리더십", 2, "B+"), ("4-1", "세계 문화 이해", 3, "A+")],
}


def main() -> None:
    url, secret = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not url or not secret:
        raise RuntimeError(".env의 SUPABASE_URL과 SUPABASE_SECRET_KEY(서버 전용)가 필요합니다.")
    headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    with httpx.Client(base_url=url, headers=headers, timeout=30) as db:
        users = db.get("/auth/v1/admin/users", params={"per_page": 1000}).raise_for_status().json()["users"]
        ids = {(u.get("email") or "").lower(): u["id"] for u in users}
        for sid, name, dept, grade, semester, year in PERSONAS:
            uid = ids.get(f"{sid}@skuniv.ac.kr")
            if not uid:
                print(f"{name}({sid}): 계정 없음 → 건너뜀")
                continue
            db.post("/rest/v1/profiles", params={"on_conflict": "user_id"}, headers={"Prefer": "resolution=merge-duplicates"}, json={
                "user_id": uid, "nickname": name, "department": dept, "grade": grade, "semester": semester,
                "status": "enrolled", "admission_year": year, "interests": ["장학금"],
                "consent_agreed_at": "2026-10-20T10:00:00+09:00",
                "notify_notice": True, "notify_deadline": True, "notify_calendar": True,
            }).raise_for_status()
            rows = 0
            if sid == "20210004":
                db.delete("/rest/v1/grades", params={"user_id": f"eq.{uid}"}).raise_for_status()
                grades = [{"user_id": uid, "term": t, "course_name": c, "credits": cr, "grade": g, "area": area}
                          for area, items in HONG_GRADES.items() for t, c, cr, g in items]
                db.post("/rest/v1/grades", json=grades).raise_for_status()
                rows = len(grades)
            print(f"{name}({sid}): 학적 저장" + (f", 성적 {rows}과목" if rows else ""))


if __name__ == "__main__":
    main()
