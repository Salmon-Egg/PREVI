// 분실물(습득물) 목록 — 종류 칩 + 검색, 최신순. 아래 버튼으로 주운 물건 올리기
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Input, NO_GROW } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, Chips, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { LOST_CATEGORIES, type LostCategory, type LostItem } from '../../../lib/types';

export default function LostList() {
  const [category, setCategory] = useState<LostCategory | null>(null);
  const [q, setQ] = useState('');
  const query = new URLSearchParams({ ...(category && { category }), ...(q.trim() && { q: q.trim() }) }).toString();
  const { data, error, loading, reload } = useApi<LostItem[]>(`/lost-items${query && '?' + query}`);

  return (
    <Screen title="분실물" footer={<Button label="주운 물건 올리기" onPress={() => router.push('/lost/new')} />}>
      <Input style={NO_GROW} placeholder="물건 이름·주운 곳 검색" value={q} onChangeText={setQ} />
      <Chips items={[null, ...LOST_CATEGORIES]} value={category} onChange={setCategory} label={(v) => v ?? '전체'} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="올라온 습득물이 없어요" onRetry={reload}>
        {data?.map((it) => (
          <Card key={it.id} onPress={() => router.push(`/lost/${it.id}`)}>
            <Row style={{ alignItems: 'flex-start', gap: 12 }}>
              {it.image_url
                ? <Image source={{ uri: it.image_url }} style={{ width: 64, height: 64, borderRadius: 12 }} accessibilityLabel={it.title} />
                : <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: color.primarySoft }} />}
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
