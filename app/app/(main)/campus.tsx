// ▶ FE 35번에 해당하는 부분: C-1 분실물 센터 — 습득물·분실 신고 탭, AI 매칭 배너 (피그마 seokyeong_ui_06 ~ 11)
// 분실물은 최후순위 기능. LOST_ENABLED=0이면 '준비 중' 안내만 보여 줌 (홈 메뉴도 3칸)
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ItemCard, Row, Screen, StateView, Sub, Title } from '../../components/ui';
import { useApi } from '../../lib/api';
import { LOST_ENABLED } from '../../lib/config';
import { color } from '../../lib/theme';
import type { LostItem, LostKind } from '../../lib/types';

const TABS: LostKind[] = ['found', 'lost'];
const TAB_KO: Record<LostKind, string> = { found: '습득물', lost: '분실 신고' };
const STATUS_KO: Record<LostItem['status'], string> = { open: '보관 중', matched: 'AI 매칭', returned: '주인 찾음' };

export default function Campus() {
  const [tab, setTab] = useState<LostKind>('found');
  const { data, error, loading, reload } = useApi<LostItem[]>(LOST_ENABLED ? `/lost-items?kind=${tab}` : null);
  // AI 매칭 배너: 내 분실 신고와 비슷한 습득물
  const matches = useApi<LostItem[]>(LOST_ENABLED ? '/lost-items?matched_for=me' : null);

  if (!LOST_ENABLED) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '캠퍼스 생활' }} />
        <Card>
          <Title>분실물 센터는 준비 중이에요</Title>
          <Sub>사진으로 습득물을 제보하면 AI가 분실 신고와 맞춰 주인에게 알려 주는 기능을 만들고 있어요.</Sub>
        </Card>
        <Body>캠퍼스 생활이 궁금하면 서경 AI에게 물어보세요.</Body>
        <Button label="서경 AI에게 물어보기" onPress={() => router.push('/chat')} />
      </Screen>
    );
  }

  const top = matches.data?.[0];
  return (
    <Screen>
      <Stack.Screen options={{ title: '분실물 센터' }} />
      {top?.match && (
        <Pressable style={st.banner} onPress={() => router.push(`/lost/${top.id}`)}>
          <Feather name="zap" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={st.bannerTitle}>내 분실물과 비슷한 습득물이 있어요</Text>
            <Text style={st.bannerSub}>{top.title} · 일치도 {top.match.score}%</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#fff" />
        </Pressable>
      )}

      <Row>
        {/* C-2 습득물 제보 / C-3 분실 신고 */}
        <Pressable style={st.write} onPress={() => router.push('/lost/found-new')}>
          <Feather name="camera" size={20} color={color.primary} /><Text style={st.writeText}>주운 물건 제보</Text>
        </Pressable>
        <Pressable style={st.write} onPress={() => router.push('/lost/lost-new')}>
          <Feather name="edit" size={20} color={color.primary} /><Text style={st.writeText}>잃어버렸어요</Text>
        </Pressable>
      </Row>

      <Chips items={TABS} value={tab} onChange={setTab} label={(v) => TAB_KO[v]} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText={tab === 'found' ? '보관 중인 습득물이 없어요' : '분실 신고가 없어요'} onRetry={reload}>
        {data?.map((i) => (
          <ItemCard key={i.id} image={i.image_url} icon="package" title={i.title} desc={i.description}
            badge={<Row style={{ gap: 6 }}>
              <Badge label={i.category} />
              <Badge label={STATUS_KO[i.status]} tone={i.status === 'matched' ? 'strong' : i.status === 'returned' ? 'bad' : 'soft'} />
              {i.mine && <Badge label="내 글" tone="warn" />}
            </Row>}
            meta={`${i.place} · ${i.found_at.slice(5, 16).replace('T', ' ')}`}
            onPress={() => router.push(`/lost/${i.id}`)} />
        ))}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.primary, borderRadius: 16, padding: 14 },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bannerSub: { color: '#DDEFE5', fontSize: 13, marginTop: 2 },
  write: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: color.primarySoft, borderRadius: 14, padding: 14 },
  writeText: { fontSize: 15, fontWeight: '800', color: color.ink },
});
