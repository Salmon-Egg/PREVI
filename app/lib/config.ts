// ▶ FE 3번·7번에 해당하는 부분: 서버 주소, 예시 데이터 전환, 로그인 방식 설정
// 앱 설정. 값은 app/.env 의 EXPO_PUBLIC_… 에서 읽습니다 (README 참고).
// EXPO_PUBLIC_ 값은 앱에 그대로 들어가므로 비밀 키는 절대 넣지 않기.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// 1이면 서버 없이 mocks/ 예시 데이터로 동작 (FE가 서버 완성 전에 화면 만들 때)
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === '1';

// 1이면 학번·비밀번호를 서버 대신 앱이 확인 (시연용 가상 학생 4명, 서버도 DEV_AUTH=1이어야 함)
export const DEV_LOGIN = USE_MOCK || process.env.EXPO_PUBLIC_DEV_LOGIN === '1';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const EMAIL_DOMAIN = process.env.EXPO_PUBLIC_EMAIL_DOMAIN ?? ''; // 예: skuniv.ac.kr

// ▶ FE 7번에 해당하는 부분: 시연용 가상 학생 4명. 로그인 화면에서 학번 + 비밀번호(DEV_PASSWORD)로 들어감
export const DEV_PASSWORD = '1234';
export const PERSONAS = [
  { id: '00000000-0000-0000-0000-000000000001', studentId: '20260001', name: '김새내', desc: '1학년 · 소프트웨어학과' },
  { id: '00000000-0000-0000-0000-000000000002', studentId: '20250002', name: '이도전', desc: '2학년 · 소프트웨어학과' },
  { id: '00000000-0000-0000-0000-000000000003', studentId: '20240003', name: '박바뻐', desc: '3학년 · 전자컴퓨터공학과' },
  { id: '00000000-0000-0000-0000-000000000004', studentId: '20210004', name: '홍길동', desc: '4학년 · 소프트웨어학과' },
];
