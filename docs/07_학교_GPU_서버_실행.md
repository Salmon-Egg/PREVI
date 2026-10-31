# 학교 GPU 서버에서 PREVI 실행하기

자동 실행 파일 생성·등록·중지 절차는 [배포 자동 실행 설정](배포_자동실행_설정.md)을 참고합니다. Linux 사용자 systemd와 Windows 작업 스케줄러를 구분합니다.

작성일: 2026-10-29 · 기준 환경: BE B GPU PC (Windows 10, RTX 4060 Ti 8GB) · 관련 문서: [AI 운영 가이드](06_AI_운영_가이드.md), [백엔드-허 할 일](백엔드-허_할일.md)

0장은 학교 서버의 확인 기록이며, 이후 본문의 GPU PC 숫자·버전은 2026-10-29 측정값입니다.
**키·비밀번호 값은 이 문서와 깃에 넣지 않습니다.** (3-3 참고)

## 0. 지금 운영 장소 (2026-10-30~)

**운영은 학교 서버에서 합니다.** BE B GPU PC(Windows, 4060 Ti 8GB)는 이제 개발·시험용입니다.

| 확인할 것 | 상태 | 이 문서에서 |
|---|---|---|
| 학교 서버 GPU 메모리 | 확인: Quadro RTX 8000 2개, 각각 49,152 MiB. 최근 사용자 출력에서 GPU 0 전체 사용량 2,129 MiB, GPU 1 전체 사용량 6,135 MiB. 다른 프로세스 사용량도 포함한 값 | 2-3 |
| Ollama·kanana 등록, GPU 실행·상주 | 확인: kanana 5.3 GB / context 4096, embeddinggemma:300m 685 MB / context 2048. 두 모델 모두 `100% GPU`, `Forever` | 2-2, 2-4 |
| 서버 `.env`·권한 | 권한 `600` 실제 출력 확인. 앞서 `AI_FAKE=0`, `DOC_MAX_DISTANCE=0.62`, `EMBED_MODEL=embeddinggemma:300m` 설정. `ADMIN_EMAILS` 저장 후 API 재시작 진행 | 3 |
| API·자동 작업 서비스 등록 | 등록 확인: Ollama·API·웹·공유·ngrok 사용자 서비스, `Linger=yes`. 수집 09·13·18시, 점검 08:50, 알림 5분 타이머. 알림 작업 10/30 03:00 오류 0건 종료 확인. 수집·아침 점검의 실제 첫 실행 성공은 별도 확인 필요 | 4-1, [배포 자동 실행 설정](배포_자동실행_설정.md) |
| 고정 API 주소·학생 웹 연결 | 확인: `https://amused-swirl-reprocess.ngrok-free.dev`. ngrok 자동 실행 등록, 공유 설정에서 고정 API 유지, 학생 웹 재빌드 후 실제 로그인·AI 답변 사용자 확인. 웹 공유 링크 자체는 임시 | 4-5 |

상세 검증 근거·미완료 항목은 [학교 서버 운영 점검 기록(2026-10-30)](학교_서버_운영_점검_20261030.md)에 기록한다. 이 표는 현재까지의 확인 결과이며 서버 재부팅 후 자동 복구나 동시 사용자 성능을 검증한 것으로 간주하지 않는다.

- **두 곳에서 동시에 돌리지 않기**: GPU PC에서 uvicorn·자동 작업(작업 스케줄러)이 켜져 있으면 학교 서버와 같은 공지를 두 번 정리하고 알림을 두 번 보냅니다. 학교 서버를 켜기 전에 GPU PC 쪽 자동 작업을 끄세요. GPU PC에서 시험만 할 때는 uvicorn만 잠깐 켜고 자동 작업은 켜지 않습니다.
- DB(Supabase)·문서 임베딩은 서버를 옮겨도 그대로입니다. 옮긴다고 `load_yoram`을 다시 돌리지 않습니다 (5-3).
- 지시문(`server/ai/prompts/*.txt`)은 학교 서버에서 `git pull`만 하면 다음 질문부터 적용됩니다 (재시작 불필요).

---

## 1. 실행할 코드

### 1-1. 저장소·브랜치·커밋

| 항목 | 값 |
|---|---|
| 저장소 | https://github.com/Salmon-Egg/front-back-kick |
| 기준 브랜치 | `통합본` (`main`은 첫 커밋 상태라 쓰지 않음) |
| 기준 커밋 | `c3fe1ca44148450236d99e582ac325ca3ce8cdbd` (2026-10-29 02:54, "Merge fe/mvp4 into 통합본") |
| 실행 대상 | `server/` (FastAPI). 앱(`app/`)은 학생 폰에서 돌아가므로 서버에는 필요 없음 |

```bash
git clone https://github.com/Salmon-Egg/front-back-kick.git
cd front-back-kick
git switch 통합본
git checkout c3fe1ca   # 이 문서 기준으로 고정할 때만 사용(detached HEAD)
# 최신으로 갱신할 때: git switch 통합본 후 git pull --ff-only
```

### 1-2. 받아야 하는 PR

