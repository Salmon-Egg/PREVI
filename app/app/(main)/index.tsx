// 홈 (피그마 seokyeong_ui_home 1 기준)
// 인사·캐릭터 → 오늘 챙길 일(3개씩 넘겨 보기 + 다음 일정 카드) → 어떤 도움이 필요하신가요?(3칸/4칸 + 비서 한 줄) → 아래 질문창 + 추천 질문
// ▶ FE 1번에 해당하는 부분: 홈 허브 + 상단 알림·프로필 아이콘 (메뉴별 화면은 Stack으로 쌓임)
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Character, StateView } from '../../components/ui';
import { useApi } from '../../lib/api';
import { LOST_ENABLED } from '../../lib/config';
import { onPushReceived } from '../../lib/push';
import { color } from '../../lib/theme';
import type { Home as HomeData, Todo } from '../../lib/types';

// ▶ FE 14번에 해당하는 부분: 메뉴 칸. status는 GET /home의 menu_status 키 (칸마다 비서 한 줄)
// 기본 3칸, 분실물이 완성되면(LOST_ENABLED) 캠퍼스 생활까지 4칸 (작업 리스트 결정 7)
const ALL_MENUS: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; href: Href; status: keyof HomeData['menu_status'] }[] = [
  { label: '내 학업', icon: 'book-open-variant', href: '/study', status: 'study' },
  { label: '장학금', icon: 'school-outline', href: '/scholarships', status: 'scholarship' },
  { label: '학사 행정', icon: 'file-document-outline', href: '/office', status: 'admin' },
  { label: '캠퍼스 생활', icon: 'map-marker-outline', href: '/campus', status: 'campus' },
];
const MENUS = LOST_ENABLED ? ALL_MENUS : ALL_MENUS.slice(0, 3);

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
  // ▶ FE 5번에 해당하는 부분: 앱 사용 중 푸시를 받으면 홈(알림 점·오늘 챙길 일)을 다시 불러옴
  useEffect(() => onPushReceived(reload), [reload]);

  // ▶ FE 13번에 해당하는 부분: 오늘 챙길 일(D-day 순) 3개씩 한 쪽 + 마지막 쪽은 다음 일정 카드 (피그마 홈: 다음 일정 → A-2)
  const pages: (Todo[] | 'event')[] = [];
  for (let i = 0; i < (data?.today_todos.length ?? 0); i += 3) pages.push(data!.today_todos.slice(i, i + 3));
  if (data?.next_event) pages.push('event');

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
              {/* ▶ FE 12번에 해당하는 부분: 캐릭터 + 브리핑 말풍선 → 누르면 H-2 채팅 (브리핑 내용을 이어서 물어봄) */}
              <View style={st.hero}>
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={st.hello}>안녕하세요,{'\n'}{data.nickname || '서경인'}님!</Text>
                  <Text style={st.helloSub}>오늘도 서경 AI와{'\n'}편리한 캠퍼스 생활을 시작해요.</Text>
                </View>
                <Pressable accessibilityLabel="오늘 브리핑 자세히 묻기" style={st.character}
                  onPress={() => router.push({ pathname: '/chat', params: { q: '오늘 내가 챙길 일 자세히 알려줘' } })}>
                  <View style={st.bubble}><Text style={st.bubbleText}>{data.briefing || '필요한 정보,\n바로 찾아드릴게요!'}</Text></View>
                  <Character size={124} />
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
                          {items === 'event'
                            ? <EventCard e={data.next_event!} />
                            : items.map((t, i) => <TodoRow key={t.id} t={t} last={i === items.length - 1} />)}
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
                      {/* 비서 한 줄 상태 */}
                      {!!data.menu_status[m.status] && <Text style={st.tileStatus} numberOfLines={2}>{data.menu_status[m.status]}</Text>}
                    </Pressable>
                  ))}
                </View>
              </View>

            </>
          )}
        </StateView>
      </ScrollView>

      {/* ▶ FE 15번에 해당하는 부분: 하단 질문창 + 추천 질문 3개 → H-2 (피그마: 질문창 아래 칩) */}
      <View style={st.sheet}>
        <View style={st.handle} />
        <Pressable style={st.ask} onPress={() => router.push('/chat')}>
          <View style={st.askAvatar}><Character face size={44} /></View>
          <Text style={st.askText}>서경 AI에게 물어보세요!</Text>
          <View style={st.askBtn}><Feather name="arrow-right" size={22} color="#fff" /></View>
        </Pressable>
        {!!data?.suggested_questions.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {data.suggested_questions.slice(0, 3).map((q) => (
              <Pressable key={q} style={st.chip} onPress={() => router.push({ pathname: '/chat', params: { q } })}>
                <Text style={st.chipText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

/** ▶ FE 13번에 해당하는 부분: 다음 일정 카드 (피그마 홈 2쪽) → A-2 학사 일정 */
function EventCard({ e }: { e: NonNullable<HomeData['next_event']> }) {
  const d = new Date(e.start_date + 'T00:00:00');
  return (
    <Pressable style={st.event} onPress={() => router.push('/office/calendar')}>
      <View style={st.eventIcon}><MaterialCommunityIcons name="school" size={34} color={color.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={st.eventLabel}>다음 일정 · {e.d_day === 0 ? '오늘' : `D-${e.d_day}`}</Text>
        <Text style={st.eventTitle} numberOfLines={1}>{e.title}</Text>
        <Text style={st.eventDate}>{d.getMonth() + 1}/{d.getDate()}({DAYS[d.getDay()]})</Text>
        <Text style={st.eventSub}>다가오는 학사 일정이에요.</Text>
      </View>
      <View style={st.eventGo}><Feather name="chevron-right" size={20} color={color.primary} /></View>
    </Pressable>
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
  scroll: { padding: 16, gap: 16, paddingBottom: 190 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontSize: 28, fontWeight: '800', color: color.primary },
  logoSub: { fontSize: 13, color: color.inkSub, marginTop: 2 },
  dot: { position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryLight },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 170 },
  hello: { fontSize: 30, fontWeight: '800', color: color.ink, lineHeight: 40 },
  helloSub: { fontSize: 15, color: color.inkSub, lineHeight: 22 },
  character: { alignItems: 'center', width: 150, gap: 4 },
  bubble: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 7, paddingHorizontal: 10, transform: [{ rotate: '-4deg' }], maxWidth: 150, ...shadow },
  bubbleText: { fontSize: 11, color: color.primary, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 4 },
  eventIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  eventLabel: { fontSize: 12, color: color.inkSub, fontWeight: '600' },
  eventTitle: { fontSize: 18, fontWeight: '800', color: color.ink },
  eventDate: { fontSize: 14, color: color.inkSub },
  eventSub: { fontSize: 13, color: color.inkSub },
  eventGo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.line },

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
  tileStatus: { fontSize: 11, color: color.primaryLight, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },

  chips: { flexDirection: 'row', gap: 8, paddingTop: 10 },
  chip: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: color.line },
  chipText: { fontSize: 13, color: color.inkSub },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, ...shadow },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5DBD7', marginBottom: 10 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.line, borderRadius: 32, padding: 6, paddingLeft: 8 },
  askAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  askText: { flex: 1, fontSize: 17, fontWeight: '800', color: color.primary },
  askBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
