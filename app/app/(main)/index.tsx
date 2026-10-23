// 홈: 캐릭터 + 브리핑 → 오늘 챙길 일 → 메뉴 3칸(칸마다 비서 한 줄) → 질문창 + 추천 질문
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, DdayBadge, Row, Screen, StateView, Sub, Title } from '../../components/ui';
import { useApi } from '../../lib/api';
import { color } from '../../lib/theme';
import type { Home as HomeData } from '../../lib/types';

const MENUS = [
  { key: 'study', label: '내 학업', href: '/study' },
  { key: 'scholarship', label: '장학금', href: '/scholarships' },
  { key: 'admin', label: '학사 행정', href: '/office' },
] as const;

export default function Home() {
  const { data, error, loading, reload } = useApi<HomeData>('/home');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={st.logo}>서경 AI</Text>
          <Row style={{ gap: 16 }}>
            <Pressable accessibilityLabel="알림" onPress={() => router.push('/notifications')}><Text style={st.icon}>🔔</Text></Pressable>
            <Pressable accessibilityLabel="내 정보" onPress={() => router.push('/me')}><Text style={st.icon}>👤</Text></Pressable>
          </Row>
        </Row>

        <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
          {data && (
            <>
              {/* 캐릭터 자리: 디자인 확정되면 이미지로 바꾸기 */}
              <Pressable onPress={() => router.push('/chat')} style={st.hero}>
                <View style={st.bubble}>
                  <Text style={st.bubbleText}>{data.briefing}</Text>
                </View>
                <Text style={{ fontSize: 64 }}>🐘</Text>
              </Pressable>

              <Row style={{ justifyContent: 'space-between' }}>
                <Title>오늘 챙길 일</Title>
                <Pressable onPress={() => router.push('/todos')}><Sub>전체보기 ›</Sub></Pressable>
              </Row>
              {data.today_todos.length === 0 && <Sub>오늘은 급하게 챙길 일이 없어요</Sub>}
              {data.today_todos.map((t) => (
                <Card key={t.id} onPress={() => router.push(`/todos/${t.id}`)}>
                  <Row>
                    <DdayBadge dDay={t.d_day} />
                    <Text style={st.todo} numberOfLines={1}>{t.title}</Text>
                  </Row>
                </Card>
              ))}
              {data.next_event && (
                <Card onPress={() => router.push('/office/calendar')} style={{ backgroundColor: color.surface, borderWidth: 0 }}>
                  <Sub>다음 일정 · D-{data.next_event.d_day}</Sub>
                  <Text style={st.todo}>{data.next_event.title}</Text>
                </Card>
              )}

              <Title>어떤 도움이 필요하신가요?</Title>
              <View style={st.grid}>
                {MENUS.map((m) => (
                  <Card key={m.key} onPress={() => router.push(m.href)} style={st.tile}>
                    <Text style={st.tileLabel}>{m.label}</Text>
                    <Sub>{data.menu_status[m.key]}</Sub>
                  </Card>
                ))}
              </View>

              <Pressable onPress={() => router.push('/chat')} style={st.ask}>
                <Text style={{ color: color.inkSub }}>서경 AI에게 물어보세요</Text>
              </Pressable>
              <View style={st.chips}>
                {data.suggested_questions.map((q) => (
                  <Pressable key={q} style={st.chip} onPress={() => router.push({ pathname: '/chat', params: { q } })}>
                    <Text style={{ fontSize: 13, color: color.ink }}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </StateView>
      </Screen>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  logo: { fontSize: 24, fontWeight: '800', color: color.primary },
  icon: { fontSize: 22 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  bubble: { flex: 1, backgroundColor: color.primarySoft, borderRadius: 16, padding: 14 },
  bubbleText: { fontSize: 16, fontWeight: '600', color: color.ink, lineHeight: 23 },
  todo: { flex: 1, fontSize: 15, fontWeight: '600', color: color.ink },
  grid: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minHeight: 92 },
  tileLabel: { fontSize: 15, fontWeight: '700', color: color.ink },
  ask: { borderRadius: 24, borderWidth: 1, borderColor: color.primary, paddingVertical: 14, paddingHorizontal: 18, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: color.surface, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
});