- 10/29 기준 원격 브랜치(`be/*`, `fe/*`, `fix/*`, `백엔드-허`, `mvp`)는 **모두 `통합본`에 합쳐져 있음** (`git branch -r --no-merged origin/통합본` 결과 없음).
- 따라서 `통합본` 위 커밋만 받으면 되고, 따로 받을 PR은 없음.
- 확인하지 못한 것: GitHub에 열려 있는 PR 목록 (GPU PC에 `gh`가 없음). 서버에 올리기 전 GitHub의 Pull requests 탭에서 새로 열린 PR이 있는지 한 번 확인.

### 1-3. Python 버전과 패키지

| 항목 | GPU PC 실측 |
|---|---|
| Python | **3.11.7** (저장소 맨 위 `.venv`). 최소 3.10 |
| fastapi | 0.162.0 |
| uvicorn | 0.54.0 |
| httpx | 0.28.1 |
| openai | 1.109.1 (Ollama를 OpenAI 형식으로 부름) |
| pypdf | 6.21.3 (요람 PDF 읽기) |
| python-dotenv | 1.2.4 |
| beautifulsoup4 | 4.15.0 (공지 수집) |
| pytest | 9.1.1 (검사용) |

범위는 `server/requirements.txt`, `server/requirements-dev.txt`에 있음. 설치 (Linux, 저장소 맨 위 폴더):

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r server/requirements-dev.txt
.venv/bin/python -m pytest server/tests -q      # 10/29 GPU PC: 215 passed
```

### 1-4. Ollama 버전

- GPU PC: **Ollama 0.40.11**
- 학교 서버 (Linux): 같은 버전으로 설치

```bash
curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=0.40.11 sh
ollama --version
systemctl status ollama      # 설치 스크립트가 자동 실행 서비스로 등록함
```

---

## 2. 모델

### 2-1. 모델 이름과 버전

| 역할 | `.env`에 쓰는 이름 | 실제 모델 | 크기 | Ollama ID (GPU PC) |
|---|---|---|---|---|
| 대화 (공지 정리·분류·답변) | `kanana` | Kanana 1.5 8B Instruct 2505, Q4_K_M 양자화 GGUF `hf.co/mradermacher/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M` + 대화 형식 Modelfile | 4.9GB | `kanana:latest` = `4aa77ba74048` (원본 GGUF `5b8e04e58d79`) |
| 임베딩 (문서 검색) | `embeddinggemma-cpu` (8GB GPU) / `embeddinggemma:300m` (12GB 이상) | EmbeddingGemma 300M, 768차원 | 621MB | `embeddinggemma:300m` = `85462619ee72`, `embeddinggemma-cpu` = `f3655cae28a9` |
| 이미지 | `gemma3:4b` (`.env`에만 있음) | **현재 사용 안 함.** 분실물 기능이 FE mvp3에서 빠져 코드가 이 값을 읽지 않음. 받지 않아도 됨 | — | — |

- 원본: 카카오 공식 `kakaocorp/kanana-1.5-8b-instruct-2505` (Apache-2.0). 받은 GGUF는 mradermacher가 변환한 비공식 파일.
- EmbeddingGemma는 Gemma 이용약관 적용. 라이선스 기록은 [03_기술_구조.md](03_기술_구조.md).
- `embeddinggemma-cpu`와 `embeddinggemma:300m`은 **같은 모델 파일**이고 돌리는 장치만 다름 → 둘 사이를 바꿔도 다시 임베딩할 필요 없음.

### 2-2. 내려받기와 커스텀 Modelfile 적용

저장소 맨 위 폴더에서 (인터넷 필요, 한 번만):

```bash
# 대화 모델: GGUF 받기 → 대화 형식(Llama 3 템플릿)을 넣어 kanana로 등록
ollama pull hf.co/mradermacher/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
ollama create kanana -f server/ai/kanana.Modelfile

# 임베딩 모델
ollama pull embeddinggemma:300m
# GPU 메모리가 12GB 미만일 때만: CPU에서 돌리는 이름 하나 더 등록
ollama create embeddinggemma-cpu -f server/ai/embeddinggemma-cpu.Modelfile

