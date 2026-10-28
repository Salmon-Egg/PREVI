// ▶ FE 1번·4번·5번에 해당하는 부분: 로그인 여부로 화면 묶음 전환(로그인 상태 관리), 로그인 후 푸시 등록·알림 누르기 처리
// 맨 위 레이아웃: 로그인 전에는 login·signup만, 로그인 후에는 (main) 화면들만 열림.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { DialogHost } from '../components/ui';
import { listenPushTaps, registerPush } from '../lib/push';
import { useSession } from '../lib/session';
import { color } from '../lib/theme';

const web = Platform.OS === 'web';

export default function RootLayout() {
  const loggedIn = !!useSession();

  useEffect(() => {
    if (loggedIn) registerPush();
  }, [loggedIn]);
  useEffect(() => listenPushTaps(), []);

  return (
    // ▶ FE 6번에 해당하는 부분: 웹 링크를 PC 화면으로 열어도 휴대폰 폭(최대 480px)으로 가운데 보이게
    <View style={web ? st.webOuter : st.fill}>
      <View style={web ? st.webPhone : st.fill}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={loggedIn} redirectTo="/login">
            <Stack.Screen name="(main)" />
          </Stack.Protected>
          <Stack.Protected guard={!loggedIn} redirectTo="/">
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
          </Stack.Protected>
        </Stack>
        {/* 웹에서 알림창·확인 창 (FE 6번) */}
        <DialogHost />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  webOuter: { flex: 1, backgroundColor: color.surface },
  webPhone: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', overflow: 'hidden', backgroundColor: color.bg },
});
