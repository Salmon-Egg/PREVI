// 로그인 후 화면들. 처음 쓰는 학생(내 정보가 없음)이면 처음 설정(M-2)으로 보냄.
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { api, ApiError } from '../../lib/api';
import { color } from '../../lib/theme';

export default function MainLayout() {
  useEffect(() => {
    api.get('/me').catch((e: ApiError) => {
      if (e.code === 'NO_PROFILE') router.replace('/onboarding');
    });
  }, []);

  return (
    <Stack
      screenOptions={{
        headerTintColor: color.ink,
        headerTitleStyle: { fontWeight: '800', color: color.primary }, // 시안: 화면 제목은 초록
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: color.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: '처음 설정', headerBackVisible: false }} />
    </Stack>
  );
}