ollama list   # kanana, embeddinggemma:300m (, embeddinggemma-cpu) 가 보이면 성공
```

- 받은 GGUF에는 대화 형식이 빠져 있어서, `kanana.Modelfile`을 쓰지 않고 GGUF를 그대로 쓰면 같은 말 반복·이상한 기호·영어 답이 나옴. **반드시 `ollama create kanana -f server/ai/kanana.Modelfile`로 등록.**
- `embeddinggemma-cpu.Modelfile`은 `PARAMETER num_gpu 0` 한 줄로 임베딩을 CPU에 둠.
- 같은 GGUF와 같은 Modelfile이면 `kanana` ID가 GPU PC와 같게(`4aa77ba74048`) 나와야 함. 다르면 Modelfile을 고쳤는지 확인.

### 2-3. 필요한 GPU 메모리

| 구성 | GPU 메모리 | 비고 |
|---|---|---|
| kanana만 GPU, 임베딩은 CPU (현재 GPU PC) | kanana **5.3GB** (`ollama ps`, 대화 길이 4096) | 임베딩은 CPU 692MB. 8GB 카드에서 동작 |
| kanana + embeddinggemma 둘 다 GPU | 약 **6GB** (10/25 GPU PC 측정: 화면용 앱 포함 7.7 / 8GB) | 8GB에선 다른 앱과 합쳐 넘쳐서 답이 수십 초 걸렸음 → 12GB 이상에서만 권장 |

- 학교 서버가 **12GB 이상**이면 `EMBED_MODEL=embeddinggemma:300m`로 둘 다 GPU에 올림. 8GB급이면 지금처럼 `embeddinggemma-cpu`.
- 동시 요청을 늘리려고 `OLLAMA_NUM_PARALLEL`을 올리면 그만큼 메모리를 더 씀 (측정 안 함).

### 2-4. 실제로 GPU를 쓰는지 확인

```bash
ollama ps
# NAME                  PROCESSOR    CONTEXT  UNTIL
# kanana:latest         100% GPU     4096     Forever     ← GPU여야 함. CPU면 수십 초 걸림
# embeddinggemma-cpu    100% CPU     2048     Forever     ← CPU 버전은 CPU가 정상
nvidia-smi                       # GPU 이름·전체 메모리·사용량
watch -n 1 nvidia-smi            # 질문을 보내는 동안 GPU-Util이 올라가는지
```

`UNTIL`이 `Forever`가 아니면 3-2의 `OLLAMA_KEEP_ALIVE=-1`이 적용되지 않은 것.

---

## 3. 환경 설정

### 3-1. `.env` 항목과 용도

`.env`는 **저장소 맨 위 폴더**에 둠 (`.env.example`을 복사해서 만듦). 서버는 켜질 때 한 번 읽으므로 고치면 uvicorn을 다시 켜야 함.

| 항목 | 용도 | 비밀 |
|---|---|---|
| `SUPABASE_URL` | 팀 Supabase 주소 (로그인·DB). https만 허용 | 아니오 (그래도 문서엔 안 적음) |
| `SUPABASE_PUBLISHABLE_KEY` | 학생 토큰 검증용 공개 키 | **예** |
| `SUPABASE_SECRET_KEY` | 서버 전용 키: 공지 수집·임베딩 적재·계정 삭제·알림. 앱에 절대 넣지 않음 | **예** |
| `SUPABASE_JWKS_URL` | 예비 칸. 지금 코드는 안 씀 | — |
| `AI_FAKE` | `1`이면 Ollama 대신 가짜 AI(`server/ai/fake.py`). GPU 서버는 `0` | — |
| `AI_BASE_URL` | Ollama 주소 (OpenAI 형식 `/v1`) | — |
| `CHAT_MODEL` | 대화 모델 이름 | — |
| `EMBED_MODEL` | 임베딩 모델 이름. 비우면 벡터 검색 대신 글자 검색 | — |
| `VISION_MODEL` | 이미지 모델. 지금 코드는 안 씀 | — |
| `DOC_MAX_DISTANCE` | 문서 검색 거리 기준. 질문과 문단의 거리가 이보다 크면 근거로 안 쓰고 "모른다". 비우면 거르지 않음 | — |
| `PUSH_ENABLED` | `true`일 때만 실제 휴대폰 푸시(Expo) 전송. 기본 `false` = 앱 안 알림만 | — |
| `EXPO_ACCESS_TOKEN` | Expo 푸시 접근 토큰 (선택) | **예** |
| `EXPO_PUBLIC_API_URL` | 앱이 부를 서버 주소. 실제로는 `app/.env`에서 씀 | — |

Ollama 쪽 설정 (`.env`가 아니라 Ollama 서비스 환경 변수):

| 항목 | 값 | 용도 |
|---|---|---|
| `OLLAMA_KEEP_ALIVE` | `-1` | 모델을 계속 GPU에 올려 둠 (안 하면 5분 뒤 내려서 다음 질문이 느림) |
| `OLLAMA_HOST` | 기본값 `127.0.0.1:11434` 유지 | 백엔드를 다른 장비에 둘 때만 바꿈 (4-2) |

```bash
sudo systemctl edit ollama
# [Service]
# Environment="OLLAMA_KEEP_ALIVE=-1"
sudo systemctl restart ollama
```

### 3-2. 현재 설정 (GPU PC `.env`, 10/29)

```ini
AI_FAKE=0
AI_BASE_URL=http://127.0.0.1:11434/v1
CHAT_MODEL=kanana
EMBED_MODEL=embeddinggemma-cpu      # 학교 서버가 12GB 이상이면 embeddinggemma:300m
VISION_MODEL=gemma3:4b              # 안 씀
DOC_MAX_DISTANCE=0.62
PUSH_ENABLED=false
EXPO_PUBLIC_API_URL=http://localhost:8000
```

- `AI_BASE_URL`은 `localhost` 대신 `127.0.0.1`. Windows에서 `localhost`는 IPv6를 먼저 시도해 호출마다 2초씩 늦었음 (10/29 실측). Linux에서도 그대로 두면 됨.
- `DOC_MAX_DISTANCE=0.62` 근거 (10/29 실측): 관련 질문 첫 문단 거리 0.55 이하, 무관한 질문 0.69 이상.
- 검색 머리말 (`server/ai/client.py`, 코드에 고정): 질문 `task: search result | query: …`, 문단 `title: <자료명> | text: …`.

### 3-3. 키·비밀번호 전달

- 깃에는 `.env`, `.env.*`, `*.gguf`가 올라가지 않음 (`.gitignore`). `.env.example`에는 값을 채우지 않음.
- 이 문서·카톡 공개방·이슈·PR에 키 값을 적지 않음.
- 전달할 것: `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, (쓰면) `EXPO_ACCESS_TOKEN`, 시연 계정 비밀번호. BE A 또는 조장에게 개인 메시지·USB 등 별도 경로로 받아 서버에서 직접 `.env`에 입력.
- 서버에 넣은 뒤 `chmod 600 .env`로 다른 사용자가 못 읽게 함. 학교 서버를 여러 사람이 쓰면 특히 `SUPABASE_SECRET_KEY`는 DB 전체 권한이라 주의.

