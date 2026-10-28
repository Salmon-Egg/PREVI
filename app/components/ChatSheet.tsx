// ▶ FE 15번에 해당하는 부분: 홈 아래 'PREVI에게 물어보세요!' 바 = 끌어 올리는 AI 대화창 (삼성페이처럼)
// 바를 잡고 위로 올리면 대화 화면(H-1·H-2, ChatPanel)이 손가락·마우스를 따라 아래에서 올라오고,
// 끝까지 올리면 화면을 옮기지 않고 그 자리에서 바로 대화함. 위쪽 화살표(또는 바)를 누르면 끝까지 올린 것과 같음.
// 열린 상태에서 머리줄을 잡고 내리거나 ⌄를 누르면(안드로이드는 뒤로 가기도) 다시 바로 내려감.
// ⏱(대화 기록)도 이 창 안에서 열리고, 기록에서 고른 대화도 이 창에서 이어서 봄 (FE 34번)
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, BackHandler, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadChat } from '../lib/chatStore';
import { color } from '../lib/theme';
import { ChatHistory } from './ChatHistory';
import { ChatPanel } from './ChatPanel';
import { Text } from './Text';
import { Character } from './ui';

/** 접혀 있을 때 보이는 높이 (손잡이 + 바) — 여기에 아래 안전 영역이 더해짐 */
export const SHEET_BAR = 90;
const HEADER = 56; // 펼쳤을 때 머리줄 높이
const native = Platform.OS !== 'web';

