// 서버(/admin/*)를 부르는 곳은 여기 한 곳. 로그인 토큰은 Supabase 세션에서 꺼내 붙임.
import { createClient } from '@supabase/supabase-js';
import { useEffect, useReducer, useState } from 'react';

const env = import.meta.env;
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY);
const API_URL = env.VITE_API_URL || 'http://localhost:8000';

export async function api(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('서버에 연결할 수 없어요.'), { status: 0 });
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? '문제가 생겼어요.'), { status: res.status });
  return json;
}

/** GET 결과 + 다시 불러오기 */
export function useLoad(path) {
  const [state, setState] = useState({ data: null, error: null });
  const [n, reload] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    let alive = true;
    api('GET', path).then(
      (data) => alive && setState({ data, error: null }),
      (e) => alive && setState({ data: null, error: e.message }),
    );
    return () => { alive = false; };
  }, [path, n]);
  return { ...state, reload };
}

/** 버튼 동작: 실패하면 알림창, 성공하면 done() */
export async function run(task, done) {
  try {
    const result = await task();
    done?.(result);
    return result;
  } catch (e) {
    alert(e.message);
  }
}
