// 로그인 상태. 화면에서는 useSession()으로 읽고, login()/logout()으로 바꿉니다.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL } from './config';

// 휴대폰에서도 localStorage를 쓸 수 있게 (웹은 원래 있음)
if (Platform.OS !== 'web') require('expo-sqlite/localStorage/install');

const KEY = 'session-token';
let token: string | null = globalThis.localStorage?.getItem(KEY) ?? null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  token = next;
  if (next) globalThis.localStorage?.setItem(KEY, next);
  else globalThis.localStorage?.removeItem(KEY);
  listeners.forEach((l) => l());
}

export const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: globalThis.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

// Supabase 토큰이 새로 발급되면(자동 갱신) 따라 바꿈
supabase?.auth.onAuthStateChange((_event, s) => {
  if (s?.access_token) set(s.access_token);
});

export function getToken() {
  return token;
}

/** 시연용 가상 학생 로그인 (DEV_LOGIN) 또는 Supabase 로그인 후 토큰 저장 */
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
