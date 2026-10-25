// ▶ FE 2번에 해당하는 부분: 공통 컴포넌트 (카드·사진 카드, D-day 배지, 판정 배지, 출처, 빈 화면·로딩·오류 상태)
// 여러 화면이 같이 쓰는 부품. 색은 lib/theme.ts.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { ApiError } from '../lib/api';
import { color } from '../lib/theme';
import type { ChatCard, Verdict } from '../lib/types';

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
  if (Platform.OS === 'web') openDialog({ title, message });
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
  if (Platform.OS === 'web') openDialog({ title, message, okLabel, onOk });
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
          <Text style={s.body}>{d.message}</Text>
          <View style={[s.row, { alignSelf: 'stretch', marginTop: 8 }]}>
            {d.onOk && <View style={{ flex: 1 }}><Button label="취소" kind="ghost" onPress={close} /></View>}
            <View style={{ flex: 1 }}>
              <Button label={d.okLabel ?? '확인'} onPress={() => { close(); d.onOk?.(); }} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={s.screen}>{children}</View>;
  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={s.screen}>
      {children}
    </ScrollView>
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

export function Button({ label, onPress, kind = 'primary', disabled }: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, primary ? s.btnPrimary : s.btnGhost, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[s.btnText, { color: primary ? '#fff' : color.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'soft' }: { label: string; tone?: 'strong' | 'soft' | 'warn' | 'bad' }) {
  const bg = { strong: color.primary, soft: color.primarySoft, warn: color.warnSoft, bad: color.badSoft }[tone];
  const fg = { strong: '#fff', soft: color.primary, warn: color.warn, bad: color.alert }[tone];
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
  return <Text style={s.source}>출처 · {items.map((i) => i.title).join(', ')}</Text>;
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
      {card.image_url && <Image source={{ uri: card.image_url }} style={s.infoImage} />}
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

/** ▶ FE 2번에 해당하는 부분: 사진·제목·설명 2줄·링크 카드 (공지·분실물·채팅 카드가 같이 씀) */
export function ItemCard({ title, desc, image, icon, badge, meta, onPress }: {
  title: string; desc?: string | null; image?: string | number | null; icon?: keyof typeof Feather.glyphMap;
  badge?: ReactNode; meta?: string | null; onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} onPress={onPress} disabled={!onPress}>
      {image ? (
        <Image source={typeof image === 'number' ? image : { uri: image }} style={s.itemImage} />
      ) : icon ? (
        <View style={s.itemIcon}><Feather name={icon} size={22} color={color.primary} /></View>
      ) : null}
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

/** ▶ FE 12번에 해당하는 부분: 서경 AI 캐릭터 (피그마 홈 시안의 코끼리).
 *  가장자리가 투명하게 흐려진 그림이라 어느 배경 위에서도 이어져 보임. face=true면 질문창용 동그란 얼굴 */
export function Character({ size = 120, face = false }: { size?: number; face?: boolean }) {
  if (face) {
    return <Image accessibilityLabel="서경 AI 캐릭터" source={require('../assets/character-face.png')} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return <Image accessibilityLabel="서경 AI 캐릭터" source={require('../assets/character.png')} style={{ width: size, height: size * (355 / 480) }} />;
}

/** ▶ FE 31번에 해당하는 부분: '답변 작성 중' 점 세 개 움직임 */
export function TypingDots() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 3, duration: 900, useNativeDriver: Platform.OS !== 'web' }));
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
          <Pressable key={label(v)} onPress={() => onChange(v)} style={[s.chip, on && s.chipOn]}>
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
  screen: { padding: 16, gap: 12, backgroundColor: color.bg, flexGrow: 1 },
  title: { fontSize: 17, fontWeight: '700', color: color.ink, marginTop: 8 },
  sub: { fontSize: 13, color: color.inkSub, lineHeight: 19 },
  body: { fontSize: 15, color: color.ink, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: color.line, borderRadius: 14, padding: 14, gap: 6, backgroundColor: color.bg },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  btnPrimary: { backgroundColor: color.primary },
  btnGhost: { backgroundColor: color.primarySoft },
  btnText: { fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  source: { fontSize: 12, color: color.inkSub },
  infoCard: { backgroundColor: color.bg, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: color.line, minWidth: 220, maxWidth: 300 },
  infoImage: { width: '100%', height: 120, borderRadius: 10, backgroundColor: color.surface },
  infoTitle: { fontSize: 13, fontWeight: '700', color: color.ink },
  infoBig: { fontSize: 22, fontWeight: '800', color: color.primary },
  progress: { height: 8, borderRadius: 4, backgroundColor: color.primarySoft, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: color.primary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.line, borderRadius: 16, padding: 12, backgroundColor: color.bg },
  itemImage: { width: 64, height: 64, borderRadius: 12, backgroundColor: color.surface },
  itemIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.primary },
  chip: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: color.surface },
  chipOn: { backgroundColor: color.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: color.ink },
  center: { padding: 32, alignItems: 'center', gap: 12 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: color.bg, borderRadius: 20, padding: 20, gap: 8, width: '100%', maxWidth: 400, alignSelf: 'center' },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
