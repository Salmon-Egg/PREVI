// ▶ FE 3번에 해당하는 부분: API 클라이언트 한 곳(인증 토큰 자동 첨부), 예시 데이터 ↔ 실제 서버 전환(USE_MOCK)
// 서버를 부르는 코드는 이 파일 한 곳에만 (app/README.md).
// USE_MOCK=1이면 서버 대신 mocks/의 예시 데이터를 돌려줌.
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { showAlert } from '../components/ui';
import { mockFetch } from '../mocks';
import { API_URL, USE_MOCK } from './config';
import { ApiError } from './errors';
import { getToken, logout } from './session';


const JSON_HEADER: Record<string, string> = { 'Content-Type': 'application/json' };
try {
  // 무료 ngrok의 HTML 안내 대신 JSON API 응답을 요청합니다.
  if (/(^|\.)(ngrok-free\.(app|dev)|ngrok\.(app|io))$/i.test(new URL(API_URL).hostname)) {
    JSON_HEADER['ngrok-skip-browser-warning'] = '1';
  }
} catch {
  // 잘못된 서버 주소는 기존 request()의 연결 오류 안내에서 처리합니다.
}

export { ApiError };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) return mockFetch(method, path, body) as T;
  const token = getToken(); // 로그인 전이면 Authorization을 아예 안 보냄 ('Bearer null' 방지)
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: token ? { ...JSON_HEADER, Authorization: `Bearer ${token}` } : JSON_HEADER,
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

/** 버튼으로 저장·변경할 때: 실패하면 알림창을 띄우고 false (조용히 실패하거나 처리 안 된 오류가 나지 않게) */
export async function attempt(run: () => Promise<unknown>, failTitle = '저장하지 못했어요') {
  try {
    await run();
    return true;
  } catch (e) {
    showAlert(failTitle, (e as ApiError).message);
    return false;
  }
}

/** 보내는 중에는 버튼을 막음 (두 번 눌러 같은 신고·신청이 두 번 들어가지 않게). ref로 막아서 연타도 걸러짐 */
export function useSubmit() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/** 화면이 보일 때마다 path를 다시 불러옴. 다른 화면에서 고치고 돌아와도 최신으로 보임. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0); // 검색어를 빨리 바꿀 때 늦게 온 옛 응답이 새 결과를 덮지 않게

  const reload = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const res = await api.get<T>(path);
      if (my !== seq.current) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (my === seq.current) setError(e as ApiError);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { data, error, loading, reload, setData };
}
