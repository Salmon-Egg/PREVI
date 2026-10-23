"""내 컴퓨터에 연습용 Postgres(+pgvector) 켜기. Supabase 없이 서버를 돌려 볼 때만 씁니다.
출력되는 DATABASE_URL을 .env에 넣으면 됩니다. 컴퓨터를 껐다 켜면 다시 실행하세요.

※ Windows에서는 Postgres가 한글 경로를 못 읽습니다. 레포가 '공모전' 같은 한글 폴더 안에 있으면
  pgserver를 한글 없는 경로의 가상환경에 따로 설치해서 실행하세요.
    python -m venv C:\\pgenv
    C:\\pgenv\\Scripts\\pip install pgserver
    C:\\pgenv\\Scripts\\python server\\scripts\\local_db.py
데이터 폴더도 같은 이유로 사용자 폴더 아래 .seokyeong-localdb 에 둡니다."""
from pathlib import Path

import pgserver

server = pgserver.get_server(Path.home() / ".seokyeong-localdb", cleanup_mode=None)  # 창을 닫아도 계속 켜 둠
print("DATABASE_URL=" + server.get_uri())
