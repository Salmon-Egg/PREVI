// 홈 (피그마 seokyeong_ui_home 1 기준)
// 인사·캐릭터 → 오늘 챙길 일(3개씩 넘겨 보기 + 다음 일정 카드) → 어떤 도움이 필요하신가요?(3칸/4칸 + 비서 한 줄) → 아래 끌어 올리는 AI 대화창
// ▶ FE 1번에 해당하는 부분: 홈 허브 + 상단 알림·프로필 아이콘 (메뉴별 화면은 Stack으로 쌓임)
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type PointerEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatSheet, SHEET_BAR } from '../../components/ChatSheet';
import { StateView } from '../../components/ui';
import { useApi } from '../../lib/api';
import { LOST_ENABLED } from '../../lib/config';
import { onPushReceived } from '../../lib/push';
import { color } from '../../lib/theme';
import type { Home as HomeData, Todo } from '../../lib/types';
import { WEEKDAYS } from '../../lib/constants';

// ▶ FE 14번에 해당하는 부분: 메뉴 칸. status는 GET /home의 menu_status 키 (칸마다 비서 한 줄)
// 기본 3칸, 분실물이 완성되면(LOST_ENABLED) 캠퍼스 생활까지 4칸 (작업 리스트 결정 7)
const ALL_MENUS: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; href: Href; status: keyof HomeData['menu_status'] }[] = [
  { label: '내 학업', icon: 'book-open-variant', href: '/study', status: 'study' },
  { label: '장학금', icon: 'school-outline', href: '/scholarships', status: 'scholarship' },
  { label: '학사 행정', icon: 'file-document-outline', href: '/office', status: 'admin' },
  { label: '캠퍼스 생활', icon: 'map-marker-outline', href: '/campus', status: 'campus' },
];
const MENUS = LOST_ENABLED ? ALL_MENUS : ALL_MENUS.slice(0, 3);

// 홈 위쪽은 피그마 홈(07_home_v1, 폭 941) 비율 그대로 화면 폭에 맞춤. 아래 값은 그 그림에서 잰 위치 ÷ 941
const FIG = {
  bgH: 525 / 941, // 배경 그림 높이
  hello: 220 / 941, // '안녕하세요' 윗줄
  cardTop: 522 / 941, // '오늘 챙길 일' 카드 위 끝
  bubbleTop: 150 / 941, // 말풍선 위 끝 (브리핑 글이 시안 글보다 길어서 조금 위로)
  bubbleLeft: 395 / 941, // 말풍선 왼쪽 끝
};
// 위쪽 고정 높이: 스크롤 여백 16 + 로고 줄 52 + 사이 16 / 카드가 위쪽(hero)과 겹치는 길이 18
const HERO_TOP = 84;
const CARD_OVERLAP = 18;
// 코끼리 그림 아래쪽이 '오늘 챙길 일' 카드 밑으로 들어가는 길이 (그림 아래 흐림 12보다 길게 → 카드 옆에서도 경계가 안 보임)
const BG_UNDER_CARD = 18;


