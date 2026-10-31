// ▶ FE 2번에 해당하는 부분: 공통 컴포넌트 (화면 틀, 카드·사진 카드, D-day 배지, 판정 배지, 출처, 빈 화면·로딩·오류 상태)
// 여러 화면이 같이 쓰는 부품. 색은 lib/theme.ts. 2026-10-27 새 시안 모양:
// 하늘색→연두 배경 + 초록 제목(‹ 뒤로) + 반투명 흰 판(내용) + 판 아래쪽 초록 그라데이션 버튼
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Linking, Modal, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApiError } from '../lib/api';
import { color, gradient, gradientBg, webBlur } from '../lib/theme';
import type { ChatCard, Verdict } from '../lib/types';
import { Pressable, Text } from './Text';

const web = Platform.OS === 'web';

// ▶ FE 6번에 해당하는 부분: 웹 링크에서는 브라우저 alert/confirm 창이 막히는 곳(임베드·미리보기)이 있어서
// 웹은 앱 안에 그리는 창(DialogHost)으로 보여 줌. 휴대폰은 기존처럼 기본 Alert
type Dialog = { title: string; message: string; okLabel?: string; onOk?: () => void };
let dialog: Dialog | null = null;
const dialogListeners = new Set<() => void>();
function openDialog(next: Dialog | null) {
  dialog = next;
  dialogListeners.forEach((l) => l());
}

/** 알림창 */
export function showAlert(title: string, message: string) {
  if (web) openDialog({ title, message });
  else Alert.alert(title, message);
}

/** 바깥 링크 열기. 서버·공지에서 온 주소라 http(s)만 열고 javascript:, intent:, file: 같은 건 막음 */
export function isSafeUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\/\S+$/i.test(url.trim());
}

export async function openLink(url: string | null | undefined) {
  if (!isSafeUrl(url)) return showAlert('링크를 열 수 없어요', '올바른 웹 주소가 아니에요.');
  try {
    await Linking.openURL(url.trim());
  } catch {
    showAlert('링크를 열 수 없어요', '잠시 뒤 다시 시도해 주세요.');
  }
}

/** 확인/취소 창. 확인을 누르면 onOk */
export function confirmAsk(title: string, message: string, okLabel: string, onOk: () => void) {
  if (web) openDialog({ title, message, okLabel, onOk });
  else Alert.alert(title, message, [{ text: '취소', style: 'cancel' }, { text: okLabel, onPress: onOk }]);
}

/** 웹에서 showAlert·confirmAsk 창을 그리는 곳. 맨 위 레이아웃(app/_layout.tsx)에 한 번 둠 */
export function DialogHost() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    dialogListeners.add(l);
    return () => {
      dialogListeners.delete(l);
    };
  }, []);
  if (!dialog) return null;
  const d = dialog;
  const close = () => openDialog(null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={s.dim}>
        <View style={s.dialog}>
          <Text style={s.dialogTitle}>{d.title}</Text>
          <Text style={[s.body, { textAlign: 'center' }]}>{d.message}</Text>
          <Row style={{ alignSelf: 'stretch', marginTop: 8 }}>
            {d.onOk && <View style={{ flex: 1 }}><Button label="취소" kind="ghost" onPress={close} /></View>}
            <View style={{ flex: d.onOk ? 1.6 : 1 }}>
              <Button label={d.okLabel ?? '확인'} onPress={() => { close(); d.onOk?.(); }} />
            </View>
          </Row>
        </View>
      </View>
    </Modal>
  );
}

/** 새 시안 배경: 위 하늘색 → 아래 연두 + 구석의 흐린 초록 얼룩 */
export function AppBackground({ css = gradient.screen }: { css?: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, gradientBg(css, '#E2F0EA')]}>
      <View style={[s.blob, { top: -70, left: -90, width: 220, height: 220 }]} />
      <View style={[s.blob, { top: '42%', right: -110, width: 200, height: 260 }]} />
      <View style={[s.blob, { bottom: -60, left: -40, width: 240, height: 200 }]} />
      <View style={[s.blob, { bottom: -80, right: -60, width: 220, height: 220 }]} />
    </View>
  );
}