---

## 4. 실행·연결

### 4-1. 시작 명령

| 무엇 | 실행 폴더 | 명령 | 포트 |
|---|---|---|---|
| Ollama | 어디서나 (서비스) | `sudo systemctl start ollama` | `11434` (기본은 서버 안에서만 접속) |
| FastAPI | **저장소 맨 위 폴더** (`front-back-kick/`) | `.venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 8000` | `8000` |

- `server/` 안에서 실행하면 `server.` 경로를 못 찾음. 반드시 맨 위 폴더에서.
- 운영에서는 `--reload`를 붙이지 않음.
- FastAPI가 켜질 때 `warm_up`이 kanana와 임베딩 모델을 미리 올림 (첫 질문 대기 없앰). Ollama가 꺼져 있어도 서버는 뜨지만 AI 답은 문장 틀로 대신됨.
- 확인: `curl http://127.0.0.1:8000/health`, API 문서 `http://<서버>:8000/docs`.

터미널을 닫아도 계속 돌게 하려면 systemd 서비스로 등록 (예시, 경로·사용자는 서버에 맞게):

```ini
# /etc/systemd/system/previ-api.service
[Unit]
Description=PREVI FastAPI
After=network-online.target ollama.service

[Service]
User=<계정>
WorkingDirectory=/home/<계정>/front-back-kick
ExecStart=/home/<계정>/front-back-kick/.venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now previ-api
journalctl -u previ-api -f        # 로그 ("문서 거리 …" 줄로 검색 거리를 볼 수 있음)
```

sudo 권한이 없으면 `tmux new -s previ`에서 uvicorn을 켜고 `Ctrl+B, D`로 빠져나옴.

### 4-2. 백엔드와 모델: 같은 서버 권장

**같은 학교 GPU 서버에 둘 다 두는 것을 권장.**

- Ollama를 바깥에 열 필요가 없음 (`AI_BASE_URL=http://127.0.0.1:11434/v1` 그대로). Ollama에는 비밀번호가 없어서 열면 누구나 GPU를 쓸 수 있음.
- 한 질문에 AI 호출이 2~3번(분류·임베딩·답변)이라 장비 사이 왕복이 없을수록 빠름.
- DB는 어차피 Supabase(외부)라 서버에 DB를 둘 필요 없음.

나눌 수밖에 없을 때 (예: 학교 서버에서 8000 포트를 못 열 때):

```bash
# GPU 서버
sudo systemctl edit ollama     # Environment="OLLAMA_HOST=0.0.0.0:11434" 추가
sudo systemctl restart ollama
sudo ufw allow from <백엔드 장비 IP> to any port 11434   # 백엔드 장비만 허용, 나머지는 막기
```

백엔드 장비 `.env`: `AI_BASE_URL=http://<GPU 서버 IP>:11434/v1`.

### 4-3. 다른 컴퓨터에서 연결

| 상황 | 방법 |
|---|---|
| 학교 안 네트워크 | `http://<서버 IP>:8000` (방화벽에서 8000 허용 필요) |
| 학교 밖·학생 폰 (시연) | Cloudflare Tunnel로 API 주소와 웹 공유 링크를 만듦 → **4-5** |
| 개발자 PC에서 잠깐 확인 | `ssh -L 8000:127.0.0.1:8000 <계정>@<서버>` 후 내 PC에서 `http://localhost:8000/docs` |
| 개발자 PC에서 GPU 서버의 AI만 쓰기 | `ssh -L 11434:127.0.0.1:11434 <계정>@<서버>` 후 내 PC `.env`에 `AI_FAKE=0`, `AI_BASE_URL=http://127.0.0.1:11434/v1` |

- 앱 쪽: `app/.env`의 `EXPO_PUBLIC_API_URL`을 위 주소로 바꾸고 `EXPO_PUBLIC_USE_MOCK=0`, `EXPO_PUBLIC_DEV_LOGIN=0`.
- CORS는 `allow_origins=["*"]`로 이미 열려 있음 (`server/main.py`).

### 4-4. 서버 재시작 절차

1. `cd front-back-kick && git pull` (코드가 바뀐 경우)
2. 패키지가 바뀌었으면 `.venv/bin/python -m pip install -r server/requirements-dev.txt`
3. `sudo systemctl restart ollama` → `ollama ps`가 비어 있어도 정상 (4단계에서 올라감)
4. `sudo systemctl restart previ-api` (tmux면 `Ctrl+C` 후 4-1 명령 다시)
5. 확인: `curl http://127.0.0.1:8000/health` → `ollama ps`에서 kanana `100% GPU`, `Forever` → 6-3의 질문 한두 개

