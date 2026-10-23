// H-3 대화 목록: 검색, 고정
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { Card, Row, Screen, StateView, Sub, s } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Conversation } from '../../../lib/types';

export default function History() {
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi<Conversation[]>(`/conversations?q=${encodeURIComponent(q)}`);

  async function togglePin(c: Conversation) {
    await api.patch(`/conversations/${c.id}`, { pinned: !c.pinned });
    reload();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '대화 목록' }} />
      <TextInput style={[s.card, { fontSize: 15 }]} placeholder="대화 검색" value={q} onChangeText={setQ} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="대화가 없어요" onRetry={reload}>
        {data?.map((c) => (
          <Card key={c.id} onPress={() => router.push({ pathname: '/chat', params: { conversation: String(c.id) } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: color.ink }} numberOfLines={1}>{c.title}</Text>
              <Pressable onPress={() => togglePin(c)}><Text>{c.pinned ? '📌' : '📍'}</Text></Pressable>
            </Row>
            <Sub>{c.updated_at.slice(0, 16).replace('T', ' ')}</Sub>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
