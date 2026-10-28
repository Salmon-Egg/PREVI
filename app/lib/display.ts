// ▶ FE 9번에 해당하는 부분: 마이페이지 '화면 설정' — 글자 크기(표준/크게). 이 기기에만 저장 (서버에 안 보냄)
// 글자 크기: components/Text.tsx가 글자 크기에 FONT_SCALE을 곱함
// (다크 모드는 2026-10-29 뺌: 색을 뒤집는 방식이라 화면이 어색했음 → 다크용 색 묶음을 만들 때 다시 넣기)
import { useSyncExternalStore } from 'react';

export type Display = { large: boolean };

const KEY = 'display-v1';

let display: Display = { large: false };
try {
  display = { large: !!JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}').large };
} catch {}
const listeners = new Set<() => void>();

export function setDisplay(patch: Partial<Display>) {
  display = { ...display, ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(display));
  } catch {}
  listeners.forEach((l) => l());
}

export function useDisplay() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => display,
  );
}

/** '크게'일 때 글자 크기 배율 */
export const FONT_SCALE = 1.12;