- 지시문(`server/ai/prompts/*.txt`)만 바꿨으면 재시작 필요 없음 (요청마다 파일을 읽음).
- `.env`를 바꿨으면 4단계 필요.
- 서버 재부팅 후에는 두 서비스가 자동으로 켜짐 (`enable` 해 둔 경우). 5단계만 확인.
- 터널(4-5)은 다시 켜면 주소가 바뀜 → **API 터널 주소가 바뀌면 웹 빌드부터 다시** (4-5의 2~4단계).

### 4-5. 공유 링크 만들기 (API 터널 → 웹 빌드 → 웹 터널)

학교 밖 사람이 브라우저로 바로 써 볼 수 있는 링크를 만드는 순서. 10/29 GPU PC에서 이 방식으로 띄워 둔 상태를 그대로 옮김.

```
학생 브라우저 ──▶ https://<웹>.trycloudflare.com ──▶ serve (포트 8095, app/dist 정적 파일)
      │
      └─ 앱 코드가 API 요청 ──▶ https://<API>.trycloudflare.com ──▶ uvicorn (포트 8000) ──▶ Ollama (11434)
```

| 항목 | GPU PC 실측 (10/29) |
|---|---|
| cloudflared | 2026.10.5 |
| Node.js | v25.6.1 (웹 빌드·`serve`용. 학교 서버는 Node LTS면 됨) |
| 정적 파일 서버 | `serve@14.2.4` (`npx`가 받아서 실행) |
| 포트 | API `8000`, 웹 `8095` (개발용 `expo start --web`의 8081과 겹치지 않게) |
| 터널 종류 | 계정 없이 쓰는 임시 터널(quick tunnel, `trycloudflare.com`) |

**0) 설치 (한 번만)**

```bash
# cloudflared (Linux x86_64, sudo 없이 홈 폴더에)
mkdir -p ~/bin
curl -L -o ~/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/download/2026.10.5/cloudflared-linux-amd64
chmod +x ~/bin/cloudflared
~/bin/cloudflared --version

# 앱 패키지 (웹 빌드용)
cd front-back-kick/app
npm ci
```

- Windows는 `winget install --id Cloudflare.cloudflared` (GPU PC는 `C:\Program Files (x86)\cloudflared\cloudflared.exe`).
- 학교 서버에서 Node 설치가 안 되면, 웹 빌드(2단계)만 다른 PC에서 하고 `app/dist` 폴더를 서버로 복사해도 됨.

**1) API 터널** (FastAPI가 8000에서 켜져 있는 상태에서, 창 하나를 계속 띄워 둠)

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000
```

출력에 나온 `https://<임의 단어>.trycloudflare.com`이 API 주소. 다른 창에서 확인:

```bash
curl https://<API 주소>/health      # 200이면 성공
```

**2) 웹 빌드** (`app/` 폴더에서). 앱의 `EXPO_PUBLIC_*` 값은 **빌드할 때 코드에 박힘** → API 주소가 바뀌면 다시 빌드해야 함.

`app/.env`에 다음을 맞춤 (값은 3-3처럼 별도로 받음):

```ini
EXPO_PUBLIC_API_URL=https://<API 주소>     # 1)에서 받은 주소, 끝에 / 없이
EXPO_PUBLIC_USE_MOCK=0
EXPO_PUBLIC_DEV_LOGIN=0
EXPO_PUBLIC_SUPABASE_URL=<별도 전달>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<별도 전달, = SUPABASE_PUBLISHABLE_KEY>
EXPO_PUBLIC_EMAIL_DOMAIN=skuniv.ac.kr
```

```bash
npx expo export --platform web --clear     # 결과: app/dist/  (--clear: 예전 주소가 캐시에 남지 않게)
grep -roh "https://[a-z0-9-]*\.trycloudflare\.com" dist | sort -u   # 1)의 API 주소 하나만 나와야 함
```

- `npm run build:demo`(시연용 HTML 한 장)는 **예시 데이터 모드**라 실제 서버에 안 붙음. 공유 링크에는 쓰지 않음.
- 웹 빌드에는 `EXPO_PUBLIC_` 값이 그대로 보임. 공개 키(publishable)만 넣고 `SUPABASE_SECRET_KEY`는 절대 `app/.env`에 넣지 않음.

**3) 웹 파일 띄우기** (`app/` 폴더, 창 하나 계속)

```bash
npx --yes serve@14.2.4 -s dist -l 8095
```

`-s`는 `/chat` 같은 주소로 바로 들어오거나 새로고침해도 `index.html`을 주는 설정 (웹 빌드가 한 페이지 앱이라 필요). 확인: `curl -I http://127.0.0.1:8095` → 200.

**4) 웹 터널** (창 하나 계속)

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8095
```

여기서 나온 `https://<임의 단어>.trycloudflare.com`이 **공유 링크**. 시연 계정으로 로그인 → 채팅에서 6-3 질문 하나 → 답이 오면 끝.

창 4개(uvicorn·API 터널·serve·웹 터널)를 계속 띄워야 하므로 `tmux`에서 창을 나눠 켜는 것을 권장. 끄면 링크도 끊김.

**주의할 점**

