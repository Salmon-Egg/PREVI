// L-4 ~ L-7 과목 추가: 방식 선택 → 과목 검색으로 추가 / 직접 입력 → 시간 중복·학점 초과면 경고
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Screen, showAlert, Sub, Title, s } from '../../../components/ui';
import { api, ApiError, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Course } from '../../../lib/types';

const DAYS = ['월', '화', '수', '목', '금'];

export default function AddCourse() {
  const [mode, setMode] = useState<'search' | 'direct' | null>(null);
  return (
    <Screen>
      <Stack.Screen options={{ title: '과목 추가' }} />
      {!mode && (
        <>
          <Title>추가 방식을 골라 주세요</Title>
          <Card onPress={() => setMode('search')}><Body style={{ fontWeight: '700' }}>과목 검색으로 추가</Body><Sub>과목명으로 빠르게 검색</Sub></Card>
          <Card onPress={() => setMode('direct')}><Body style={{ fontWeight: '700' }}>직접 입력으로 추가</Body><Sub>과목명, 요일, 시간을 직접 입력</Sub></Card>
        </>
      )}
      {mode === 'search' && <Search />}
      {mode === 'direct' && <Direct />}
    </Screen>
  );
}

/** 저장. 겹치거나 학점을 넘으면 서버가 409로 알려 줌 (L-7 등록 불가) */
async function save(body: object) {
  try {
    await api.post('/timetable', body);
    router.back();
  } catch (e) {
    const err = e as ApiError;
    showAlert(err.code === 'TIME_CONFLICT' ? '수강 과목 등록 불가' : err.code === 'CREDIT_LIMIT' ? '학점 초과' : '저장 실패', err.message);
  }
}

function Search() {
  const [q, setQ] = useState('');
  const { data } = useApi<Course[]>(q.length >= 1 ? `/courses?q=${encodeURIComponent(q)}` : null);
  return (
    <>
      <TextInput style={[s.card, { fontSize: 15 }]} placeholder="과목명을 입력하세요" value={q} onChangeText={setQ} autoFocus />
      {!q && <Sub>수강할 과목을 검색해 주세요</Sub>}
      {q !== '' && data?.length === 0 && <Sub>검색 결과가 없어요. 직접 입력으로 추가해 보세요.</Sub>}
      {data?.map((c) => (
        <Card key={c.id}>
          <Body style={{ fontWeight: '700' }}>{c.name}</Body>
          <Sub>{c.credits}학점 · {c.area} · {c.times.map((t) => `${t.day} ${t.start}~${t.end}`).join(', ')}</Sub>
          <Button label="+ 추가" kind="ghost" onPress={() => save({ course_id: c.id })} />
        </Card>
      ))}
    </>
  );
}

function Direct() {
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('3');
  const [day, setDay] = useState('월');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:30');
  const field = [s.card, { fontSize: 15 }];
  return (
    <>
      <Sub>과목명</Sub>
      <TextInput style={field} value={name} onChangeText={setName} placeholder="예: 모바일 앱 프로그래밍" />
      <Sub>학점</Sub>
      <TextInput style={field} value={credits} onChangeText={setCredits} keyboardType="number-pad" />
      <Sub>요일</Sub>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DAYS.map((d) => (
          <Pressable key={d} onPress={() => setDay(d)} style={{ padding: 10, borderRadius: 10, backgroundColor: d === day ? color.primary : color.surface }}>
            <Text style={{ color: d === day ? '#fff' : color.ink, fontWeight: '700' }}>{d}</Text>
          </Pressable>
        ))}
      </View>
      <Sub>시간 (24시간 · 예: 13:00)</Sub>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[...field, { flex: 1 }]} value={start} onChangeText={setStart} />
        <TextInput style={[...field, { flex: 1 }]} value={end} onChangeText={setEnd} />
      </View>
      <Button label="시간표에 추가하기" disabled={!name}
        onPress={() => save({ course_name: name, credits: Number(credits), times: [{ day, start, end }] })} />
    </>
  );
}
