// 홈 (피그마 seokyeong_ui_home 1 기준)
// 인사·캐릭터 → 오늘 챙길 일(3개씩 넘겨 보기) → 어떤 도움이 필요하신가요?(4칸) → 아래 질문창
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateView } from '../../components/ui';
import { useApi } from '../../lib/api';
import { color } from '../../lib/theme';
import type { Home as HomeData, Todo } from '../../lib/types';

const MENUS: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; href: Href }[] = [
  { label: '내 학업', icon: 'book-open-variant', href: '/study' },
  { label: '장학금', icon: 'school-outline', href: '/scholarships' },
  { label: '학사 행정', icon: 'file-document-outline', href: '/office' },
  { label: '캠퍼스 생활', icon: 'map-marker-outline', href: '/campus' },
];

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "오늘 마감" 또는 "10/15(목)까지" */
function dueText(t: Todo) {
  if (t.d_day === 0) return '오늘 마감';
  if (!t.due_date) return '마감 없음';
  const d = new Date(t.due_date + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})까지`;
}

export default function Home() {
  const { data, error, loading, reload } = useApi<HomeData>('/home');
  const [page, setPage] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);

  const pages: Todo[][] = [];
  for (let i = 0; i < (data?.today_todos.length ?? 0); i += 3) pages.push(data!.today_todos.slice(i, i + 3));

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.scroll}>
        {/* 머리: 로고 · 알림 · 내 정보 */}
        <View style={st.header}>
          <View>
            <View style={st.row}>
              <Text style={st.logo}>서경 AI</Text>
              <MaterialCommunityIcons name="leaf" size={22} color={color.primaryLight} />
            </View>
            <Text style={st.logoSub}>서경대학교 스마트 비서</Text>
          </View>
          <View style={[st.row, { gap: 20 }]}>
            <Pressable accessibilityLabel="알림" onPress={() => router.push('/notifications')}>
              <Feather name="bell" size={24} color={color.ink} />
              {!!data?.unread_notifications && <View style={st.dot} />}
            </Pressable>
            <Pressable accessibilityLabel="내 정보" onPress={() => router.push('/me')}>
              <Feather name="user" size={24} color={color.ink} />
            </Pressable>
          </View>
        </View>

        <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
          {data && (
            <>
              {/* 인사 + 캐릭터. 인사 아래 문장은 비서 브리핑 */}
              <View style={st.hero}>
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={st.hello}>안녕하세요,{'\n'}{data.nickname || '서경인'}님!</Text>
                  <Text style={st.briefing}>{data.briefing}</Text>
                </View>
                <Pressable onPress={() => router.push('/chat')} style={st.character}>
                  <View style={st.bubble}><Text style={st.bubbleText}>필요한 정보,{'\n'}바로 찾아드릴게요!</Text></View>
                  {/* 캐릭터 이미지 자리: 피그마 코끼리 이미지를 assets/character.png로 받아서 교체 */}
                  <Text style={{ fontSize: 76 }}>🐘</Text>
                </Pressable>
              </View>

              {/* 오늘 챙길 일: 3개씩 넘겨 보기 */}
              <View style={st.panel}>
                <View style={[st.row, { justifyContent: 'space-between' }]}>
                  <Text style={st.panelTitle}>오늘 챙길 일</Text>
                  <Pressable style={st.row} onPress={() => router.push('/todos')}>
                    <Text style={st.more}>전체보기</Text>
                    <Feather name="chevron-right" size={18} color={color.inkSub} />
                  </Pressable>
                </View>
                {pages.length === 0 ? (
                  <View style={st.todoCard}><Text style={st.empty}>오늘은 급하게 챙길 일이 없어요</Text></View>
                ) : (
                  <View onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                      onScroll={(e) => cardWidth && setPage(Math.round(e.nativeEvent.contentOffset.x / cardWidth))} scrollEventThrottle={16}>
                      {pages.map((items, p) => (
                        <View key={p} style={[st.todoCard, { width: cardWidth || undefined }]}>
                          {items.map((t, i) => <TodoRow key={t.id} t={t} last={i === items.length - 1} />)}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {pages.length > 1 && (
                  <View style={[st.row, { justifyContent: 'center', gap: 8, marginTop: 4 }]}>
                    {pages.map((_, i) => <View key={i} style={[st.pageDot, i === page && st.pageDotOn]} />)}
                  </View>
                )}
              </View>

              {/* 어떤 도움이 필요하신가요? 4칸 */}
              <View style={st.helpBox}>
                <Text style={st.helpTitle}>어떤 도움이 필요하신가요?</Text>
                <Text style={st.helpSub}>서경 AI가 빠르고 정확하게 도와드릴게요.</Text>
                <View style={st.grid}>
                  {MENUS.map((m) => (
                    <Pressable key={m.label} style={st.tile} onPress={() => router.push(m.href)}>
                      <View style={st.tileIcon}><MaterialCommunityIcons name={m.icon} size={24} color={color.primary} /></View>
                      <Text style={st.tileLabel}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 추천 질문 */}
              <View style={st.chips}>
                {data.suggested_questions.map((q) => (
                  <Pressable key={q} style={st.chip} onPress={() => router.push({ pathname: '/chat', params: { q } })}>
                    <Text style={st.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </StateView>
      </ScrollView>

      {/* 아래 질문창 */}
      <View style={st.sheet}>
        <View style={st.handle} />
        <Pressable style={st.ask} onPress={() => router.push('/chat')}>
          <View style={st.askAvatar}><Text style={{ fontSize: 26 }}>🐘</Text></View>
          <Text style={st.askText}>서경 AI에게 물어보세요!</Text>
          <View style={st.askBtn}><Feather name="arrow-right" size={22} color="#fff" /></View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function TodoRow({ t, last }: { t: Todo; last: boolean }) {
  const urgent = t.d_day !== null && t.d_day <= 1;
  return (
    <Pressable style={st.todoRow} onPress={() => router.push(`/todos/${t.id}`)}>
      {/* 시간 흐름 선: 급한 일은 진한 점 */}
      <View style={st.timeline}>
        <View style={urgent ? st.nodeOn : st.nodeOff}>{urgent && <View style={st.nodeInner} />}</View>
        {!last && <View style={[st.line, !urgent && st.lineDashed]} />}
      </View>
      <View style={[st.dday, urgent ? st.ddayOn : st.ddayOff]}>
        <Text style={[st.ddayText, { color: urgent ? '#fff' : color.primary }]}>
          {t.d_day === null ? '-' : t.d_day === 0 ? 'D-DAY' : `D-${t.d_day}`}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={st.todoTitle} numberOfLines={1}>{t.title}</Text>
        <Text style={[st.todoDue, { color: urgent ? color.primaryLight : color.inkSub }]}>{dueText(t)}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={color.inkSub} />
    </Pressable>
  );
}

const shadow = { shadowColor: '#0C6B3F', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.homeBg },
  scroll: { padding: 16, gap: 16, paddingBottom: 140 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontSize: 28, fontWeight: '800', color: color.primary },
  logoSub: { fontSize: 13, color: color.inkSub, marginTop: 2 },
  dot: { position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryLight },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 170 },
  hello: { fontSize: 30, fontWeight: '800', color: color.ink, lineHeight: 40 },
  briefing: { fontSize: 15, color: color.inkSub, lineHeight: 22 },
  character: { alignItems: 'center', width: 130 },
  bubble: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, transform: [{ rotate: '-6deg' }], ...shadow },
  bubbleText: { fontSize: 11, color: color.primary, fontWeight: '600', textAlign: 'center' },

  panel: { backgroundColor: '#fff', borderRadius: 24, padding: 18, gap: 14, ...shadow },
  panelTitle: { fontSize: 20, fontWeight: '800', color: color.ink },
  more: { fontSize: 14, color: color.inkSub },
  todoCard: { borderWidth: 1, borderColor: color.line, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#fff' },
  empty: { padding: 20, textAlign: 'center', color: color.inkSub },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  timeline: { width: 24, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  nodeOn: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  nodeInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.primaryLight, borderWidth: 2, borderColor: '#fff' },
  nodeOff: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#BFDCC9' },
  line: { position: 'absolute', top: '70%', bottom: -30, width: 2, backgroundColor: color.primaryLight },
  lineDashed: { backgroundColor: '#BFDCC9' },
  dday: { borderRadius: 8, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  ddayOn: { backgroundColor: color.primaryLight },
  ddayOff: { backgroundColor: color.primarySoft },
  ddayText: { fontSize: 12, fontWeight: '700' },
  todoTitle: { fontSize: 16, fontWeight: '700', color: color.ink },
  todoDue: { fontSize: 13, fontWeight: '600' },
  pageDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D5DBD7' },
  pageDotOn: { backgroundColor: color.primary },

  helpBox: { backgroundColor: color.primarySoft, borderRadius: 24, padding: 18, gap: 4 },
  helpTitle: { fontSize: 19, fontWeight: '800', color: color.ink },
  helpSub: { fontSize: 13, color: color.inkSub, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 8, ...shadow },
  tileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 13, fontWeight: '700', color: color.ink },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: color.line },
  chipText: { fontSize: 13, color: color.inkSub },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, ...shadow },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5DBD7', marginBottom: 10 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.line, borderRadius: 32, padding: 6, paddingLeft: 8 },
  askAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  askText: { flex: 1, fontSize: 17, fontWeight: '800', color: color.primary },
  askBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
