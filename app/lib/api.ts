// ▶ FE 3번에 해당하는 부분: API 클라이언트 한 곳(인증 토큰 자동 첨부), 예시 데이터 ↔ 실제 서버 전환(USE_MOCK)
// 서버를 부르는 코드는 이 파일 한 곳에만 (app/README.md).
// USE_MOCK=1이면 서버 대신 mocks/의 예시 데이터를 돌려줌.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { mockFetch } from '../mocks';
import { API_URL, USE_MOCK } from './config';
import { getToken, logout } from './session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) return mockFetch(method, path, body) as T;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) await logout(); // 로그인이 풀렸으면 로그인 화면으로
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? '문제가 생겼어요');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** 화면이 보일 때마다 path를 다시 불러옴. 다른 화면에서 고치고 돌아와도 최신으로 보임. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api.get<T>(path));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { data, error, loading, reload, setData };
}
