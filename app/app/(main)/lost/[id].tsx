// ▶ FE 35번에 해당하는 부분: C-4 습득물 상세 — 사진, 매칭 근거, 찾아가는 방법 → C-5 수령 신청
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { LostItem } from '../../../lib/types';

export default function LostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: i, error, loading, reload } = useApi<LostItem>(`/lost-items/${id}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: i?.kind === 'lost' ? '분실 신고' : '습득물 상세' }} />
      <StateView loading={loading} error={error} empty={!i} onRetry={reload}>
        {i && (
          <>
            <View style={st.photo}>
              {i.image_url ? <Image source={{ uri: i.image_url }} style={{ width: '100%', height: '100%' }} /> : <Feather name="package" size={48} color={color.inkSub} />}
            </View>
            <Row style={{ gap: 6 }}><Badge label={i.category} />{i.status === 'returned' && <Badge label="주인 찾음" tone="bad" />}</Row>
            <Title>{i.title}</Title>
            <Card>
              <Info icon="map-pin" label={i.kind === 'lost' ? '잃어버린 곳' : '발견 장소'} value={i.place} />
              <Info icon="clock" label={i.kind === 'lost' ? '잃어버린 때' : '발견 일시'} value={i.found_at.slice(0, 16).replace('T', ' ')} />
              {i.keep_at && <Info icon="archive" label="보관처" value={i.keep_at} />}
              {!!i.description && <Info icon="info" label="특징" value={i.description} />}
            </Card>

            {i.match && (
              <Card style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body style={{ fontWeight: '800', color: color.primary }}>AI 매칭 근거</Body>
                  <Badge label={`일치도 ${i.match.score}%`} tone="strong" />
                </Row>
                {i.match.reasons.map((r) => <Sub key={r}>· {r}</Sub>)}
              </Card>
            )}

            {i.kind === 'found' && i.status !== 'returned' && !i.mine && (
              <>
                <Card>
                  <Body style={{ fontWeight: '700' }}>찾아가는 방법</Body>
                  <Sub>1. 아래 “내 물건 같아요”를 눌러 본인 확인 질문에 답해요.</Sub>
                  <Sub>2. 확인되면 보관처({i.keep_at ?? '학생지원팀'})에서 학생증을 보여 주고 받아 가요.</Sub>
                </Card>
                <Button label="내 물건 같아요" onPress={() => router.push({ pathname: '/lost/claim', params: { id: String(i.id) } })} />
              </>
            )}
          </>
        )}
      </StateView>
    </Screen>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Feather name={icon} size={16} color={color.inkSub} style={{ marginTop: 2 }} />
      <Text style={{ width: 80, color: color.inkSub, fontSize: 14 }}>{label}</Text>
      <Text style={{ flex: 1, color: color.ink, fontSize: 14, fontWeight: '600' }}>{value}</Text>
    </Row>
  );
}

const st = StyleSheet.create({
  photo: { height: 200, borderRadius: 16, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
