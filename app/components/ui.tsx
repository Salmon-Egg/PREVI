// 여러 화면이 같이 쓰는 부품. 색은 lib/theme.ts.
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { ApiError } from '../lib/api';
import { color } from '../lib/theme';
import type { ChatCard, Verdict } from '../lib/types';

/** 알림창. React Native의 Alert는 웹에서 안 떠서 웹은 브라우저 창으로 */
export function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}

/** 확인/취소 창. 확인을 누르면 onOk */
export function confirmAsk(title: string, message: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onOk();
  } else {
    Alert.alert(title, message, [{ text: '취소', style: 'cancel' }, { text: okLabel, onPress: onOk }]);
  }
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

/** 공지·졸업 요건 등 모든 카드가 같은 모양 (API 명세 챗봇 cards) */
export function InfoCard({ card }: { card: ChatCard }) {
  return (
    <View style={s.infoCard}>
      <Text style={s.infoTitle}>{card.title}</Text>
      {card.lines.map((l, i) => (
        <Text key={i} style={i === 0 ? s.infoBig : s.sub} numberOfLines={2}>{l}</Text>
      ))}
    </View>
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
  infoCard: { backgroundColor: color.bg, borderRadius: 12, padding: 12, gap: 2, borderWidth: 1, borderColor: color.line, minWidth: 180 },
  infoTitle: { fontSize: 13, color: color.inkSub },
  infoBig: { fontSize: 20, fontWeight: '700', color: color.primary },
  center: { padding: 32, alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
