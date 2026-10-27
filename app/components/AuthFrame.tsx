// ▶ FE 7번에 해당하는 부분: 로그인·회원가입 공통 틀 (새 시안: 하늘 배경 + 흐린 구름, 왼쪽 위 PREVI 로고, 가운데 흰 카드)
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gradient, webBlur } from '../lib/theme';
import { Input } from './form';
import { Text } from './Text';
import { AppBackground } from './ui';

const web = Platform.OS === 'web';

/** top: 카드 위 여백 비율(화면 높이 대비). 로그인은 카드가 화면 가운데쯤, 회원가입은 칸이 많아 조금 위 */
export function AuthFrame({ title, sub, top, footer, children }: { title: string; sub: string; top: number; footer?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <View style={{ flex: 1 }}>
      <AppBackground css={gradient.login} />
      {/* 흐린 구름 두 덩이 (로그인 시안) */}
      <View pointerEvents="none" style={[st.cloud, { top: insets.top + 56, left: '33%', width: 150, height: 34 }]} />
      <View pointerEvents="none" style={[st.cloud, { top: insets.top + 140, right: 10, width: 120, height: 24, opacity: 0.7 }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[st.scroll, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
          <View style={st.logoRow}>
            <Text style={st.logo}>PREVI</Text>
            <MaterialCommunityIcons name="leaf" size={30} color="#2FA160" />
          </View>
          <Text style={st.logoSub}>서경대학교 스마트 비서</Text>
          <View style={[st.card, { marginTop: Math.max(28, height * top) }]}>
            <Text style={st.title}>{title}</Text>
            <Text style={st.sub}>{sub}</Text>
            {children}
          </View>
          <View style={{ flex: 1 }} />
          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** 라벨 + 입력칸 (+ 칸 안 오른쪽 버튼) + 아래 오류 문구 */
export function AuthField({ label, error, action, ...props }: TextInputProps & {
  label: string; error?: string | boolean; action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <View>
        <Input {...props} error={!!error} style={[st.input, action && { paddingRight: 128 }]} />
        {action && (
          <Pressable onPress={action.onPress} disabled={action.disabled} style={[st.inBtn, action.disabled && { opacity: 0.55 }]}>
            <Text style={st.inBtnText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {typeof error === 'string' && !!error && <Text style={st.error}>{error}</Text>}
    </View>
  );
}

/** "처음이신가요? 회원가입" 같은 한 줄 링크 */
export function AuthLink({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  return (
    <Text style={st.linkRow}>
      {text} <Text style={st.link} onPress={onPress}>{link}</Text>
    </Text>
  );
}

const st = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.85)', ...(web ? ({ filter: 'blur(10px)' } as object) : { opacity: 0.5 }) },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  logo: { fontSize: 40, fontWeight: '900', color: '#13774A', letterSpacing: 0.5 },
  logoSub: { fontSize: 15, color: '#4D5A55', marginTop: 2, paddingHorizontal: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 30, padding: 22, gap: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', ...(webBlur(12) ?? {}),
    shadowColor: '#4C8C6A', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  title: { fontSize: 26, fontWeight: '900', color: '#13774A' },
  sub: { fontSize: 15, color: '#4D5A55', marginTop: -6, marginBottom: 4 },
  label: { fontSize: 15, color: '#3D4743' },
  input: { borderRadius: 16, paddingVertical: 15, fontSize: 16, fontWeight: '400' },
  inBtn: { position: 'absolute', right: 6, top: 6, bottom: 6, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#0E6B45' },
  inBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  error: { color: color.red, fontSize: 13, fontWeight: '700' },
  linkRow: { textAlign: 'center', fontSize: 15, color: '#4D5A55' },
  link: { color: '#13774A', fontWeight: '900', textDecorationLine: 'underline' },
});