/** 뒤로 (처음 연 화면이면 홈으로) */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** 화면 틀: 배경 + ‹ 제목 + 반투명 흰 판(내용) + 판 아래 고정 버튼(footer)
 *  back=false면 뒤로 버튼 없음(처음 설정), scroll=false면 판 안을 직접 채움(시간표 표 등) */
export function Screen({ title, right, footer, children, scroll = true, back = true, gap = 12 }: {
  title: string; right?: ReactNode; footer?: ReactNode; children: ReactNode; scroll?: boolean; back?: boolean; gap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title }} />
      <AppBackground />
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        {back && (
          <Pressable accessibilityLabel="뒤로" hitSlop={10} onPress={goBack} style={s.back}>
            <Feather name="chevron-left" size={30} color={color.title} />
          </Pressable>
        )}
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      <View style={[s.panel, { marginBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {scroll ? (
          <ScrollView contentContainerStyle={[s.content, { gap }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        ) : (
          <View style={[s.content, { gap, flex: 1 }]}>{children}</View>
        )}
        {footer && <View style={s.footer}>{footer}</View>}
      </View>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Sub({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.sub, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

/** 주 버튼 = 초록 그라데이션, ghost = 흰 바탕 + 초록 테두리. compact = 두 개 나란히 놓을 때 (글자 조금 작게) */
// 공지·할 일 상세와 같은 종류의 이모지를 대신하는 그림 아이콘 (2026-10-30 받은 그림, 96×96으로 줄임).
// 맞는 그림이 없는 ✨·⏰·🎓·📌 등은 이모지 그대로
const PICS = {
  checklist: require('../assets/icons/checklist.png'), // 📋 할 일
  close: require('../assets/icons/close.png'), // ⛔ 조건 미충족
  idea: require('../assets/icons/idea.png'), // 💡 팁
  link: require('../assets/icons/link.png'), // 🔗 링크
  chat: require('../assets/icons/chat.png'), // 💬 프리비에게 묻기
  warn: require('../assets/icons/warn.png'), // ⚠️ 유의사항·확인 필요
  notice: require('../assets/icons/notice.png'), // 📢 공지
  check: require('../assets/icons/check.png'), // ✅☑️ 완료·신청 가능
};
export type PicName = keyof typeof PICS;

/** 꾸밈용 그림 아이콘 (화면 읽기 프로그램은 옆 글자만 읽음) */
export function Pic({ name, size = 20 }: { name: PicName; size?: number }) {
  return <Image source={PICS[name]} style={{ width: size, height: size }} accessible={false} />;
}

/** 그림 아이콘 + 글자 한 줄 (제목·안내 머리글용) */
export function PicText({ name, size = 20, children, style }: { name: PicName; size?: number; children: ReactNode; style?: object }) {
  return (
    <View style={s.picRow}>
      <Pic name={name} size={size} />
      <Text style={[style, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled, compact, icon }: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean; compact?: boolean; icon?: PicName;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, compact && { paddingHorizontal: 6 }, primary ? [gradientBg(gradient.primary, color.primary), s.btnShadow] : s.btnGhost, (pressed || disabled) && { opacity: 0.55 }]}
    >
      <View style={s.picRow}>
        {icon && <Pic name={icon} size={compact ? 20 : 22} />}
        <Text style={[s.btnText, compact && { fontSize: 14 }, { color: primary ? '#fff' : color.title, flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Badge({ label, tone = 'soft' }: { label: string; tone?: 'strong' | 'soft' | 'warn' | 'bad' }) {
  const bg = { strong: color.primary, soft: color.primarySoft, warn: color.warnSoft, bad: color.redSoft }[tone];
  const fg = { strong: '#fff', soft: color.primary, warn: color.warn, bad: color.red }[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function DdayBadge({ dDay }: { dDay: number | null }) {
  if (dDay === null) return <Badge label="마감 없음" />;
  if (dDay < 0) return <Badge label="마감 지남" tone="bad" />;
  return <Badge label={dDay === 0 ? 'D-DAY' : `D-${dDay}`} tone={dDay <= 1 ? 'strong' : 'soft'} />;
}

export const VERDICT_KO: Record<Verdict, string> = { eligible: '신청 가능', check: '확인 필요', ineligible: '조건 미충족' };

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const tone = verdict === 'eligible' ? 'strong' : verdict === 'check' ? 'warn' : 'bad';
  return <Badge label={VERDICT_KO[verdict]} tone={tone} />;
}

export function Sources({ items }: { items: { title: string; url: string | null }[] }) {
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 2 }}>
      <Text style={s.source}>출처</Text>
      {items.map((i) => isSafeUrl(i.url) ? (
        <Pressable key={i.title} accessibilityRole="link" onPress={() => openLink(i.url)}>
          <Text style={[s.source, { color: color.primary, textDecorationLine: 'underline' }]}>{i.title} ›</Text>
        </Pressable>
      ) : <Text key={i.title} style={s.source}>{i.title}</Text>)}
    </View>
  );
}

/** "121 / 130" 같은 줄이면 [121, 130] */
function ratioOf(line: string | undefined): [number, number] | null {
  const m = line?.match(/^(\d+)\s*\/\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** ▶ FE 31번에 해당하는 부분: 공지·졸업 요건 등 모든 카드가 같은 모양 (API 명세 챗봇 cards).
 *  시안 06 ②처럼 두 번째 줄이 "121 / 130"이면 진행 막대, 셋째 줄부터 "✓ 전공 필수 36/39" 같은 체크 목록으로 보여 줌 */
export function InfoCard({ card }: { card: ChatCard }) {
  const ratio = ratioOf(card.lines[1]);
  return (
    <Pressable style={s.infoCard} disabled={!isSafeUrl(card.link)} onPress={() => openLink(card.link)}>
      {card.image_url && <Image accessibilityLabel={card.title} source={{ uri: card.image_url }} style={s.infoImage} />}
      <Text style={s.infoTitle}>{card.title}</Text>
      <Text style={s.infoBig}>{card.lines[0]}</Text>
      {ratio ? (
        <>
          <View style={s.progress}><View style={[s.progressFill, { width: `${Math.min(100, (ratio[0] / ratio[1]) * 100)}%` }]} /></View>
          <Text style={s.sub}>{card.lines[1]} · {Math.round((ratio[0] / ratio[1]) * 100)}%</Text>
        </>
      ) : card.lines[1] ? <Text style={s.sub} numberOfLines={2}>{card.lines[1]}</Text> : null}
      {card.lines.slice(2).map((l, i) => {
        const done = l.startsWith('✓');
        return (
          <View key={i} style={s.row}>
            <Feather name={done ? 'check-circle' : 'circle'} size={14} color={done ? color.primaryLight : color.inkSub} />
            <Text style={[s.sub, { flex: 1 }]}>{l.replace(/^[✓○]\s*/, '')}</Text>
          </View>
        );
      })}
    </Pressable>
  );
}

/** ▶ FE 2번에 해당하는 부분: 아이콘·제목·설명 2줄·링크 카드 (공지·신청 내역이 같이 씀) */
export function ItemCard({ title, desc, icon, badge, meta, onPress }: {
  title: string; desc?: string | null; icon?: keyof typeof Feather.glyphMap;
  badge?: ReactNode; meta?: string | null; onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [s.card, s.item, pressed && { opacity: 0.7 }]} onPress={onPress} disabled={!onPress}>
      {icon && <View style={s.itemIcon}><Feather name={icon} size={20} color={color.primary} /></View>}
      <View style={{ flex: 1, gap: 3 }}>
        {badge}
        <Text style={s.itemTitle} numberOfLines={1}>{title}</Text>
        {!!desc && <Text style={s.sub} numberOfLines={2}>{desc}</Text>}
        {!!meta && <Text style={[s.sub, { fontSize: 12 }]}>{meta}</Text>}
      </View>
      {onPress && <Feather name="chevron-right" size={20} color={color.inkSub} />}
    </Pressable>
  );
}

/** ▶ FE 12번에 해당하는 부분: 마스코트 PREVI(미어캣, assets/mascot.png 241×400 그대로).
 *  size = 키. face=true면 동그라미 안에 머리 쪽만 (대화창·질문 바) */
export function Character({ size = 120, face = false }: { size?: number; face?: boolean }) {
  if (face) {
    const w = size * 1.2;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#F4EEE4' }}>
        <Image accessibilityLabel="마스코트 PREVI" source={require('../assets/mascot.png')}
          style={[{ position: 'absolute', width: w, height: w * (400 / 241), left: (size - w) / 2, top: size * 0.08 }]} />
      </View>
    );
  }
  return <Image accessibilityLabel="마스코트 PREVI" source={require('../assets/mascot.png')} resizeMode="contain"
    style={{ width: size * (241 / 400), height: size }} />;
}

/** ▶ FE 31번에 해당하는 부분: '답변 작성 중' 점 세 개 움직임 */
export function TypingDots() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 3, duration: 900, useNativeDriver: !web }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={[s.row, { gap: 4 }]} accessibilityLabel="답변 작성 중">
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[s.dot, { opacity: v.interpolate({ inputRange: [0, 1, 2, 3], outputRange: i === 0 ? [1, 0.3, 0.3, 1] : i === 1 ? [0.3, 1, 0.3, 0.3] : [0.3, 0.3, 1, 0.3] }) }]} />
      ))}
      <Text style={[s.sub, { marginLeft: 6 }]}>답변 작성 중</Text>
    </View>
  );
}

/** ▶ FE 1번에 해당하는 부분: 필터 칩 한 줄 (할 일·공지·대화 기록이 같이 씀) */
export function Chips<T>({ items, value, onChange, label }: { items: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
      {items.map((v) => {
        const on = v === value;
        return (
          <Pressable key={label(v)} onPress={() => onChange(v)} style={[s.chip, on && gradientBg(gradient.primary, color.primary), on && { borderColor: 'transparent' }]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 불러오는 중 / 오류 / 비어 있음. 셋 다 아니면 children을 보여 줌. */
export function StateView({ loading, error, empty, emptyText = '아직 없어요', onRetry, children }: {
  loading: boolean; error: ApiError | null; empty?: boolean; emptyText?: string; onRetry?: () => void; children: ReactNode;
}) {
  if (error) {
    return (
      <View style={s.center}>
        <Body>{error.message}</Body>
        {onRetry && <Button label="다시 시도" kind="ghost" onPress={onRetry} />}
      </View>
    );
  }
  if (loading && empty !== false) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }
  if (empty) {
    return (
      <View style={s.center}>
        <Sub>{emptyText}</Sub>
      </View>
    );
  }
  return <>{children}</>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(122, 196, 138, 0.42)', ...(web ? ({ filter: 'blur(46px)' } as object) : { opacity: 0.35 }) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingBottom: 18 },
  back: { marginLeft: -6 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: color.title },
  // 반투명 흰 판: 테두리는 흰색, 웹은 뒤 배경을 흐리게
  panel: { flex: 1, marginHorizontal: 16, borderRadius: 28, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.58)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)', ...(webBlur(14) ?? {}) },
  content: { padding: 18, flexGrow: 1 },
  footer: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 8, gap: 8 },
  title: { fontSize: 17, fontWeight: '800', color: color.title, marginTop: 6 },
  sub: { fontSize: 13, color: color.inkSub, lineHeight: 19 },
  body: { fontSize: 15, color: color.ink, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: color.field, borderRadius: 18, padding: 15, gap: 6, backgroundColor: 'rgba(255,255,255,0.94)' },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center' },
  btnShadow: { shadowColor: '#0B6B3F', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#B9D9C6' },
  btnText: { fontSize: 16, fontWeight: '800' },
  picRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  source: { fontSize: 12, color: color.inkSub },
  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: color.field, minWidth: 220, maxWidth: 300 },
  infoImage: { width: '100%', height: 120, borderRadius: 10, backgroundColor: color.surface },
  infoTitle: { fontSize: 13, fontWeight: '700', color: color.ink },
  infoBig: { fontSize: 22, fontWeight: '800', color: color.primary },
  progress: { height: 8, borderRadius: 4, backgroundColor: color.primarySoft, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: color.primary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '800', color: color.ink },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.primary },
  chip: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#fff', borderWidth: 1.2, borderColor: color.field },
  chipText: { fontSize: 13, fontWeight: '700', color: color.title },
  center: { padding: 32, alignItems: 'center', gap: 12 },
  dim: { flex: 1, backgroundColor: 'rgba(38, 64, 52, 0.45)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 26, padding: 22, gap: 10, width: '100%', maxWidth: 400, alignSelf: 'center', alignItems: 'center' },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: color.ink, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
