// ▶ FE 7번에 해당하는 부분: 회원가입 (새 시안) — 학번·이름·학교 이메일(인증번호 받기 → 확인)·비밀번호(6자 이상, Supabase 기본 규칙)
// 가입하면 바로 로그인되고, 내 정보가 없으니 처음 설정(M-2, FE 8번)부터 시작함
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthField, AuthFrame, AuthLink } from '../components/AuthFrame';
import { Button, showAlert } from '../components/ui';
import { useSubmit } from '../lib/api';
import { checkEmail, PASSWORD_MIN, sendSignupCode, signUp, verifySignupCode } from '../lib/auth';
import { ApiError } from '../lib/errors';

type Field = 'studentId' | 'name' | 'email' | 'code' | 'password';
const message = (e: unknown) => (e instanceof ApiError ? e.message : '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');

export default function Signup() {
  const [form, setForm] = useState({ studentId: '', name: '', email: '', code: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sent, setSent] = useState(false); // 인증번호를 보냈는지
  const [verified, setVerified] = useState(false); // 인증을 마쳤는지
  const { busy, run } = useSubmit();
  const email = form.email.trim().toLowerCase();

  const set = (k: Field) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const fail = (k: Field, msg: string) => setErrors((e) => ({ ...e, [k]: msg }));

  const sendCode = () => run(async () => {
    const bad = checkEmail(email);
    if (bad) return fail('email', bad);
    try {
      const demo = await sendSignupCode(email);
      setSent(true);
      setVerified(false);
      showAlert('인증번호를 보냈어요', demo ? `시연용이라 메일 대신 알려 드려요.\n인증번호: ${demo}` : `${email} 메일함을 확인해 주세요.`);
    } catch (e) {
      fail('email', message(e));
    }
  });

  const verify = () => run(async () => {
    if (!/^\d{6}$/.test(form.code.trim())) return fail('code', '6자리 숫자를 입력해 주세요.');
    try {
      await verifySignupCode(email, form.code.trim());
      setVerified(true);
    } catch (e) {
      fail('code', message(e));
    }
  });

  const submit = () => run(async () => {
    const next: Partial<Record<Field, string>> = {};
    if (!/^\d{6,10}$/.test(form.studentId.trim())) next.studentId = '학번을 숫자로 입력해 주세요.';
    if (!form.name.trim()) next.name = '이름을 입력해 주세요.';
    if (!verified) next.code = '이메일 인증을 마쳐 주세요.';
    if (form.password.length < PASSWORD_MIN) next.password = `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await signUp({ studentId: form.studentId.trim(), name: form.name.trim(), email, password: form.password });
      // 로그인 상태가 되면 맨 위 레이아웃이 홈 → 처음 설정으로 보냄
    } catch (e) {
      showAlert('가입하지 못했어요', message(e));
    }
  });

  return (
    <AuthFrame title="회원가입" sub="학번과 학교 이메일로 인증하고 시작해요." top={0.03}>
      <AuthField label="학번" placeholder="학번을 입력하세요" value={form.studentId} onChangeText={set('studentId')} error={errors.studentId}
        keyboardType="number-pad" />
      <AuthField label="이름" placeholder="이름을 입력하세요" value={form.name} onChangeText={set('name')} error={errors.name} />
      <AuthField label="이메일" placeholder="이메일을 입력하세요" value={form.email} onChangeText={(v) => { set('email')(v); setSent(false); setVerified(false); }}
        error={errors.email} autoCapitalize="none" keyboardType="email-address" editable={!verified}
        action={{ label: sent ? '다시 받기' : '인증번호 받기', onPress: sendCode, disabled: busy || verified || !email }} />
      <AuthField label="인증번호" placeholder="6자리 숫자" value={form.code} onChangeText={set('code')} error={errors.code}
        keyboardType="number-pad" maxLength={6} editable={sent && !verified}
        action={{ label: verified ? '확인됨 ✓' : '확인', onPress: verify, disabled: busy || !sent || verified }} />
      <AuthField label="비밀번호" placeholder={`${PASSWORD_MIN}자 이상 입력하세요`} value={form.password} onChangeText={set('password')} error={errors.password}
        secureTextEntry autoComplete="new-password" />
      <View style={{ height: 4 }} />
      <Button label="가입하기" onPress={submit} disabled={busy} />
      <AuthLink text="이미 계정이 있어요" link="로그인" onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />
    </AuthFrame>
  );
}