| 상황 | 할 일 |
|---|---|
| API 터널을 다시 켬 (주소 바뀜) | 2)부터 다시: `app/.env`의 `EXPO_PUBLIC_API_URL` 바꾸기 → 다시 빌드 → `serve` 재시작. 웹 터널은 그대로 둬도 됨 |
| 웹 터널만 다시 켬 | 새 공유 링크만 다시 알려 줌. 빌드는 그대로 |
| 화면은 뜨는데 로그인·채팅이 안 됨 | 브라우저 개발자 도구에서 요청 주소가 지금 API 주소인지 확인 (2)의 `grep`). 예전 주소면 `--clear`로 다시 빌드 |
| 8000 포트에 uvicorn이 두 개 | 10/29 GPU PC에 `.venv`와 `anaconda3` 파이썬으로 uvicorn이 하나씩 떠 있었음. 하나만 켤 것 (`.venv` 쪽) |
| 임시 터널 주소 | 껐다 켜거나 재부팅하면 바뀌고, 사용량 보장이 없음. 오래 쓸 링크는 Cloudflare 계정 + 도메인으로 이름 있는 터널(`cloudflared tunnel create`)을 만들어 고정 주소로 바꿔야 함 (학교 도메인·계정 사용 허가 필요) |
| 학교 서버에서 외부 접속 제한 | cloudflared는 서버에서 밖으로 나가는 연결만 쓰므로 포트를 열 필요는 없음. 다만 학교 방화벽이 Cloudflare로 나가는 연결(443/7844)을 막으면 터널이 안 붙음 → 서버 관리자에게 확인 |

---

## 5. 문서·임베딩

### 5-1. 현재 Supabase에 들어 있는 자료 (10/29 조회)

`documents` 74개, `doc_chunks` **508개, 전부 임베딩 완료** (`embedding is null` = 0개).

| 자료 | 문서 수 | 문단 수 | 넣은 스크립트 | 임베딩 |
|---|---|---|---|---|
| 2026 서경대학교 대학요람 · 학칙 / 학칙시행세칙 / 교육과정 | 3 | 110 / 64 / 75 = 249 | `load_yoram` | 완료 |
| 장학금 규정 · 교내장학 / 장학금지급규정 (홈페이지 글) | 2 | 12 / 7 = 19 | `load_yoram` | 완료 |
| 졸업요건 정리(2026·2024) · 학과별, 학번 기준, 폐지 규정과 적용 원칙 | 69 | **240** | `load_graduation_catalog` (BE A) | 완료 |

- 임베딩은 모두 `embeddinggemma` 300M + `DOC_FMT` 머리말로 만든 768차원 벡터.
- 학과별 졸업 기준 행(`grad_requirements`)은 147개 계획(`load_graduation_catalog` dry-run 결과).

### 5-2. 새 졸업 자료 240문단 임베딩 방법

**10/29 조회 기준 240문단은 이미 임베딩이 끝나 있음.** 학교 서버에서 다시 할 필요 없음 (DB는 Supabase라 서버를 옮겨도 그대로).

자료가 추가·보강되어 빈 임베딩이 생겼을 때만, `AI_FAKE=0`과 실제 `EMBED_MODEL`이 설정된 서버에서:

```bash
# 1) 미리보기: DB를 바꾸지 않고 계획 수만 출력 → {"planned_rules": 147, "planned_documents": 69, "planned_chunks": 240}
.venv/bin/python -m server.scripts.load_graduation_catalog

# 2) 적재 + 빈 임베딩만 채우기. 백업 폴더는 저장소 밖이어야 함
.venv/bin/python -m server.scripts.load_graduation_catalog --apply --embed --backup-dir ~/previ-backup
```

- 기존 졸업 기준 행은 덮어쓰지 않고, 기존 문단은 지우지 않음. 기존 문단이 새 자료와 다르면 멈춤.
- `--embed`는 이 자료들의 **임베딩이 빈 문단만** 채움 (요람·장학은 건드리지 않음).
- `AI_FAKE=1`이거나 `EMBED_MODEL`이 비어 있으면 임베딩을 거부하고 멈춤.
- 결과는 `<backup-dir>/<시각>-load-report.json`에 남음. `embedding_pending`이 0이면 완료.

### 5-3. 조심할 명령과 재색인 범위

> **주의: `python -m server.scripts.load_yoram`은 기존 요람·장학 문단을 지우고 다시 넣습니다.**
> `title`이 `2026 서경대학교 대학요람*`, `*(예시)`, `장학금 규정 · *`인 문서와 문단 268개를 삭제한 뒤 새로 넣고 임베딩합니다.
> `AI_FAKE=1`이거나 `EMBED_MODEL`이 비어 있는 곳에서 돌리면 **임베딩 없이** 다시 들어가 벡터 검색이 꺼집니다.
> 요람 PDF·장학 txt를 바꿨을 때만, 실제 임베딩 모델이 있는 서버에서만 실행하세요. 학교 서버로 옮기는 작업에는 필요 없습니다.

그 밖에 하지 말 것:

- Supabase SQL Editor에서 `delete from documents` / `doc_chunks` / `update doc_chunks set embedding = null`을 확인 없이 실행
- `supabase/migrations/009_chat_documents.sql`을 다시 실행 (표를 새로 만듦)
- 서버 검사 스크립트(`server/check_*_live.py`)는 임시 계정·데이터를 만들고 지움. 시연 직전에는 돌리지 않음

