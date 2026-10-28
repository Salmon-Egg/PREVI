// ▶ FE 8번에 해당하는 부분: M-2 처음 설정
// 학적(학과·부전공·학년·학기·학적 상태) → 개인정보 동의(성적 포함) → 알림 허용
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { DeptPicker, MinorPicker } from '../../components/DeptPicker';
import { Body, Button, Card, Character, Row, Screen, Sub, Title } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { signupName } from '../../lib/auth';
import { registerPush } from '../../lib/push';
import { STATUSES } from '../../lib/constants';
import { color, gradient, gradientBg } from '../../lib/theme';
import { STATUS_KO, type Status } from '../../lib/types';

// 옛 학과 이름(2017~2024 입학)도 고를 수 있게 넉넉히. 입학연도는 학과 목록의 추천 정렬에 씀
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const STEPS = 3;

function Choice<T extends string | number>({ items, value, onChange, label = (v: T) => String(v) }: {
  items: T[]; value: T | null; onChange: (v: T) => void; label?: (v: T) => string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((v) => (
        <Pressable key={String(v)} onPress={() => onChange(v)}
          style={[{ borderRadius: 12, paddingVertical: 9, paddingHorizontal: 13, borderWidth: 1.5, borderColor: v === value ? 'transparent' : color.field, backgroundColor: '#fff' },
            v === value && gradientBg(gradient.primary, color.primary)]}>
          <Text style={{ color: v === value ? '#fff' : color.title, fontWeight: '700' }}>{label(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [dept, setDept] = useState(''); // 직접 고르기 전까지 비워 둠 (첫 항목으로 잘못 저장되지 않게)
  const [minor, setMinor] = useState('없음');
  const [grade, setGrade] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('enrolled');
  const [year, setYear] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState('');

  // 2단계(동의)까지 마치면 학적·동의를 먼저 저장 → 3단계에서 알림 허용만 따로 물음
  // 이름은 회원가입 때 적은 것을 같이 저장 (홈 인사말·마이페이지에 보임)
  async function saveProfile() {
    try {
      const nickname = await signupName();
      await api.put('/me', {
        department: dept, minor: minor === '없음' ? null : minor, grade, semester, status, admission_year: year,
        consent: { agreed: true }, ...(nickname ? { nickname } : null),
      });
      setMsg('');
      setStep(2);
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  }

  async function finish(allowPush: boolean) {
    if (allowPush) await registerPush(); // 권한 요청 → 토큰을 PUT /me로 등록 (FE 5번)
    router.replace('/');
  }

  return (
    <Screen title="처음 설정" back={false}>
      {/* 진행 막대 */}
      <View style={st.progress}>
        {Array.from({ length: STEPS }, (_, i) => <View key={i} style={[st.step, i <= step && st.stepOn]} />)}
      </View>
      <Sub>{step + 1} / {STEPS}</Sub>

      {step === 0 && (
        <>
          <Title>학적 정보를 알려 주세요</Title>
          <Sub>비서가 나에게 해당하는 공지·장학금·졸업 요건을 고르는 데 써요.</Sub>
          {/* 학과가 많아서 버튼 대신 목록에서 고름 */}
          {/* 입학연도를 먼저 받아서 학과 목록에서 그 학번에 맞는 학과를 위로 올림 */}
          <Body>입학년도</Body><Choice items={YEARS} value={year} onChange={setYear} />
          <Body>학과</Body><DeptPicker value={dept} year={year} onChange={setDept} title="학과" />
          <Body>복수 / 부전공</Body><MinorPicker value={minor} year={year} onChange={setMinor} />
          <Body>학년</Body><Choice items={[1, 2, 3, 4]} value={grade} onChange={setGrade} label={(v) => `${v}학년`} />
          <Body>학기</Body><Choice items={[1, 2]} value={semester} onChange={setSemester} label={(v) => `${v}학기`} />
          <Body>학적 상태</Body>
          <Choice items={STATUSES} value={status} onChange={setStatus} label={(v) => STATUS_KO[v]} />
          <Button label="다음" disabled={!dept || !grade || !semester || !year} onPress={() => setStep(1)} />
        </>
      )}
      {step === 1 && (
        <>
          <Title>개인정보 수집·이용 동의</Title>
          <Card>
            <Body>수집 항목: 학과, 부전공, 학년·학기, 학적 상태, 입학년도, 직접 입력한 성적, 시간표, 채팅 내용</Body>
            <Body>이용 목적: 나에게 해당하는 공지·장학금·졸업 요건 안내와 알림</Body>
            <Body>보관: 계정을 삭제하면 성적을 포함한 모든 정보가 함께 지워져요.</Body>
          </Card>
          <Pressable onPress={() => setAgreed(!agreed)}>
            <Row><Text style={{ fontSize: 20 }}>{agreed ? '☑' : '☐'}</Text><Body>위 내용에 동의해요 (필수)</Body></Row>
          </Pressable>
          <Button label="동의하고 다음" disabled={!agreed} onPress={saveProfile} />
          <Button label="이전" kind="ghost" onPress={() => setStep(0)} />
        </>
      )}
      {step === 2 && (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Character size={150} />
          <Title>마감을 놓치지 않게 알려 드릴까요?</Title>
          <Sub style={{ textAlign: 'center' }}>
            나에게 해당하는 새 공지, 마감 전날·당일, 학사일정을 휴대폰 알림으로 보내 드려요.{'\n'}
            알림 종류와 시간은 마이 › AI 비서 설정에서 바꿀 수 있어요.
          </Sub>
          {Platform.OS === 'web' && <Sub style={{ color: color.warn }}>웹에서는 휴대폰 알림이 오지 않아요. 앱 안 알림 센터에서 확인할 수 있어요.</Sub>}
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <Button label="알림 허용하고 시작하기" onPress={() => finish(true)} />
            <Button label="나중에 할게요" kind="ghost" onPress={() => finish(false)} />
          </View>
        </View>
      )}
      {!!msg && <Sub style={{ color: color.alert }}>{msg}</Sub>}
    </Screen>
  );
}

const st = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line },
  stepOn: { backgroundColor: color.primary },
});
