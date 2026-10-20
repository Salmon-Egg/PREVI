# app/ — 모바일 앱 (Expo)

담당: FE A · FE B

## 여기에 들어갈 것
```
app/
├─ app/          화면 파일 (Expo Router: 파일 하나 = 화면 하나)
├─ components/   여러 화면이 같이 쓰는 부품 (카드, D-day 배지, 판정 배지, 출처 표시 …)
├─ lib/api.ts    서버를 부르는 코드는 이 파일 한 곳에만
└─ mocks/        예시 데이터 (docs/04_API_명세.md의 예시 응답과 같은 모양)
```

## 처음 시작 (FE 담당자가 한 번)
- `npx create-expo-app@latest` 로 이 폴더에 프로젝트를 만듭니다.
- 화면을 만들 때 시안은 `docs/디자인/`, 화면 번호와 이동은 `docs/기획/메뉴구성.md`를 봅니다.
- 서버가 완성되기 전에는 `mocks/`의 예시 데이터로 화면을 만들고, 나중에 `lib/api.ts`만 실제 서버로 바꿉니다.
- 푸시 알림은 Expo Go에서 안 되므로 FE B가 만든 개발 빌드(EAS)를 설치해서 확인합니다.
