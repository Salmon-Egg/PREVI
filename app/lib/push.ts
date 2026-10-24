// 푸시 알림: 권한 요청 → 토큰을 서버에 등록(PUT /me) → 알림을 누르면 해당 화면으로.
// Expo Go와 웹에서는 동작하지 않음. EAS 개발 빌드에서 확인 (FE B).
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

/** 알림을 누르면 data.type, data.target_id로 화면 이동. 정리 함수를 돌려줌. */
export function listenPushTaps() {
  if (off) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const d = res.notification.request.content.data as { type?: NotifyType; target_id?: number | null };
    if (d?.type) router.push(screenFor(d.type, d.target_id ?? null));
  });
  return () => sub.remove();
}