모델을 바꿀 때 다시 임베딩해야 하는 범위:

| 바꾸는 것 | 다시 임베딩 | 그 밖에 할 일 |
|---|---|---|
| `CHAT_MODEL`만 (kanana → 다른 대화 모델) | 필요 없음 | 6-3 질문으로 답 품질·JSON 형식 다시 확인 |
| `embeddinggemma:300m` ↔ `embeddinggemma-cpu` | 필요 없음 (같은 모델 파일) | — |
| 다른 임베딩 모델, 또는 `QUERY_FMT`·`DOC_FMT` 수정 | **508개 전부** (요람·장학·졸업 자료 모두) | 768차원이 아니면 `vector(768)` 표·`match_doc_chunks` 함수도 바꿔야 함. `DOC_MAX_DISTANCE`를 질문 20~25개로 다시 재기 |

508개 전부 다시 임베딩하는 법 (문단은 지우지 않음):

```bash
# 1) Supabase SQL Editor (백업 확인 후):  update public.doc_chunks set embedding = null;
# 2) 서버에서 빈 임베딩 채우기 (32개씩, 요람·장학·졸업 자료 모두)
.venv/bin/python -c "from server.scripts.load_yoram import _db, embed_missing; db = _db(); embed_missing(db); db.close()"
```

1)과 2) 사이에는 벡터 검색이 아무것도 못 찾아 챗봇이 "모른다"로 답함. 시연 시간을 피해서 할 것.
임베딩 모델·768차원이 그대로면 위 대신 `python -m server.scripts.reembed_docs --apply`: 백업 후 덮어써서 검색이 안 끊김.
참고: GPU PC에서 268개 임베딩에 46초 걸렸음 (10/28).

---

## 6. 성능과 확인 방법

### 6-1. 질문별 응답 시간 (10/29 GPU PC 실측)

`server/ai/tasks.py`와 Supabase 벡터 검색을 직접 불러 잰 값. 로그인 확인·프로필 조회·대화 저장 같은 Supabase 왕복(요청당 수백 ms씩 몇 번)은 빠져 있으므로 앱에서 체감 시간은 이보다 1~2초 더 걸릴 수 있음.

| 질문 | 분류 | 임베딩 | 검색 | 답변 | 합계 | 1위 거리 |
|---|---|---|---|---|---|---|
| 휴학은 최대 몇 학기까지 할 수 있어? | 0.0초 (규칙) | 1.53초 (첫 호출) | 0.46초 | 1.4초 | **3.4초** | 0.327 |
| 성적우수 장학금 조건이 뭐야? | 0.0초 | 0.03초 | 0.31초 | 2.3초 | **2.6초** | 0.373 |
| 졸업 총 학점은 몇 학점이야? | 0.4초 (AI) | 0.03초 | 0.34초 | 0.8초 | **1.6초** | 0.403 |
| 복학 신청은 언제 해? | 0.0초 | 0.03초 | 0.30초 | 1.0초 | **1.3초** | 0.372 |
| 학식 메뉴 알려줘 | 0.4초 | 0.03초 | 0.29초 | 0초 (근거 없음) | **0.7초** | 0.649 |
| 소프트웨어학과 졸업 요건이 뭐야? | 0.0초 | 0.03초 | 0.29초 | 1.5초 | **1.8초** | 0.368 |
| 나 졸업까지 몇 학점 남았어? (내 정보) | 0.0초 | — | — | 0.7초 | **0.7초** | — |

- 공지 하나 AI 정리(밤 작업, `notice_summary`)는 공지당 약 20초 (10/28).
- 이전 기록: 10/25 처음 연결 때 질문당 약 10초 → `127.0.0.1`, 규칙 분류, 임베딩 CPU 분리, 재시도 끄기로 지금 수준.

GPU 메모리 (10/29, `nvidia-smi`): **6,896 / 8,188 MiB** 사용. 이 중 kanana가 5.3GB, 나머지는 Windows 화면·다른 앱. 임베딩은 CPU.
학교 서버(화면 없는 Linux)에서는 kanana 몫만 쓰는 것이 정상.

### 6-2. 성능 관련 설정

| 설정 | 값 | 위치 |
|---|---|---|
| AI 호출 시간 제한 | 챗봇·분류·이유 **20초**, 공지 정리 **60초** | `server/ai/client.py` `_client()`, `SLOW` |
| SDK 자동 재시도 | **0회** (시간 초과마다 몰래 두 번 더 불러 몇 분씩 기다리던 문제) | `client.py` `max_retries=0` |
| JSON 깨짐 | 깨진 답을 보여 주고 한 번 다시 물음, 또 깨지면 문장 틀로 대신 | `client.py` `ask_json` |
| temperature | 0.1 | `client.py` |
| 생성 길이 | 토큰 제한(`max_tokens`)은 걸지 않음. 지시문으로 짧게 쓰게 하고, 문서 답 **150자**·내 정보 답 **100자**를 넘으면 마지막 문장 끝에서 자름 | `server/ai/tasks.py` `_short` |
| 대화 길이(context) | 4096 (Ollama 기본값, `ollama ps` CONTEXT) | Ollama |
| 검색 문단 수 | 3개 (`match_count`). 5개로 늘리면 4096을 넘칠 위험이 있어 안 늘림 | `server/routes/chat.py` `search_chunks` |
| 공지 원문 근거 | 앞 1,500자만 | `routes/chat.py` `_notice_chunk` |
| 모델 상주 | `OLLAMA_KEEP_ALIVE=-1` + 서버 시작 시 `warm_up` | Ollama, `client.py` |
| 뻔한 질문 분류 | AI 없이 규칙으로 (약 5초 절약) | `tasks.py` `_route_by_rule` |

