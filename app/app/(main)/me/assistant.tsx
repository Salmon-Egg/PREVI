// M-5 AI 비서 설정: 알림 종류별 켜기·끄기, 알림 시간
import { Stack } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';

import { Body, Card, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Me } from '../../../lib/types';

const KINDS: { key: keyof Omit<Me['notify'], 'time'>; label: string; desc: string }[] = [
  { key: 'notice', label: '나에게 해당하는 새 공지', desc: '수집한 공지가 내 학년·학적·조건에 맞을 때' },
  { key: 'deadline', label: '마감 알림', desc: '할 일 마감 전날·당일' },
  { key: 'calendar', label: '학사일정', desc: '일정 3일 전·당일' },
  { key: 'chat', label: '답변 도착', desc: '질문하고 앱을 나갔을 때' },
];
const TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];

export default function AssistantSettings() {
  const { data: me, error, loading, reload, setData } = useApi<Me>('/me');

  async function update(notify: Partial<Me['notify']>) {
    setData(await api.put<Me>('/me', { notify }));
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'AI 비서 설정' }} />
      <StateView loading={loading} error={error} empty={!me} onRetry={reload}>
        {me && (
          <>
            <Sub>비서는 내 학적·성적·시간표와 학교 공지를 대조해서 챙길 일을 찾아요. 정보는 학교 밖 AI 회사로 보내지 않아요.</Sub>
            <Title>알림 종류</Title>
            {KINDS.map((k) => (
              <Card key={k.key}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}><Body>{k.label}</Body><Sub>{k.desc}</Sub></View>
                  <Switch value={me.notify[k.key]} onValueChange={(v) => update({ [k.key]: v })} trackColor={{ true: color.primary }} />
                </Row>
              </Card>
            ))}
            <Title>마감 알림 받을 시간</Title>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TIMES.map((t) => (
                <Pressable key={t} onPress={() => update({ time: t })} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: me.notify.time === t ? color.primary : color.surface }}>
                  <Text style={{ color: me.notify.time === t ? '#fff' : color.ink, fontWeight: '700' }}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </StateView>
    </Screen>
  );
}