export function ChatSheet() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // 웹은 onLayout이 늦거나 안 올 때(탭이 가려져 있을 때 등)가 있어서 붙는 순간 바로 잼
  const measureWeb = useCallback((el: ComponentRef<typeof View> | null) => {
    const h = Platform.OS === 'web' && el ? (el as unknown as HTMLElement).getBoundingClientRect().height : 0;
    if (h) setMeasured(h);
  }, []);
  const H = measured || windowHeight;
  const sheetH = H - insets.top; // 끝까지 올렸을 때 높이 (상태 표시줄 아래부터)
  const closedY = Math.max(0, sheetH - SHEET_BAR - insets.bottom); // 접혔을 때 아래로 내려간 거리

  const [y] = useState(() => new Animated.Value(closedY));
  const pos = useRef(closedY); // 지금(또는 움직이는 중인 목표) 위치
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false); // 창 안에 대화 기록을 보는 중
  const [grabbing, setGrabbing] = useState(false);

  // 화면 크기가 바뀌면(웹 창 크기 등) 접힌 위치 다시 맞춤
  useEffect(() => {
    if (!open) {
      pos.current = closedY;
      y.setValue(closedY);
    }
  }, [closedY, open, y]);

  const moveTo = useCallback((toOpen: boolean) => {
    const to = toOpen ? 0 : closedY;
    pos.current = to;
    setOpen(toOpen);
    if (!toOpen) setHistory(false);
    Animated.timing(y, { toValue: to, duration: 240, useNativeDriver: native }).start();
    // 탭이 가려져 애니메이션이 멈춰도 끝 위치로 가도록
    setTimeout(() => y.setValue(pos.current), 280);
  }, [closedY, y]);

  // 안드로이드 뒤로 가기: 펼쳐져 있으면 먼저 내림
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (history) setHistory(false); // 대화 기록이면 먼저 대화로
      else moveTo(false);
      return true;
    });
    return () => sub.remove();
  }, [open, history, moveTo]);

  // PanResponder 처리 함수는 그리는 중이 아니라 손가락·마우스 움직임 때만 불리므로 ref를 읽고 바꿔도 안전함
  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const pan = useMemo(() => {
    let start = 0;
    const clamp = (v: number) => Math.max(0, Math.min(closedY, v));
    return PanResponder.create({
      // 위아래로 끄는 움직임일 때만 가로챔. 그냥 누르기(바·화살표·⌄)는 그대로 버튼으로 동작
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        start = pos.current;
        y.stopAnimation();
        setGrabbing(true);
      },
      onPanResponderMove: (_, g) => y.setValue(clamp(start + g.dy)),
      onPanResponderRelease: (_, g) => {
        setGrabbing(false);
        const v = clamp(start + g.dy);
        // 빠르게 튕기면 그 방향으로, 아니면 반 넘게 올렸는지로 결정
        moveTo(g.vy < -0.5 ? true : g.vy > 0.5 ? false : v < closedY / 2);
      },
      onPanResponderTerminate: () => {
        setGrabbing(false);
        moveTo(pos.current === 0);
      },
    });
  }, [closedY, moveTo, y]);
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  return (
    <View ref={measureWeb} style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setMeasured(e.nativeEvent.layout.height)}>
      {/* 펼쳐질수록 뒤의 홈이 어두워짐 */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.dim, { opacity: y.interpolate({ inputRange: [0, closedY || 1], outputRange: [1, 0], extrapolate: 'clamp' }) }]} />
      <Animated.View style={[st.sheet, { top: insets.top, height: sheetH, transform: [{ translateY: y }] }]}>
        {/* 잡는 곳: 손잡이 + 바(접힘) / 머리줄(펼침) */}
        <View {...pan.panHandlers} style={[st.grip, { paddingBottom: open ? 8 : 8 + insets.bottom }, Platform.OS === 'web' && (webGrip(grabbing) as object)]}>
          <View style={st.handle} />
          {open ? (
            <View style={st.header}>
              {history ? (
                <Pressable accessibilityLabel="대화로 돌아가기" hitSlop={8} onPress={() => setHistory(false)} style={st.headerBtn}>
                  <Feather name="chevron-left" size={24} color={color.ink} />
                </Pressable>
              ) : (
                <Pressable accessibilityLabel="대화창 내리기" hitSlop={8} onPress={() => moveTo(false)} style={st.headerBtn}>
                  <Feather name="chevron-down" size={24} color={color.ink} />
                </Pressable>
              )}
              <Text style={st.headerTitle}>{history ? '대화 기록' : 'PREVI'}</Text>
              {history ? <View style={st.headerBtn} /> : (
                <Pressable accessibilityLabel="대화 기록" hitSlop={8} onPress={() => setHistory(true)} style={st.headerBtn}>
                  <Feather name="clock" size={21} color={color.ink} />
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable style={st.ask} accessibilityLabel="PREVI 대화창 열기" onPress={() => moveTo(true)}>
              <View style={st.askAvatar}><Character face size={44} /></View>
              {/* 폭이 좁은 휴대폰(360 미만)에서도 한 줄에 들어가게 글자를 조금 줄임 */}
              <Text style={[st.askText, windowWidth < 360 && { fontSize: 14 }]} numberOfLines={1}>PREVI에게 물어보세요!</Text>
              {/* 위쪽 화살표: 누르면 끝까지 끌어 올린 것처럼 대화창이 올라옴 */}
              <View style={st.askBtn}><Feather name="arrow-up" size={22} color="#fff" /></View>
            </Pressable>
          )}
        </View>
        {/* 대화 본문: 접혀 있어도 그려 둬서, 끌어 올리는 동안 대화 화면이 그대로 따라 올라옴 */}
        <View style={{ flex: 1 }} pointerEvents={open ? 'auto' : 'none'}>
          {history ? (
            // 기록에서 대화를 고르면 그 대화를 불러와 이 창에서 이어서 봄
            <ScrollView contentContainerStyle={st.history} keyboardShouldPersistTaps="handled">
              <ChatHistory onOpen={(id) => { loadChat(id); setHistory(false); }} />
            </ScrollView>
          ) : (
            <ChatPanel keyboardOffset={insets.top + HEADER} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

/** 웹: 잡을 수 있다는 마우스 모양(grab), 끄는 동안 글자 선택·페이지 스크롤 막기 */
function webGrip(grabbing: boolean) {
  return { cursor: grabbing ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' };
}

const shadow = { shadowColor: '#0C6B3F', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 };

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(12, 30, 20, 0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: color.homeBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...shadow },
  grip: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5DBD7', marginBottom: 10 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.line, borderRadius: 32, padding: 6, paddingLeft: 8 },
  askAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  askText: { flex: 1, fontSize: 17, fontWeight: '800', color: color.primary },
  askBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', height: HEADER - 14, paddingBottom: 6 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: color.primary },
  history: { padding: 16, gap: 12 },
});
