// 분실물(습득물) 목록 — 보관 중/전달 완료 탭, 종류 칩 + 검색, 최신순. 아래 버튼으로 주운 물건 올리기
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Input, NO_GROW, Segmented } from '../../../components/form';
import { LostPhoto } from '../../../components/LostPhoto';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, Chips, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { LOST_CATEGORIES, type LostCategory, type LostItem } from '../../../lib/types';

export default function LostList() {
  const [category, setCategory] = useState<LostCategory | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LostItem['status']>('open');
  const query = new URLSearchParams({ status, ...(category && { category }), ...(q.trim() && { q: q.trim() }) }).toString();
  const { data, error, loading, reload } = useApi<LostItem[]>(`/lost-items?${query}`);

  return (
    <Screen title="분실물" footer={<Button label="주운 물건 올리기" onPress={() => router.push('/lost/new')} />}>
      <Segmented value={status} items={['open', 'closed']} label={(v) => (v === 'open' ? '보관 중' : '전달 완료')} onChange={setStatus} />
      <Input style={NO_GROW} placeholder="물건 이름·주운 곳 검색" value={q} onChangeText={setQ} />
      <Chips items={[null, ...LOST_CATEGORIES]} value={category} onChange={setCategory} label={(v) => v ?? '전체'} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText={status === 'open' ? '올라온 습득물이 없어요' : '전달 완료한 습득물이 없어요'} onRetry={reload}>
        {data?.map((it) => (
          <Card key={it.id} onPress={() => router.push(`/lost/${it.id}`)}>
            <Row style={{ alignItems: 'flex-start', gap: 12 }}>
              <LostPhoto it={it} small style={{ width: 64, height: 64, borderRadius: 12 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row><Badge label={it.category} />{it.mine && <Badge label="내 글" tone="strong" />}</Row>
                <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }} numberOfLines={1}>{it.title}</Text>
                <Sub>{it.place} · {it.found_on}</Sub>
              </View>
            </Row>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