### 6-3. 정상 동작 확인

**자동 검사** (AI·DB 없이 코드만, 1분 안):

```bash
.venv/bin/python -m pytest server/tests -q      # 기대: 215 passed (10/29)
```

**실제 AI 확인**: 앱에서 시연 계정(홍길동 `20210004@skuniv.ac.kr`, 비밀번호는 별도 전달)으로 로그인 → 채팅. 10/29 GPU PC 실제 답:

| 질문 | 기대 결과 |
|---|---|
| 휴학은 최대 몇 학기까지 할 수 있어? | "한 번에 1학기까지, 재학 중 모두 합쳐 5년을 넘을 수 없어요" + 출처 `대학요람 · 학칙` |
| 성적우수 장학금 조건이 뭐야? | 직전 학기 15학점 이상·평점 3.0 이상·학사경고 아님 + 출처 `장학금 규정 · 교내장학` |
| 복학 신청은 언제 해? | "해당 학기 등록 개시 전 1주일 이내" + 출처 학칙 |
| 졸업 총 학점은 몇 학점이야? | "120학점이에요" |
| 소프트웨어학과 졸업 요건이 뭐야? | 전공핵심·캡스톤·작품 심사 등 + 출처 `졸업요건 정리(2026) · 소프트웨어학과` |
| 나 졸업까지 몇 학점 남았어? | "홍길동님, 졸업까지 22학점 남았어요" + "졸업까지 남은 학점" 카드 + "졸업 요건 자세히" 버튼 |
| 나 장학금 받을 수 있어? | 장학 판정 카드 (판정 공지가 없으면 "지금 신청할 수 있는 장학금이 없어요") |
| 학식 메뉴 알려줘 | "학교 문서에서 근거를 찾지 못했어요…" (거리 0.649 > 0.62로 걸러짐) + 답 못 한 질문으로 기록 |

서버 로그의 `문서 거리 <질문>: [0.327, 0.407, 0.461]` 줄로 검색 거리를 볼 수 있음.
답이 수십 초 걸리면 `ollama ps`의 PROCESSOR부터 확인 (2-4).

### 6-4. 알려진 문제

| 문제 | 상태 |
|---|---|
| "전과 조건" 같은 일부 질문은 검색 1위가 엉뚱한 조문(부전공) | 남음 (G8). 거리 기준 근처라 "모른다"로 빠지는 경우도 있음 |
| 관련 질문과 무관한 질문의 거리가 0.55~0.69 사이에서 겹칠 수 있음 | 0.62로 둠. 애매하면 지어내기보다 "모른다"가 나오게 한 값 |
| 공지 판정이 대부분 "확인 필요", 교수 대상·폐강 안내 같은 공지도 학생에게 "확인 필요"로 뜸, 조건 문장에 절차가 가끔 섞임 | 남음 (G6). 교수·폐강 공지는 새 공지부터 고침. 예전 공지는 `.venv/bin/python -m server.scripts.requeue_staff_notices`로 목록 확인 → `--apply`로 다시 해석 대기 → 다음 공지 작업이 다시 해석 |
| 첫 임베딩 호출이 1.5초로 느림 (이후 0.03초) | 서버 켠 뒤 첫 질문만 |
| 8GB GPU에서 임베딩까지 GPU에 올리면 메모리가 넘쳐 답이 수십 초 | `embeddinggemma-cpu`로 해결. 12GB 이상 서버는 해당 없음 |
| Kanana GGUF가 비공식 변환본 (mradermacher) | 원본은 카카오 Apache-2.0. 대화 형식은 Modelfile로 보완 |
| 답 말투가 가끔 "~입니다"로 섞이고 3문장 이상 씀 | 10/30 고침: `tasks.py` `_polite`가 흔한 끝말을 "~요"로 바꾸고 `_short`가 2문장까지만 남김 |
| "휴학 알려줘"처럼 주제만 물으면 답이 길고 흐림 | 10/30 고침: `routes/chat.py` `_clarify`가 AI 없이 되묻고 고를 질문을 `ask` 버튼으로 줌 (앱 `ChatPanel`이 누르면 그 질문을 보냄) |
| "수강신청 언제야?"에 날짜 없는 빈 답 | 10/30 고침: "언제·기간" 질문은 `academic_calendar`의 실제 날짜를 근거 문단으로 같이 줌 |
| `trycloudflare.com` 주소는 터널을 다시 켜면 바뀜. API 주소가 바뀌면 웹도 다시 빌드해야 함 | 시연 전 고정 주소 필요 (4-5) |
| 문서별 시점 차이: [06_AI_운영_가이드](06_AI_운영_가이드.md)의 모델 후보 표는 예전 내용 | 이 문서 값이 최신 |
| 실제 휴대폰 푸시·cron(밤 작업 자동 실행) | 아직 연결·검증 전. `PUSH_ENABLED=false` 유지 |
