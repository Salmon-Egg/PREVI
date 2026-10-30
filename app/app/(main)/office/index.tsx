// ▶ FE 27번에 해당하는 부분: A-1 나에게 해당하는 공지 (자동 수집 + AI 요약) + 학사 일정·휴복학 안내로 가는 길
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Pressable, Text } from '../../../components/Text';
import { Badge, Chips, ItemCard, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { NoticeItem } from '../../../lib/types';

const CATEGORIES = ['전체', '학사', '장학', '수업', '행사'] as const;
const ICON: Record<string, keyof typeof Feather.glyphMap> = { 학사: 'book', 장학: 'award', 수업: 'edit-3', 행사: 'flag' };

/** 마감이 지난 공지인가 (마감 없는 공지는 계속 보여 줌) */
const expired = (n: NoticeItem) => !!n.deadline && new Date(n.deadline).getTime() < Date.now();

export default function Office() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('전체');
  const [showPast, setShowPast] = useState(false);
  const { data, error, loading, reload } = useApi<NoticeItem[]>('/notices');
  const all = data ?? [];
  const list = all.filter((n) => (cat === '전체' || n.category === cat) && (showPast || !expired(n)));
  const pastCount = all.filter(expired).length;

  return (
    <Screen title="학사 행정">
      <Row>
        {/* ▶ FE 28번·29번으로 가는 길 */}
        <Pressable style={st.tile} onPress={() => router.push('/office/calendar')}>
          <Feather name="calendar" size={22} color={color.primary} />
          <Text style={st.tileText}>학사 일정</Text>
        </Pressable>
        <Pressable style={st.tile} onPress={() => router.push('/office/leave')}>
          <Feather name="refresh-cw" size={22} color={color.primary} />
          <Text style={st.tileText}>휴·복학 안내</Text>
        </Pressable>
      </Row>

      <Title>나에게 해당하는 공지</Title>
      <Sub>학교 게시판에서 자동으로 모은 공지 중 내 학과·학년·학적에 맞는 것만 AI가 요약했어요.</Sub>
      <Chips items={[...CATEGORIES]} value={cat} onChange={setCat} label={(v) => v} />
      <StateView loading={loading} error={error} empty={!list.length} emptyText="새 공지가 없어요" onRetry={reload}>
        {list.map((n) => (
          <ItemCard key={n.id} icon={ICON[n.category ?? ''] ?? 'file-text'} title={n.title} desc={n.summary[0]}
            badge={<Row style={{ gap: 6 }}>
              <Badge label={n.category ?? '공지'} />
              {n.deadline && <Badge label={expired(n) ? '마감 지남' : `마감 ${n.deadline.slice(5, 10).replace('-', '/')}`} tone={expired(n) ? 'bad' : 'warn'} />}
            </Row>}
            meta={n.posted_at ? `${n.posted_at.slice(0, 10)} 게시` : null}
            onPress={() => router.push(`/notices/${n.id}`)} />
        ))}
      </StateView>
      {pastCount > 0 && (
        <Pressable onPress={() => setShowPast(!showPast)} style={{ alignSelf: 'center', padding: 8 }}>
          <Sub style={{ color: color.primary, fontWeight: '700' }}>{showPast ? '마감 지난 공지 숨기기' : `마감 지난 공지 ${pastCount}개 보기`}</Sub>
        </Pressable>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: color.primarySoft, borderRadius: 14, padding: 14 },
  tileText: { fontSize: 15, fontWeight: '800', color: color.ink },
});
