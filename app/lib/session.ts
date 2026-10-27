// ▶ FE 4번에 해당하는 부분: 로그인 상태 관리
// 로그인 상태. 화면에서는 useSession()으로 읽고, login()/logout()으로 바꿉니다.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL } from './config';

// 휴대폰에서도 localStorage를 쓸 수 있게 (웹은 원래 있음)
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 웹에서는 불러오지 않으려고 조건부로 require
if (Platform.OS !== 'web') require('expo-sqlite/localStorage/install');

const KEY = 'session-token';
// 웹 링크를 시크릿 창·임베드로 열면 localStorage가 막혀서 오류가 날 수 있음 → 그때는 저장 없이 이번 실행 동안만 로그인 유지
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
let token: string | null = null;
try {
  token = storage()?.getItem(KEY) ?? null;
} catch {}
const listeners = new Set<() => void>();

function set(next: string | null) {
  token = next;
  try {
    if (next) storage()?.setItem(KEY, next);
    else storage()?.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: storage() ?? undefined, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

// Supabase 토큰이 새로 발급되면(자동 갱신) 따라 바꿈. 로그인 전에는 바꾸지 않음
// (회원가입 중 인증번호 확인만 해도 세션이 생기는데, 그때 바로 로그인되면 가입하기 전에 홈으로 넘어감 — lib/auth.ts)
supabase?.auth.onAuthStateChange((_event, s) => {
  if (s?.access_token && token) set(s.access_token);
});

export function getToken() {
  return token;
}

/** 로그인 성공 후 토큰 저장 (lib/auth.ts). 시연용이면 dev-<학생 번호> */
export function login(nextToken: string) {
  set(nextToken);
}

export async function logout() {
  await supabase?.auth.signOut();
  set(null);
}

export function useSession() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => token,
  );
}
