// ▶ FE 7번에 해당하는 부분: M-1 로그인 (아이디 = 학번, 비밀번호) + 로그인 오류 표시 (새 시안 '로그인', '로그인(오류)')
// 확인은 lib/auth.ts (예시 데이터 모드·시연 서버·실제 Supabase). 처음이면 회원가입(signup.tsx)
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthField, AuthFrame, AuthLink } from '../components/AuthFrame';
import { Text } from '../components/Text';
import { PrivacySheet } from '../components/form';
import { Button } from '../components/ui';
import { useSubmit } from '../lib/api';
import { signIn } from '../lib/auth';
import { DEV_LOGIN, DEV_PASSWORD, PERSONAS, USE_MOCK } from '../lib/config';
import { ApiError } from '../lib/errors';
import { color } from '../lib/theme';
import { mockPersonaDesc } from '../mocks';

export default function Login() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const { busy, run } = useSubmit(); // 여러 번 눌러도 한 번만

  const submit = () => run(async () => {
    if (!id.trim() || !pw) return setError('아이디와 비밀번호를 입력해 주세요.');
    try {
      await signIn(id.trim(), pw); // 성공하면 맨 위 레이아웃이 홈으로 보냄
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
    }
  });

  /** 입력을 고치면 빨간 표시를 지움 */
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError('');
  };

  return (
    <AuthFrame title="로그인" sub="학교 아이디로 프리비를 시작해요." top={0.12}
      footer={(
        <Pressable onPress={() => setPrivacy(true)} style={{ paddingTop: 24 }}>
          <Text style={st.footer}>로그인하면 개인정보 수집·이용에 관한 안내에 동의한 것으로 봐요.</Text>
        </Pressable>
      )}>
      <AuthField label="아이디" placeholder="아이디를 입력하세요" value={id} onChangeText={edit(setId)} error={!!error}
        autoCapitalize="none" autoComplete="username" />
      <AuthField label="비밀번호" placeholder="비밀번호를 입력하세요" value={pw} onChangeText={edit(setPw)} error={error}
        secureTextEntry autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
      <View style={{ height: 4 }} />
      <Button label="로그인" onPress={submit} disabled={busy} />
      <AuthLink text="처음이신가요?" link="회원가입" onPress={() => router.push('/signup')} />

      {/* 시연용: 가상 학생 학번을 눌러 채움 (실제 서버에서는 안 보임) */}
      {DEV_LOGIN && (
        <View style={st.demo}>
          <Pressable onPress={() => setShowDemo(!showDemo)}>
            <Text style={st.demoHead}>시연용 계정 {showDemo ? '접기 ▲' : '보기 ▼'} · 비밀번호 {DEV_PASSWORD}</Text>
          </Pressable>
          {showDemo && PERSONAS.map((p) => (
            <Pressable key={p.id} style={st.demoRow} onPress={() => { setId(p.studentId); setPw(DEV_PASSWORD); setError(''); }}>
              <Text style={st.demoName}>{p.name} <Text style={st.demoId}>{p.studentId}</Text></Text>
              <Text style={st.demoDesc}>{USE_MOCK ? mockPersonaDesc(p.id) : p.desc}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <PrivacySheet visible={privacy} onClose={() => setPrivacy(false)} />
    </AuthFrame>
  );
}

const st = StyleSheet.create({
  footer: { textAlign: 'center', fontSize: 13, color: color.inkSub },
  demo: { borderTopWidth: 1, borderColor: color.line, paddingTop: 10, gap: 6 },
  demoHead: { textAlign: 'center', fontSize: 12, color: color.inkSub, fontWeight: '700' },
  demoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: color.primarySoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  demoName: { fontSize: 14, fontWeight: '800', color: color.ink },
  demoId: { fontSize: 13, fontWeight: '600', color: color.primary },
  demoDesc: { fontSize: 12, color: color.inkSub },
});
