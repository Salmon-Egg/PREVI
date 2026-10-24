// ▶ FE 7번에 해당하는 부분: M-1 로그인 (학교 이메일 인증번호, 시연 모드면 가상 학생 4명)
// M-1 로그인: 학교 이메일로 인증번호 받기. 시연 모드(DEV_LOGIN)에서는 가상 학생 4명 중 선택.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Screen, Sub, Title, s } from '../components/ui';
import { DEV_LOGIN, EMAIL_DOMAIN, PERSONAS } from '../lib/config';
import { login, supabase } from '../lib/session';
import { color } from '../lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');

  async function sendCode() {
    if (EMAIL_DOMAIN && !email.endsWith('@' + EMAIL_DOMAIN)) return setMsg(`@${EMAIL_DOMAIN} 학교 이메일만 쓸 수 있어요`);
    const { error } = await supabase!.auth.signInWithOtp({ email });
    if (error) return setMsg(error.message);
    setSent(true);
    setMsg('메일로 받은 인증번호를 입력해 주세요');
  }

  async function verify() {
    const { data, error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error || !data.session) return setMsg(error?.message ?? '인증번호가 맞지 않아요');
    login(data.session.access_token);
  }

  return (
    <Screen>
      <View style={{ marginTop: 48, gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: color.primary }}>서경 AI</Text>
        <Sub>서경대학교 스마트 비서</Sub>
      </View>

      {DEV_LOGIN ? (
        <>
          <Title>시연용 학생으로 시작하기</Title>
          {PERSONAS.map((p) => (
            <Card key={p.id} onPress={() => login(`dev-${p.id}`)}>
              <Body style={{ fontWeight: '700' }}>{p.name}</Body>
              <Sub>{p.desc}</Sub>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Title>학교 이메일로 로그인</Title>
          <TextInput style={input} placeholder={`학번@${EMAIL_DOMAIN || 'skuniv.ac.kr'}`} autoCapitalize="none"
            keyboardType="email-address" value={email} onChangeText={setEmail} editable={!sent} />
          {sent && <TextInput style={input} placeholder="인증번호 6자리" keyboardType="number-pad" value={code} onChangeText={setCode} />}
          <Button label={sent ? '로그인' : '인증번호 받기'} onPress={sent ? verify : sendCode} disabled={!email} />
        </>
      )}
      {!!msg && <Sub style={{ color: color.alert }}>{msg}</Sub>}
    </Screen>
  );
}

const input = [s.card, { fontSize: 15, color: color.ink }];
