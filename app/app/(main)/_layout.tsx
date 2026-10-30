// ▶ FE 1번에 해당하는 부분: 메뉴별 스택 화면 + 처음 쓰는 학생은 M-2(FE 8번)로 보냄
// 로그인 후 화면들. 처음 쓰는 학생(내 정보가 없음)이면 처음 설정(M-2)으로 보냄.
// 머리줄(‹ 제목)은 화면마다 components/ui.tsx의 Screen이 직접 그림 (새 시안: 배경 위에 초록 제목)
// ▶ FE 15번에 해당하는 부분: 끌어 올리는 AI 대화창(ChatSheet)은 모든 화면 위에 하나 (홈에서는 아래 바, 다른 화면에서는 '묻기'로 올라옴)
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ChatSheet } from '../../components/ChatSheet';
import { api, ApiError } from '../../lib/api';
import type { Me } from '../../lib/types';

export default function MainLayout() {
  // 처음 쓰는 학생: API 명세는 NO_PROFILE, 서버(server/routes/me.py)는 PROFILE_NOT_FOUND → 둘 다 받음
  useEffect(() => {
    api.get<Me>('/me').then((me) => {
      // 프로필 행이 있어도 최초 설정이 끝나지 않은 계정은 설정 화면으로 보낸다.
      if (!me.department || !me.admission_year || !me.grade || !me.semester || !me.consent.agreed) router.replace('/onboarding');
    }).catch((e: ApiError) => {
      if (e.code === 'NO_PROFILE' || e.code === 'PROFILE_NOT_FOUND') router.replace('/onboarding');
    });
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <ChatSheet />
    </View>
  );
}
