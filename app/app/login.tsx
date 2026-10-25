// ▶ FE 7번에 해당하는 부분: M-1 로그인 (학교 이메일 인증번호, 시연 모드면 가상 학생 4명)
// M-1 로그인: 학교 이메일로 인증번호 받기. 시연 모드(DEV_LOGIN)에서는 가상 학생 4명 중 선택.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Screen, Sub, Title, s } from '../components/ui';
import { useSubmit } from '../lib/api';
import { DEV_LOGIN, EMAIL_DOMAIN, PERSONAS, USE_MOCK } from '../lib/config';
import { mockPersonaDesc } from '../mocks';
import { login, supabase } from '../lib/session';
import { color } from '../lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');

  const { busy, run: submit } = useSubmit();
  const addr = email.trim().toLowerCase(); // 앞뒤 공백·대문자로 도메인 검사가 어긋나지 않게

  // 버튼을 여러 번 눌러 메일이 여러 통 가거나, 네트워크 오류로 멈추지 않게 한 번에 하나만
  function run(fn: () => Promise<void>) {
    if (!supabase) return setMsg('로그인 설정(SUPABASE_URL)이 비어 있어요. app/.env를 확인해 주세요.');
    return submit(() => fn().catch(() => setMsg('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.')));
  }

  const sendCode = () => run(async () => {
    if (!/^[^\s@]+@[^\s@]+$/.test(addr)) return setMsg('이메일 주소를 확인해 주세요');
    if (EMAIL_DOMAIN && !addr.endsWith('@' + EMAIL_DOMAIN.toLowerCase())) return setMsg(`@${EMAIL_DOMAIN} 학교 이메일만 쓸 수 있어요`);
    const { error } = await supabase!.auth.signInWithOtp({ email: addr });
    if (error) return setMsg(error.message);
    setSent(true);
    setMsg('메일로 받은 인증번호를 입력해 주세요');
  });

  const verify = () => run(async () => {
    const { data, error } = await supabase!.auth.verifyOtp({ email: addr, token: code.trim(), type: 'email' });
    if (error || !data.session) return setMsg(error?.message ?? '인증번호가 맞지 않아요');
    login(data.session.access_token);
  });

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
              {/* 예시 데이터 모드: 마이페이지에서 고친 학년·학과(또는 탈퇴함)를 그대로 보여 줌 */}
              <Sub>{USE_MOCK ? mockPersonaDesc(p.id) : p.desc}</Sub>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Title>학교 이메일로 로그인</Title>
          <TextInput style={input} placeholder={`학번@${EMAIL_DOMAIN || 'skuniv.ac.kr'}`} autoCapitalize="none"
            keyboardType="email-address" value={email} onChangeText={setEmail} editable={!sent} />
          {sent && <TextInput style={input} placeholder="인증번호 6자리" keyboardType="number-pad" value={code} onChangeText={setCode} />}
          <Button label={sent ? '로그인' : '인증번호 받기'} onPress={sent ? verify : sendCode} disabled={busy || !addr || (sent && !code.trim())} />
        </>
      )}
      {!!msg && <Sub style={{ color: color.alert }}>{msg}</Sub>}
    </Screen>
  );
}

const input = [s.card, { fontSize: 15, color: color.ink }];
