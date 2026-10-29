// ▶ FE 2번에 해당하는 부분: 입력 공통 부품
// 라벨, 입력칸, 드롭다운, 버튼 묶음, 가운데 뜨는 창(Sheet), 확인 창 (2026-10-27 새 시안: 흰 칸 + 연한 초록 테두리, 고른 버튼은 초록 그라데이션)
import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type TextInputProps } from 'react-native';

import { PRIVACY } from '../lib/constants';
import { color, gradient, gradientBg } from '../lib/theme';
import { Text, TextInput } from './Text';
import { Button } from './ui';

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return <Text style={f.label}>{children}{required ? ' *' : ''}</Text>;
}

/** error=true면 빨간 테두리 (로그인 오류) */
export function Input({ error, ...props }: TextInputProps & { error?: boolean }) {
  return <TextInput placeholderTextColor="#9AA6A0" {...props} style={[f.box, f.input, error && f.error, props.style]} />;
}

/** 누르면 목록이 뜨는 드롭다운 */
export function Select<T extends string | number>({ value, items, label, onChange, highlight, title }: {
  value: T; items: T[]; label?: (v: T) => string; onChange: (v: T) => void; highlight?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const show = label ?? String;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[f.box, f.select, highlight && f.selected]}>
        <Text style={f.input} numberOfLines={1}>{show(value)}</Text>
        <Feather name="chevron-down" size={20} color={color.title} />
      </Pressable>
      <OptionSheet visible={open} onClose={() => setOpen(false)} title={title} value={value} items={items} label={show} onChange={onChange} />
    </>
  );
}

/** 목록에서 하나 고르는 창 (드롭다운, 마이페이지의 알림 시각·방해 금지 시간) */
export function OptionSheet<T extends string | number>({ visible, onClose, title, value, items, label, onChange }: {
  visible: boolean; onClose: () => void; title?: string; value: T; items: T[]; label: (v: T) => string; onChange: (v: T) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={{ maxHeight: 360 }}>
        {items.map((v) => (
          <Pressable key={String(v)} style={f.option} onPress={() => { onChange(v); onClose(); }}>
            <Text style={[f.optionText, v === value && { color: color.primary, fontWeight: '800' }]}>{label(v)}</Text>
            {v === value && <Feather name="check" size={18} color={color.primary} />}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** 나란히 놓인 선택 버튼 (재학/휴학/복학, 전공/교양). 고른 것은 초록 그라데이션 */
export function Segmented<T extends string>({ value, items, label, onChange }: {
  value: T; items: T[]; label?: (v: T) => string; onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((v) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onChange(v)} style={[f.seg, on ? [gradientBg(gradient.primary, color.primary), f.segOn] : f.segOff]}>
            <Text style={[f.segText, { color: on ? '#fff' : color.title }]}>{(label ?? String)(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 화면 위에 뜨는 흰 창 (뒤는 어둡게). 제목은 초록, 오른쪽 위 ⓧ로 닫기 */
export function Sheet({ visible, onClose, title, sub, children }: {
  visible: boolean; onClose: () => void; title?: string; sub?: string; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={f.dim}>
        {/* 어두운 바탕은 창과 형제로 둠: 창 안을 누른 게 바탕까지 전달돼 창이 닫히지 않게 */}
        <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={f.sheet}>
          {title && (
            <View style={f.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={f.sheetTitle}>{title}</Text>
                {sub && <Text style={f.sheetSub}>{sub}</Text>}
              </View>
              <CloseButton onPress={onClose} />
            </View>
          )}
          {/* 내용이 창 높이를 넘으면 스크롤: 작은 휴대폰에서 맨 아래 '저장하기'가 잘려 안 보였음 */}
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** 연한 초록 동그라미 안의 ✕ (창·장학금 안내 닫기) */
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="닫기" hitSlop={8} onPress={onPress} style={f.close}>
      <Feather name="x" size={20} color={color.title} />
    </Pressable>
  );
}

/** 확인 창 (학적 변경 확인, 수강 과목 등록 불가). onCancel이 있으면 [취소 | 확인] */
export function Confirm({ visible, title, children, okLabel, onOk, onCancel }: {
  visible: boolean; title: string; children?: ReactNode; okLabel: string; onOk: () => void; onCancel?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel ?? onOk}>
      <View style={f.dim}>
        <View style={[f.sheet, { alignItems: 'center', gap: 14, paddingVertical: 26 }]}>
          <Text style={f.confirmTitle}>{title}</Text>
          {children}
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
            {onCancel && <View style={{ flex: 1 }}><Button label="취소" kind="ghost" onPress={onCancel} /></View>}
            <View style={{ flex: onCancel ? 1.5 : 1 }}><Button label={okLabel} onPress={onOk} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 개인정보 수집·이용 안내: 항목 제목 + 한 줄에 하나씩 (로그인 아래 문구, 마이페이지 이용약관) */
export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="개인정보 수집·이용 안내">
      {PRIVACY.map((sec) => (
        <View key={sec.title} style={f.privacy}>
          <Text style={f.privacyTitle}>{sec.title}</Text>
          {sec.lines.map((l) => <Text key={l} style={f.privacyLine}>· {l}</Text>)}
        </View>
      ))}
      <View style={{ height: 6 }} />
      <Button label="확인" onPress={onClose} />
    </Sheet>
  );
}

export const f = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: color.title, marginTop: 6 },
  box: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: color.field },
  input: { flex: 1, fontSize: 15, color: color.ink, paddingHorizontal: 14, paddingVertical: 13, fontWeight: '600' },
  error: { borderColor: color.red },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  selected: { borderColor: color.primaryLight },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
  segOn: { borderWidth: 1.5, borderColor: 'transparent' },
  segOff: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#B9D9C6' },
  segText: { fontSize: 15, fontWeight: '800' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: color.line },
  optionText: { fontSize: 16, color: color.ink },
  dim: { flex: 1, backgroundColor: 'rgba(38, 64, 52, 0.45)', justifyContent: 'center', padding: 18 },
  sheet: { backgroundColor: '#fff', borderRadius: 26, padding: 20, gap: 10, width: '100%', maxWidth: 460, maxHeight: '92%', alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: color.title },
  sheetSub: { fontSize: 13, color: color.inkSub, marginTop: 4 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E3F2EA', alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: color.ink, textAlign: 'center' },
  privacy: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderColor: color.line },
  privacyTitle: { fontSize: 14, fontWeight: '800', color: color.title },
  privacyLine: { fontSize: 14, color: color.ink, lineHeight: 21 },
});
