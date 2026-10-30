// 홈 (2026-10-27 새 홈 시안 기준: 전체 배경 그림 + 마스코트 PREVI)
// 인사·캐릭터 → 오늘 챙길 일(3개씩 넘겨 보기 + 다음 일정 카드) → 어떤 도움이 필요하신가요?(3칸/4칸 + 비서 한 줄) → 아래 끌어 올리는 AI 대화창
// ▶ FE 1번에 해당하는 부분: 홈 허브 + 상단 알림·프로필 아이콘 (메뉴별 화면은 Stack으로 쌓임)
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Platform, ScrollView, StyleSheet, useWindowDimensions, View, type PointerEvent, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SHEET_BAR } from '../../components/ChatSheet';
import { Pressable, Text } from '../../components/Text';
import { StateView } from '../../components/ui';
import { useApi } from '../../lib/api';
import { WEEKDAYS } from '../../lib/constants';
import { onPushReceived } from '../../lib/push';
import { color } from '../../lib/theme';
import type { Home as HomeData, Me, Notification, Todo } from '../../lib/types';

// ▶ FE 14번에 해당하는 부분: 메뉴 칸 4개 (2026-10-27 캠퍼스 생활 뺌, 2026-10-30 분실물 다시 넣음. 칸이 같은 폭으로 나눠 씀)
// status는 GET /home의 menu_status 키 (칸마다 비서 한 줄, 분실물은 없음). 아이콘 색은 피그마 '01_홈화면_1'처럼 칸마다 다른 색 (tint: 아이콘 뒤 동그라미)
const MENUS: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: string; tint: string; href: Href; status?: keyof HomeData['menu_status'] }[] = [
  { label: '내 학업', icon: 'book-open-variant', tone: '#3B7DDD', tint: '#E6EFFC', href: '/study', status: 'study' },
  { label: '장학금', icon: 'school-outline', tone: '#D99A0B', tint: '#FCF3DC', href: '/scholarships', status: 'scholarship' },
  { label: '학사 행정', icon: 'file-document-outline', tone: '#E0574F', tint: '#FCE9E7', href: '/office', status: 'admin' },
  { label: '분실물', icon: 'magnify', tone: '#7A5AE0', tint: '#EEE9FC', href: '/lost' },
];
// 다음 일정 카드(오늘 챙길 일 마지막 쪽) 아이콘 색: 학사 일정 = 학사 행정 칸과 같은 색
const EVENT_TONE = { tone: '#E0574F', tint: '#FCE9E7' };

