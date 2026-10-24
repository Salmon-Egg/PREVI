// ▶ FE 5번에 해당하는 부분: 서버 푸시 — 알림 권한 요청, 푸시 토큰 등록(PUT /me), 알림을 눌렀을 때 대상 화면 이동,
//   앱 사용 중 수신 시 앱 안 표시(배너 + 홈 알림 점 새로고침), 앱이 꺼진 상태에서 알림으로 열었을 때도 이동
// 푸시 알림: 권한 요청 → 토큰을 서버에 등록(PUT /me) → 알림을 누르면 해당 화면으로.
// Expo Go와 웹에서는 동작하지 않음. EAS 개발 빌드(eas.json의 development 프로필)에서 확인 (FE B).
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';
import type { NotifyType } from './types';

// Expo Go·웹에서는 불러오기만 해도 경고창이 떠서 아예 안 불러옴
const off = Platform.OS === 'web' || isRunningInExpoGo();
const Notifications: typeof import('expo-notifications') = off ? (null as any) : require('expo-notifications');

if (!off) Notifications.setNotificationHandler({
  // 앱을 쓰는 중에 와도 위에 띄움
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/** 알림 종류 → 열 화면 (API 명세 '알림' 표) */
export function screenFor(type: NotifyType, targetId: number | null): Href {
  switch (type) {
    case 'notice':
      return `/notices/${targetId}`;
    case 'deadline':
      return `/todos/${targetId}`;
    case 'calendar':
      return '/office/calendar';
    case 'chat':
      return { pathname: '/chat', params: { conversation: String(targetId) } };
  }
}

export async function registerPush() {
  if (off || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: '기본', importance: Notifications.AndroidImportance.MAX });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return; // eas init 전이면 건너뜀
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.put('/me', { push_token: data });
  } catch (e) {
    console.warn('푸시 등록 실패', e);
  }
}

// 앱을 쓰는 중에 알림이 오면 알려 줄 곳 (홈이 안 읽은 알림 점을 다시 불러옴)
const received = new Set<() => void>();

/** 앱 사용 중 알림 수신을 구독. 정리 함수를 돌려줌 */
export function onPushReceived(fn: () => void) {
  received.add(fn);
  return () => {
    received.delete(fn);
  };
}

type PushData = { type?: NotifyType; target_id?: number | null };

/** 알림을 누르면 data.type, data.target_id로 화면 이동. 정리 함수를 돌려줌. */
export function listenPushTaps() {
  if (off) return () => {};
  const open = (d: PushData | undefined) => {
    if (d?.type) router.push(screenFor(d.type, d.target_id ?? null));
  };
  // 앱이 꺼져 있을 때 알림을 눌러서 켠 경우: 마지막으로 누른 알림을 한 번만 처리
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    setTimeout(() => open(last.notification.request.content.data as PushData), 0); // 화면 준비 뒤 이동
    Notifications.clearLastNotificationResponse();
  }
  const tap = Notifications.addNotificationResponseReceivedListener((res) => open(res.notification.request.content.data as PushData));
  const got = Notifications.addNotificationReceivedListener(() => received.forEach((fn) => fn()));
  return () => {
    tap.remove();
    got.remove();
  };
}
