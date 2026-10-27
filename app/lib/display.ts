// ▶ FE 9번에 해당하는 부분: 마이페이지 '화면 설정' (다크 모드, 글자 크기). 이 기기에만 저장 (서버에 안 보냄)
// 다크 모드: 화면 전체 색을 뒤집고(밝은 곳 ↔ 어두운 곳) 색상은 그대로 둠. 사진·캐릭터는 한 번 더 뒤집어 원래대로 (NO_INVERT)
// ⚠️ 휴대폰 앱은 안드로이드만 적용됨 (iOS는 RN filter를 지원하지 않음). 웹·안드로이드 OK
// 글자 크기: components/Text.tsx가 글자 크기에 FONT_SCALE을 곱함
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type Display = { dark: boolean; large: boolean };

const KEY = 'display-v1';
const INVERT = 'invert(1) hue-rotate(180deg)';

let display: Display = { dark: false, large: false };
try {
  display = { ...display, ...JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') };
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

/** 맨 위에 거는 다크 모드 필터. 웹은 창(Modal)까지 같이 뒤집히게 html에 검 */
export function applyDark(dark: boolean) {
  if (Platform.OS === 'web') {
    document.documentElement.style.filter = dark ? INVERT : '';
    return null;
  }
  return dark ? ({ filter: INVERT } as object) : null;
}

/** 사진·캐릭터: 다크 모드에서 한 번 더 뒤집어 원래 색으로 */
export function useNoInvert() {
  return useDisplay().dark ? ({ filter: INVERT } as object) : null;
}