// 홈 위쪽 구성은 새 홈 시안(폭 685) 비율 그대로 화면 폭에 맞춤. 아래 값은 시안에서 잰 위치·크기 ÷ 685 (화면 맨 위 기준)
const FIG = {
  // 로고 아래 줄과 인사말 사이가 비어 보이지 않게 위쪽 칸 높이를 시안보다 조금 줄임
  hello: 186 / 685, // '안녕하세요' 윗줄
  cardTop: 424 / 685, // '오늘 챙길 일' 카드 위 끝
  // 글자 크기: 로고 · 로고 아래 줄 · 인사말 · 설명 (작은 화면에서도 읽히게 최소값을 둠)
  logoSize: 40 / 685, logoSubSize: 17 / 685, helloSize: 49 / 685, subSize: 25 / 685, // 인사말·설명은 시안보다 조금 크게
};
// 위쪽 고정 높이: 스크롤 여백 16 + 로고 줄 52 + 사이 16 / 카드가 위쪽(hero)과 겹치는 길이 18
const HERO_TOP = 84;
const CARD_OVERLAP = 18;
// 홈 전체 배경 그림 '학교배경1' 941×1672 (위: 하늘, 가운데: 학교 건물, 아래: 광장·나무)
const BG_RATIO = 1672 / 941;
// 미어캣(PREVI) 그림은 241×400 (책 아래 끝 y 292 → 키의 73%). 말풍선을 없앤 자리만큼 키움:
// 키는 화면 폭의 55%(말풍선이 있던 때 44%와 없앤 뒤 66%의 중간), 머리 가운데는 화면 폭의 73%. 책 아래 끝까지 카드 위로 보임
const MASCOT = { ratio: 241 / 400, h: 0.55, centerX: 0.73, bookBottom: 292 / 400 };
/** "오늘 마감" 또는 "10/15(목)까지" */
function dueText(t: Todo) {
  if (t.d_day === 0) return '오늘 마감';
  if (!t.due_date) return '마감 없음';
  const d = new Date(t.due_date + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})까지`;
}

export default function Home() {
  const { data, error, loading, reload } = useApi<HomeData>('/home');
  // 서버 /home에 이름·안 읽은 알림 수가 없으면 내 정보·알림 목록에서 채움 (없을 때만 부름)
  const me = useApi<Me>(data && data.nickname === undefined ? '/me' : null);
  const notes = useApi<Notification[]>(data && data.unread_notifications === undefined ? '/notifications' : null);
  const nickname = data?.nickname || me.data?.nickname;
  const unread = data?.unread_notifications ?? notes.data?.filter((n) => !n.read).length ?? 0;
  const [page, setPage] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // 대화창 바는 아래 안전 영역(안드로이드 하단 바)만큼 더 높음 → 스크롤 끝 여백에도 더해야 메뉴 칸 글자가 안 가려짐
  const insets = useSafeAreaInsets();
  // 화면 폭(웹은 휴대폰 폭 최대 480)에 맞춰 피그마 비율로 위치 계산
  const W = Platform.OS === 'web' ? Math.min(screenWidth, 480) : screenWidth;
  const minHeight = W * FIG.cardTop - HERO_TOP + CARD_OVERLAP;
  // 글자 크기도 화면 폭 비율 (시안과 같은 비율)
  const fs = {
    logo: Math.max(26, W * FIG.logoSize),
    logoSub: Math.max(12, W * FIG.logoSubSize),
    hello: Math.max(24, W * FIG.helloSize),
    sub: Math.max(14, W * FIG.subSize),
  };
  // 미어캣은 다리·꼬리가 '오늘 챙길 일' 카드 뒤로 들어가고 책 아래 끝까지 보이게
  // (hero 안 기준 = 스크롤 내용 왼쪽 여백 16 안쪽. 위치는 hero 아래 끝에서 잼 → 화면이 길어 hero가 늘어나도 카드 위에 그대로)
  const mascotH = W * MASCOT.h;
  const mascotW = mascotH * MASCOT.ratio;
  const mascotLeft = W * MASCOT.centerX - mascotW / 2 - 16;
  // 배경 그림: 위쪽(학교)을 맞추고 화면을 꽉 채움 (넘치면 좌우나 아래가 잘림)
  const bgW = Math.max(W, screenHeight / BG_RATIO);
  const hero = {
    minHeight,
    padTop: Math.max(0, W * FIG.hello - HERO_TOP),
    mascot: { bottom: CARD_OVERLAP - mascotH * (1 - MASCOT.bookBottom), left: mascotLeft, width: mascotW, height: mascotH },
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
  // ▶ FE 13번에 해당하는 부분: 오늘 챙길 일(D-day 순) 3개씩 한 쪽 + 마지막 쪽은 다음 일정 카드 (피그마 홈: 다음 일정 → A-2)
  const pages: (Todo[] | 'event')[] = [];
  for (let i = 0; i < (data?.today_todos.length ?? 0); i += 3) pages.push(data!.today_todos.slice(i, i + 3));
  if (data?.next_event) pages.push('event');
  const lastPage = Math.max(0, pages.length - 1);
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

  return (
    <View style={st.safe}>
      {/* ▶ FE 12번에 해당하는 부분: 홈 전체 배경 그림(받은 그림 그대로). 스크롤해도 배경은 그 자리, 카드만 위로 지나감
          로고·인사말·미어캣은 그 위에 그림. 눌러도 이동하지 않음(채팅은 아래 바로) */}
      <Image accessibilityLabel="캠퍼스 배경 그림" source={require('../../assets/home-bg.jpg')} pointerEvents="none"
        style={[st.bg, { width: bgW, height: bgW * BG_RATIO, left: (W - bgW) / 2 }]} />
      <SafeAreaView style={st.safeInner} edges={['top']}>
        <ScrollView contentContainerStyle={[st.scroll, { paddingBottom: st.scroll.paddingBottom + insets.bottom }]}>
          {/* 머리: 로고 · 알림 · 내 정보 */}
          <View style={st.header}>
            <View>
              <View pointerEvents="none" style={st.halo} />
              <View style={st.row}>
                <Text style={[st.logo, { fontSize: fs.logo }]}>PREVI</Text>
                <MaterialCommunityIcons name="leaf" size={22} color={HOME_INK.leaf} />
              </View>
              <Text style={[st.logoSub, { fontSize: fs.logoSub }]}>서경대학교 학생을 위한 스마트 비서</Text>
            </View>
            <View style={[st.row, { gap: 20 }]}>
              <Pressable accessibilityLabel="알림" onPress={() => router.push('/notifications')}>
                <Feather name="bell" size={24} color={HOME_INK.icon} />
                {unread > 0 && <View style={st.dot} />}
              </Pressable>
              <Pressable accessibilityLabel="내 정보" onPress={() => router.push('/me')}>
                <Feather name="user" size={24} color={HOME_INK.icon} />
              </Pressable>
            </View>
          </View>

          <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
            {data && (
              <>
                {/* ▶ FE 12번에 해당하는 부분: 인사 + 마스코트. 인사말·미어캣 위치는 새 홈 시안과 같은 비율
                    (브리핑 말풍선은 2026-10-27 요청으로 기능째 뺌. GET /home의 briefing은 앱에서 안 씀) */}
                <View style={[st.hero, { minHeight: hero.minHeight }]}>
                  {/* 인사말: 줄마다 그 글자 길이만큼만 흐림 판을 깔아 가독성을 높임 (흐림 판은 글자와 따로 둔 뒤판이라 글자는 또렷함) */}
                  <View style={[st.heroText, { paddingTop: hero.padTop }]}>
                    <BlurBlock text={`안녕하세요,\n${nickname || '서경인'}님!`} style={[st.hello, { fontSize: fs.hello, lineHeight: fs.hello * 1.18 }]} />
                    <BlurBlock text={'오늘도 PREVI와\n편리한 캠퍼스 생활을 시작해요.'} style={[st.helloSub, { fontSize: fs.sub, lineHeight: fs.sub * 1.45 }]} />
                  </View>
                  {/* 마스코트 PREVI(미어캣): 받은 그림 그대로 (투명 여백만 잘라 냄) */}
                  <Image accessibilityLabel="마스코트 PREVI" source={require('../../assets/mascot.png')} pointerEvents="none"
                    resizeMode="contain" style={[st.mascot, hero.mascot]} />
                </View>

                {/* 오늘 챙길 일: 3개씩 넘겨 보기 */}
                <View style={st.panel}>
                  <View style={[st.row, { justifyContent: 'space-between' }]}>
                    <View style={st.row}>
                      <MaterialCommunityIcons name="calendar-check-outline" size={24} color={HOME_INK.title} />
                      <Text style={st.panelTitle}>오늘 챙길 일</Text>
                    </View>
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
                              : items.map((t) => <TodoRow key={t.id} t={t} open={open} />)}
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
                  <Text style={st.helpSub}>PREVI가 학교 자료를 찾아 도와드릴게요.</Text>
                  <View style={st.grid}>
                    {MENUS.map((m) => (
                      <Pressable key={m.label} style={st.tile} onPress={() => router.push(m.href)}>
                        <View style={[st.tileIcon, { backgroundColor: m.tint }]}><MaterialCommunityIcons name={m.icon} size={24} color={m.tone} /></View>
                        <Text style={st.tileLabel}>{m.label}</Text>
                        {/* 비서 한 줄 상태 */}
                        {m.status && !!data.menu_status[m.status] &&<Text style={st.tileStatus} numberOfLines={2}>{data.menu_status[m.status]}</Text>}
                      </Pressable>
                    ))}
                  </View>
                </View>

              </>
            )}
          </StateView>
        </ScrollView>

      </SafeAreaView>
    </View>
  );
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
      <View style={[st.eventIcon, { backgroundColor: EVENT_TONE.tint }]}><MaterialCommunityIcons name="calendar-star" size={34} color={EVENT_TONE.tone} /></View>
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

/** 인사말 글자 덩어리: 줄마다 그 줄 길이만큼만 흐림 판(st.textBlur)을 깔고 그 위에 글자 → 흐림이 계단 모양으로 글자를 따라감.
 *  줄 판은 위아래로 맞붙어 이어지고, 흐림이 투명해지는 건 덩어리 맨 위·맨 아래와 각 줄 오른쪽·왼쪽 끝뿐.
 *  바깥으로 튀어나온 모서리(덩어리 네 귀퉁이, 옆 줄보다 긴 줄의 오른쪽 끝)는 둥글게 → 각져 보이지 않게 */
function BlurBlock({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const lines = text.split('\n');
  const [widths, setWidths] = useState<number[]>([]);
  const [lineH, setLineH] = useState(0);
  const r = Math.min(BLUR_RADIUS, lineH / 2);
  // 옆 줄 너비를 아직 모르면(첫 그림) 둥글게 처리
  const longer = (i: number, j: number) => !(widths[j] > 0) || widths[i] - widths[j] > 1;
  return (
    <View>
      {lines.map((line, i) => {
        const first = i === 0;
        const last = i === lines.length - 1;
        const corner = {
          borderTopLeftRadius: first ? r : 0,
          borderBottomLeftRadius: last ? r : 0,
          borderTopRightRadius: first || longer(i, i - 1) ? r : 0,
          borderBottomRightRadius: last || longer(i, i + 1) ? r : 0,
        };
        return (
          <View
            key={i}
            style={st.textBox}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setWidths((w) => (w[i] === width ? w : Object.assign([...w], { [i]: width })));
              if (first) setLineH(height);
            }}
          >
            <View pointerEvents="none" style={[st.textBlur, { top: first ? -FADE_Y : 0, bottom: last ? -FADE_Y : 0 }, corner, lineMask(first, last)]} />
            <Text style={style}>{line}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** D-day 색: 3일 이내 빨강, 7일 이내 노랑, 그 뒤(마감 없음 포함) 초록 — 피그마 Today-Card 색 */
function ddayTone(d: number | null) {
  if (d !== null && d <= 3) return { dot: '#E8645F', bg: '#FCE3E1', text: '#E0605B' };
  if (d !== null && d <= 7) return { dot: '#F2B84B', bg: '#FDF0D3', text: '#D9971F' };
  return { dot: '#3DB57A', bg: '#E1F3E8', text: '#2E8B5E' };
}

function TodoRow({ t, open }: { t: Todo; open: (href: Href) => void }) {
  const tone = ddayTone(t.d_day);
  return (
    <Pressable style={st.todoRow} onPress={() => open(`/todos/${t.id}`)}>
      {/* 피그마 seokyeong_ai_app_with_images 1 › Today-Card: 색 점 + 둥근 D-day 배지 (급할수록 빨강 → 노랑 → 초록) */}
      <View style={[st.ddayDot, { backgroundColor: tone.dot }]} />
      <View style={[st.dday, { backgroundColor: tone.bg }]}>
        <Text style={[st.ddayText, { color: tone.text }]}>
          {t.d_day === null ? '-' : t.d_day === 0 ? 'D-DAY' : `D-${t.d_day}`}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={st.row}>
          <MaterialCommunityIcons name="calendar-check-outline" size={15} color={HOME_INK.muted} />
          <Text style={[st.todoTitle, { flex: 1 }]} numberOfLines={1}>{t.title}</Text>
        </View>
        <Text style={st.todoDue}>{dueText(t)}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={color.inkSub} />
    </Pressable>
  );
}

const shadow = { shadowColor: '#0C6B3F', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

// 사진 위 글자가 잘 읽히게 글자 둘레만 하얗게 번지게 (사진은 그대로)
// 휴대폰은 뒤 판이 옅어서 번짐을 조금 더 크게
const glow = { textShadowColor: '#fff', textShadowRadius: Platform.OS === 'web' ? 6 : 10, textShadowOffset: { width: 0, height: 0 } };

// 새 홈 시안의 글자색 (진한 초록 제목, 회청색 설명, 남색 할 일 제목)
// hero: 로고 'PREVI'·인사말 (제목보다 조금 밝은 초록)
const HOME_INK = { hero: '#1B7F57', title: '#0E5A42', logoSub: '#1D5456', leaf: '#3FA66B', icon: '#0B4D40', sub: '#3E5160', item: '#1B2A44', muted: '#8A92A0' };

// 흐림 판 가장자리: 안쪽은 꽉 채우고, 판 테두리(좌우 FADE_X, 위아래 FADE_Y)에서만 점점 투명해짐.
// 두 방향 그라데이션이 겹치는 곳만 남김(intersect) → 모서리도 부드럽게 사라짐. 위아래 페이드는 덩어리 맨 위·맨 아래 줄에만
// 판은 글자 끝에서 좌우로 BLUR_X만 더 나가고, 투명해지는 폭 FADE_X는 그보다 넓게 잡아 글자 끝 바로 뒤에서부터 부드럽게 사라짐
const BLUR_X = 4;
const FADE_X = 8;
const FADE_Y = 6;
const BLUR_RADIUS = 16; // 흐림 판 바깥 모서리 둥글기 (줄 높이의 절반을 넘지 않게)
function lineMask(top: boolean, bottom: boolean) {
  if (Platform.OS !== 'web') return null;
  const y = `linear-gradient(to bottom, ${top ? 'transparent' : '#000'}, #000 ${FADE_Y}px, #000 calc(100% - ${FADE_Y}px), ${bottom ? 'transparent' : '#000'})`;
  const mask = `linear-gradient(to right, transparent, #000 ${FADE_X}px, #000 calc(100% - ${FADE_X}px), transparent), ${y}`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' } as object;
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.homeBg, overflow: 'hidden' },
  safeInner: { flex: 1 },
  bg: { position: 'absolute', top: 0 },
  // 맨 아래까지 내리면 '어떤 도움이 필요하신가요?' 칸 아래 끝이 대화창 바 둥근 윗부분 밑으로 16만 들어가게 (칸의 아래 여백 18 안쪽이라 내용은 안 가림, 사이 빈틈 없음)
  // flexGrow: 내용이 화면보다 짧아도 화면 끝까지 채움 (늘어나는 곳은 hero)
  scroll: { flexGrow: 1, padding: 16, gap: 16, paddingBottom: SHEET_BAR - 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  // 로고·인사말 글자 크기는 화면 폭 비율이라 그릴 때 넣음 (fs)
  logo: { fontWeight: '800', color: HOME_INK.hero },
  logoSub: { color: HOME_INK.logoSub, marginTop: 2, fontWeight: '600', ...glow },
  dot: { position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryLight },

  mascot: { position: 'absolute' },
  // flexGrow: 화면이 내용보다 길면 남는 높이를 위쪽 그림 칸이 차지 → 아래 칸과 대화창 바 사이에 빈 곳이 안 생김
  hero: { flexGrow: 1, marginBottom: -34 },
  heroText: { gap: 8, width: '72%' }, // 커진 설명 문구가 두 줄에 들어가게
  // 글자 뒤 하얀 번짐: 배경 그림이 복잡한 곳에서도 글자가 잘 보이게 (웹은 가장자리를 흐리게, 휴대폰은 반투명 둥근 판)
  // 휴대폰은 blur가 없어 판이 그대로 보이므로 훨씬 옅게 (10/30 실기기: 흰 상자처럼 보임)
  halo: { position: 'absolute', top: -12, left: -14, right: -14, bottom: -12, borderRadius: 28, ...(Platform.OS === 'web' ? ({ backgroundColor: 'rgba(255,255,255,0.62)', filter: 'blur(14px)' } as object) : { backgroundColor: 'rgba(255,255,255,0.28)' }) },
  // 인사말 줄 뒤 흐림 (시안처럼 건물을 가릴 만큼 진하게, 범위는 글자 둘레만): 웹은 그 줄 뒤 배경 그림만 흐리게(backdrop-filter)
  // + 하얀 막, 가장자리는 lineMask로 점점 투명. 휴대폰은 backdrop-filter·가장자리 페이드가 없어서 옅은 판 + 글자 번짐(glow)으로 읽히게
  textBox: { alignSelf: 'flex-start' },
  textBlur: {
    position: 'absolute', left: -BLUR_X, right: -BLUR_X,
    ...(Platform.OS === 'web'
      ? ({ backgroundColor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
      : { backgroundColor: 'rgba(255,255,255,0.32)' }),
  },
  hello: { fontWeight: '800', color: HOME_INK.hero, ...glow },
  helloSub: { color: HOME_INK.sub, fontWeight: '700', ...glow },
  event: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 4 },
  eventIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  eventLabel: { fontSize: 12, color: color.inkSub, fontWeight: '600' },
  eventTitle: { fontSize: 18, fontWeight: '800', color: color.ink },
  eventDate: { fontSize: 14, color: color.inkSub },
  eventSub: { fontSize: 13, color: color.inkSub },
  eventGo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.line },

  panel: { backgroundColor: '#fff', borderRadius: 24, padding: 18, gap: 14, ...shadow },
  panelTitle: { fontSize: 20, fontWeight: '800', color: HOME_INK.title },
  more: { fontSize: 14, color: HOME_INK.muted },
  todoCard: { borderWidth: 1, borderColor: color.line, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#fff' },
  empty: { padding: 20, textAlign: 'center', color: color.inkSub },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  ddayDot: { width: 9, height: 9, borderRadius: 5 },
  dday: { borderRadius: 999, paddingVertical: 5, minWidth: 60, paddingHorizontal: 10, alignItems: 'center' },
  ddayText: { fontSize: 13, fontWeight: '800' },
  todoTitle: { fontSize: 16, fontWeight: '700', color: HOME_INK.item },
  todoDue: { fontSize: 13, fontWeight: '500', color: HOME_INK.muted, marginLeft: 21 }, // 제목 앞 달력 아이콘(15) + 간격(6)만큼 들여씀
  pageDotHit: { padding: 4 },
  pageDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D5DBD7' },
  pageDotOn: { backgroundColor: color.primary },

  helpBox: { backgroundColor: color.primarySoft, borderRadius: 24, padding: 18, gap: 4 },
  helpTitle: { fontSize: 19, fontWeight: '800', color: color.ink },
  helpSub: { fontSize: 13, color: color.inkSub, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 8, ...shadow },
  tileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 13, fontWeight: '700', color: color.ink },
  tileStatus: { fontSize: 11, color: color.primaryLight, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
});
