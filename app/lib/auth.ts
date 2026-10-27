// ▶ FE 7번에 해당하는 부분: 로그인(학번·비밀번호) · 회원가입(학교 이메일 인증번호) · 비밀번호 변경
// - 예시 데이터 모드(USE_MOCK): 앱 안의 계정 저장소(mocks)가 확인. 회원가입한 계정도 이 기기에 남음
// - 실제 서버 + 시연 로그인(DEV_LOGIN): 가상 학생 4명(config PERSONAS)만, 비밀번호는 DEV_PASSWORD
// - 실제: Supabase 이메일+비밀번호. 학번으로 로그인하면 '학번@EMAIL_DOMAIN'으로 봄
//   ⚠️ 학교 이메일이 학번@도메인 꼴이 아니면 학번→이메일 찾는 API가 필요함 (BE와 확인)
import { mockAuth } from '../mocks';
import { DEV_LOGIN, DEV_PASSWORD, EMAIL_DOMAIN, PERSONAS, USE_MOCK } from './config';
import { ApiError } from './errors';
import { login, supabase } from './session';

export const WRONG_LOGIN = '아이디 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.';
const fail = (message: string) => new ApiError(400, 'AUTH', message);

function sb() {
  if (!supabase) throw fail('로그인 설정(SUPABASE_URL)이 비어 있어요. app/.env를 확인해 주세요.');
  return supabase;
}
const emailOf = (id: string) => (id.includes('@') ? id : `${id}@${EMAIL_DOMAIN}`);

/** 학교 이메일인지 (EMAIL_DOMAIN이 정해져 있으면 그 도메인만) */
export function checkEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '이메일 주소를 확인해 주세요.';
  if (EMAIL_DOMAIN && !email.endsWith('@' + EMAIL_DOMAIN.toLowerCase())) return `@${EMAIL_DOMAIN} 학교 이메일만 쓸 수 있어요.`;
  return null;
}

export async function signIn(id: string, password: string) {
  if (USE_MOCK) return login(mockAuth.signIn(id, password));
  if (DEV_LOGIN) {
    const p = PERSONAS.find((x) => x.studentId === id);
    if (!p || password !== DEV_PASSWORD) throw fail(WRONG_LOGIN);
    return login(`dev-${p.id}`);
  }
  const { data, error } = await sb().auth.signInWithPassword({ email: emailOf(id), password });
  if (error || !data.session) throw fail(error?.status === 400 || !error ? WRONG_LOGIN : error.message);
  login(data.session.access_token);
}

/** 인증번호 보내기. 예시 데이터 모드는 메일 대신 번호를 돌려줌(화면에 알려 줌), 실제는 메일로 가서 null */
export async function sendSignupCode(email: string): Promise<string | null> {
  if (USE_MOCK) return mockAuth.sendCode(email);
  if (DEV_LOGIN) throw fail('시연 서버에서는 회원가입을 할 수 없어요. 시연용 학번으로 로그인해 주세요.');
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw fail(error.message);
  return null;
}

export async function verifySignupCode(email: string, code: string) {
  if (USE_MOCK) return mockAuth.verifyCode(email, code);
  // 인증이 끝나면 Supabase 세션이 생기지만, 가입하기를 누르기 전까지는 앱 로그인 상태로 바꾸지 않음 (session.ts)
  const { error } = await sb().auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw fail('인증번호가 맞지 않아요.');
}

export async function signUp(a: { studentId: string; name: string; email: string; password: string }) {
  if (USE_MOCK) return login(mockAuth.signUp(a));
  const { error } = await sb().auth.updateUser({ password: a.password, data: { student_id: a.studentId, name: a.name } });
  const { data } = await sb().auth.getSession();
  if (error || !data.session) throw fail(error?.message ?? '이메일 인증을 먼저 해 주세요.');
  login(data.session.access_token);
}

export async function changePassword(current: string, next: string) {
  if (USE_MOCK) return mockAuth.changePassword(current, next);
  if (DEV_LOGIN) throw fail('시연용 계정은 비밀번호를 바꿀 수 없어요.');
  const { data } = await sb().auth.getUser();
  const email = data.user?.email;
  if (!email) throw fail('다시 로그인해 주세요.');
  // 지금 비밀번호가 맞는지 먼저 확인
  const check = await sb().auth.signInWithPassword({ email, password: current });
  if (check.error) throw fail('지금 비밀번호가 맞지 않아요.');
  const { error } = await sb().auth.updateUser({ password: next });
  if (error) throw fail(error.message);
}
