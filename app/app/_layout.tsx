// 맨 위 레이아웃: 로그인 전에는 login만, 로그인 후에는 (main) 화면들만 열림.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { listenPushTaps, registerPush } from '../lib/push';
import { useSession } from '../lib/session';

export default function RootLayout() {
  const loggedIn = !!useSession();

  useEffect(() => {
    if (loggedIn) registerPush();
  }, [loggedIn]);
  useEffect(() => listenPushTaps(), []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={loggedIn} redirectTo="/login">
          <Stack.Screen name="(main)" />
        </Stack.Protected>
        <Stack.Protected guard={!loggedIn} redirectTo="/">
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