/** "오늘 마감" 또는 "10/15(목)까지" */
function dueText(t: Todo) {
  if (t.d_day === 0) return '오늘 마감';
  if (!t.due_date) return '마감 없음';
  const d = new Date(t.due_date + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})까지`;
}

export default function Home() {
  const { data, error, loading, reload } = useApi<HomeData>('/home');
  const [page, setPage] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  // 화면 폭(웹은 휴대폰 폭 최대 480)에 맞춰 피그마 비율로 위치 계산
  const W = Platform.OS === 'web' ? Math.min(screenWidth, 480) : screenWidth;
  // 카드는 피그마와 같은 높이에서 시작하되, 앱 글자가 시안보다 커서 설명 문구 아래 간격이 피그마(약 30)만큼 남도록 10 더 내림
  const minHeight = W * FIG.cardTop - HERO_TOP + CARD_OVERLAP + 10;
  const cardTop = HERO_TOP + minHeight - CARD_OVERLAP; // 스크롤 내용 맨 위 기준
  // 배경 그림을 카드 쪽으로 내려서, 카드가 코끼리 아랫부분을 BG_UNDER_CARD만큼 덮게 함 (코끼리와 카드 사이 빈틈 없음)
  const bgShift = Math.max(0, cardTop + BG_UNDER_CARD - W * FIG.bgH);
  const hero = {
    bgH: W * FIG.bgH,
    bgTop: bgShift,
    minHeight,
    padTop: Math.max(0, W * FIG.hello - HERO_TOP),
    bubbleTop: W * FIG.bubbleTop + bgShift - HERO_TOP, // 말풍선도 그림과 같이 내려감
    bubbleLeft: W * FIG.bubbleLeft - 16,
  };
  // 카드 한 쪽 폭. 웹은 onLayout이 늦거나 안 올 때(탭이 가려져 있을 때 등)가 있어서 붙는 순간 바로 잼
  const measureWeb = useCallback((el: ComponentRef<typeof View> | null) => {
    const w = Platform.OS === 'web' && el ? (el as unknown as HTMLElement).getBoundingClientRect().width : 0;
    if (w) setCardWidth(w);
  }, []);
  // ▶ FE 5번에 해당하는 부분: 앱 사용 중 푸시를 받으면 홈(알림 점·오늘 챙길 일)을 다시 불러옴
  useEffect(() => onPushReceived(reload), [reload]);

  // ▶ FE 13번에 해당하는 부분: 오늘 챙길 일 넘기기. 휴대폰은 손가락으로 밀면 되지만 웹(PC)은 마우스로 밀 수 없어서
  // 마우스 왼쪽 버튼으로 잡고 좌우로 끌면 다음/이전 쪽으로 넘어가게 함. 아래 점을 눌러도 그 쪽으로 감
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const drag = useRef<{ x: number; dx: number; moved: boolean } | null>(null);
  const dragged = useRef(false); // 방금 끌어서 넘겼으면 놓을 때의 클릭은 무시
  const [dragDx, setDragDx] = useState(0);
  const [grabbing, setGrabbing] = useState(false);
  const lastPage = Math.max(0, pagesCount(data) - 1);
  function goTo(p: number) {
    const next = Math.max(0, Math.min(lastPage, p));
    // 웹은 부드러운 스크롤이 쪽 맞춤(scroll-snap)과 부딪혀 멈추는 브라우저가 있어서 바로 이동
    pager.current?.scrollTo({ x: next * cardWidth, animated: Platform.OS !== 'web' });
    setPage(next);
  }
  const dragProps = Platform.OS !== 'web' ? {} : {
    onPointerDown: (e: PointerEvent) => {
      if (e.nativeEvent.button !== 0) return;
      drag.current = { x: e.nativeEvent.clientX, dx: 0, moved: false };
      setGrabbing(true);
    },
    onPointerMove: (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.nativeEvent.clientX - drag.current.x;
      drag.current.dx = dx;
      if (Math.abs(dx) > 5) drag.current.moved = true;
      setDragDx(dx);
    },
    onPointerUp: () => endDrag(),
    onPointerLeave: () => endDrag(),
  };
  function endDrag() {
    if (!drag.current) return;
    // 카드 폭의 1/5 넘게 끌면 넘김. moved는 클릭(할 일 열기)과 끌기를 구분하려고 잠깐 남겨 둠
    const { dx } = drag.current; // 화면에 그려진 값(dragDx)이 아니라 마지막으로 움직인 거리
    if (dx < -cardWidth / 5) goTo(page + 1);
    else if (dx > cardWidth / 5) goTo(page - 1);
    dragged.current = drag.current.moved;
    drag.current = null;
    setDragDx(0);
    setGrabbing(false);
    setTimeout(() => (dragged.current = false), 0);
  }
  /** 끌어서 넘긴 직후의 놓기는 '누르기'로 치지 않음 */
  const open = (href: Href) => {
    if (!dragged.current) router.push(href);
  };

  // ▶ FE 13번에 해당하는 부분: 오늘 챙길 일(D-day 순) 3개씩 한 쪽 + 마지막 쪽은 다음 일정 카드 (피그마 홈: 다음 일정 → A-2)
  const pages: (Todo[] | 'event')[] = [];
  for (let i = 0; i < (data?.today_todos.length ?? 0); i += 3) pages.push(data!.today_todos.slice(i, i + 3));
  if (data?.next_event) pages.push('event');

  return (
    <View style={st.safe}>
      <SafeAreaView style={st.safe} edges={['top']}>
        <ScrollView contentContainerStyle={st.scroll}>
          {/* ▶ FE 12번에 해당하는 부분: 피그마 홈(07_home_v1) 윗부분 그림을 화면 폭 그대로 배경으로 (구름·학교·풀숲·반짝 표시·코끼리)
              로고·인사말·말풍선은 앱이 그 위에 그림. 눌러도 이동하지 않음(채팅은 아래 바로) */}
          <Image accessibilityLabel="서경 AI 코끼리" source={require('../../assets/home-hero.png')} pointerEvents="none"
            style={[st.heroBg, { top: hero.bgTop, height: hero.bgH }]} />
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
                {/* ▶ FE 12번에 해당하는 부분: 인사 + 브리핑 말풍선. 인사말·말풍선·카드 위치를 피그마 홈과 같은 비율로 둠
                    말풍선은 인사말 오른쪽·코끼리 왼쪽 위, 작아지는 동그라미 두 개가 코끼리 쪽으로 이어져 코끼리가 말하는 것처럼 보임 */}
                <View style={[st.hero, { minHeight: hero.minHeight }]}>
                  <View style={[st.heroText, { paddingTop: hero.padTop }]}>
                    <Text style={st.hello}>안녕하세요,{'\n'}{data.nickname || '서경인'}님!</Text>
                    <Text style={st.helloSub}>오늘도 서경 AI와{'\n'}편리한 캠퍼스 생활을 시작해요.</Text>
                  </View>
                  <View style={[st.bubbleWrap, { top: hero.bubbleTop, left: hero.bubbleLeft, width: W * 0.3 }]}>
                    <View style={st.bubble}><Text style={st.bubbleText}>{data.briefing || '필요한 정보,\n바로 찾아드릴게요!'}</Text></View>
                    <View style={[st.tailDot, st.tailDot1]} />
                    <View style={[st.tailDot, st.tailDot2]} />
                  </View>
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
                    <View ref={measureWeb} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)} {...dragProps}
                      style={Platform.OS === 'web' && pages.length > 1 ? (webGrab(grabbing) as object) : undefined}>
                      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                        onScroll={(e) => cardWidth && !grabbing && setPage(Math.round(e.nativeEvent.contentOffset.x / cardWidth))} scrollEventThrottle={16}>
                        {pages.map((items, p) => (
                          // 끄는 동안 카드가 손(마우스)을 따라 움직임. 처음·마지막 쪽 밖으로는 조금만 밀림
                          <View key={p} style={[st.todoCard, { width: cardWidth || undefined, transform: [{ translateX: edgeDx(dragDx, page, lastPage) }] }]}>
                            {items === 'event'
                              ? <EventCard e={data.next_event!} open={open} />
                              : items.map((t, i) => <TodoRow key={t.id} t={t} last={i === items.length - 1} open={open} />)}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {pages.length > 1 && (
                    <View style={[st.row, { justifyContent: 'center', gap: 4, marginTop: 4 }]}>
                      {pages.map((_, i) => (
                        <Pressable key={i} accessibilityLabel={`${i + 1}번째 쪽`} hitSlop={6} style={st.pageDotHit} onPress={() => goTo(i)}>
                          <View style={[st.pageDot, i === page && st.pageDotOn]} />
                        </Pressable>
                      ))}
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

      </SafeAreaView>
      {/* ▶ FE 15번에 해당하는 부분: 아래 '서경 AI에게 물어보세요!' 바 — 잡고 올리거나 ↑를 누르면 AI 대화창이 홈 위로 올라옴 */}
      <ChatSheet />
    </View>
  );
}

/** 홈 넘기기 쪽 수 (할 일 3개씩 + 다음 일정 카드) */
function pagesCount(data: HomeData | null) {
  if (!data) return 0;
  return Math.ceil(data.today_todos.length / 3) + (data.next_event ? 1 : 0);
}

/** 끄는 거리. 첫 쪽에서 오른쪽, 마지막 쪽에서 왼쪽으로는 1/3만 밀려서 더 없다는 걸 알려 줌 */
function edgeDx(dx: number, page: number, last: number) {
  return (page === 0 && dx > 0) || (page === last && dx < 0) ? dx / 3 : dx;
}

/** 웹 마우스 모양: 잡을 수 있음(grab) / 잡는 중(grabbing). 끄는 동안 글자가 선택되지 않게 */
function webGrab(grabbing: boolean) {
  return { cursor: grabbing ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'pan-y' };
}

/** ▶ FE 13번에 해당하는 부분: 다음 일정 카드 (피그마 홈 2쪽) → A-2 학사 일정 */
function EventCard({ e, open }: { e: NonNullable<HomeData['next_event']>; open: (href: Href) => void }) {
  const d = new Date(e.start_date + 'T00:00:00');
  return (
    <Pressable style={st.event} onPress={() => open('/office/calendar')}>
      <View style={st.eventIcon}><MaterialCommunityIcons name="school" size={34} color={color.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={st.eventLabel}>다음 일정 · {e.d_day === 0 ? '오늘' : `D-${e.d_day}`}</Text>
        <Text style={st.eventTitle} numberOfLines={1}>{e.title}</Text>
        <Text style={st.eventDate}>{d.getMonth() + 1}/{d.getDate()}({WEEKDAYS[d.getDay()]})</Text>
        <Text style={st.eventSub}>다가오는 학사 일정이에요.</Text>
      </View>
      <View style={st.eventGo}><Feather name="chevron-right" size={20} color={color.primary} /></View>
    </Pressable>
  );
}

function TodoRow({ t, last, open }: { t: Todo; last: boolean; open: (href: Href) => void }) {
  const urgent = t.d_day !== null && t.d_day <= 1;
  return (
    <Pressable style={st.todoRow} onPress={() => open(`/todos/${t.id}`)}>
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
  scroll: { padding: 16, gap: 16, paddingBottom: SHEET_BAR + 32 }, // 아래 대화창 바에 가리지 않게
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontSize: 28, fontWeight: '800', color: color.primary },
  logoSub: { fontSize: 13, color: color.inkSub, marginTop: 2 },
  dot: { position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryLight },

  // 캐릭터 그림은 오른쪽 화면 끝까지(-16), 아래는 다음 카드에 덮이게(marginBottom 음수)
  // 배경 그림: 스크롤 내용 맨 위·화면 양끝까지 (높이는 화면 폭 × 525/941)
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  hero: { marginBottom: -34 },
  heroText: { gap: 8, width: '48%' },
  hello: { fontSize: 24, fontWeight: '800', color: color.ink, lineHeight: 31 },
  helloSub: { fontSize: 13, color: color.inkSub, lineHeight: 19 },
  // 말풍선 위치·폭은 화면 폭에 맞춰 계산 (hero.bubbleTop·bubbleLeft, 폭 30%)
  bubbleWrap: { position: 'absolute' },
  bubble: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 10, transform: [{ rotate: '-7deg' }], ...shadow },
  // 생각 말풍선 꼬리: 말풍선 아래 오른쪽에서 캐릭터 머리 쪽으로 작아지는 동그라미 두 개
  tailDot: { position: 'absolute', backgroundColor: '#fff', ...shadow },
  // 말풍선 아래 가운데에서 코끼리 왼쪽 귀 쪽으로 (반짝 표시와 귀 사이 빈 곳)
  tailDot1: { width: 9, height: 9, borderRadius: 5, bottom: -12, left: '46%' },
  tailDot2: { width: 5, height: 5, borderRadius: 3, bottom: -21, left: '55%' },
  bubbleText: { fontSize: 10.5, color: color.primary, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
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
  pageDotHit: { padding: 4 },
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


});
