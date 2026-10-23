// M-2 처음 설정: 학적 → 성적 입력 안내 → 개인정보 동의(성적 포함) → 알림 허용
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Body, Button, Card, Row, Screen, Sub, Title } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { registerPush } from '../../lib/push';
import { color } from '../../lib/theme';
import { STATUS_KO, type Status } from '../../lib/types';

const DEPTS = ['소프트웨어학과', '전자컴퓨터공학과'];
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const STATUSES: Status[] = ['enrolled', 'leave', 'returned'];

function Choice<T extends string | number>({ items, value, onChange, label = (v: T) => String(v) }: {
  items: T[]; value: T | null; onChange: (v: T) => void; label?: (v: T) => string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((v) => (
        <Pressable key={String(v)} onPress={() => onChange(v)}
          style={{ borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: v === value ? color.primary : color.surface }}>
          <Text style={{ color: v === value ? '#fff' : color.ink, fontWeight: '600' }}>{label(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [dept, setDept] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('enrolled');
  const [year, setYear] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState('');

  async function finish() {
    try {
      await api.put('/me', { department: dept, grade, semester, status, admission_year: year, consent: { agreed: true } });
      await registerPush(); // 알림 허용 묻기
      router.replace('/');
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  }

  return (
    <Screen>
      <Sub>{step + 1} / 3</Sub>
      {step === 0 && (
        <>
          <Title>학적 정보를 알려 주세요</Title>
          <Sub>비서가 나에게 해당하는 공지·장학금·졸업 요건을 고르는 데 써요. 학번 전체는 받지 않아요.</Sub>
          <Body>학과</Body><Choice items={DEPTS} value={dept} onChange={setDept} />
          <Body>학년</Body><Choice items={[1, 2, 3, 4]} value={grade} onChange={setGrade} label={(v) => `${v}학년`} />
          <Body>학기</Body><Choice items={[1, 2]} value={semester} onChange={setSemester} label={(v) => `${v}학기`} />
          <Body>학적 상태</Body>
          <Choice items={STATUSES} value={status} onChange={setStatus} label={(v) => STATUS_KO[v]} />
          <Body>입학년도</Body><Choice items={YEARS} value={year} onChange={setYear} />
          <Button label="다음" disabled={!dept || !grade || !semester || !year} onPress={() => setStep(1)} />
        </>
      )}
      {step === 1 && (
        <>
          <Title>성적은 나중에 입력해도 돼요</Title>
          <Sub>내 학업 › 성적에서 학기별 과목·학점·성적을 입력하면 졸업까지 남은 학점과 장학금 신청 가능 여부를 계산해 드려요.</Sub>
          <Button label="다음" onPress={() => setStep(2)} />
        </>
      )}
      {step === 2 && (
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
          <Button label="시작하기 · 알림 허용" disabled={!agreed} onPress={finish} />
          {!!msg && <Sub style={{ color: color.alert }}>{msg}</Sub>}
        </>
      )}
    </Screen>
  );
}
