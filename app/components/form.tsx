// ▶ FE 2번에 해당하는 부분: 입력 공통 부품
// 입력 부품 (시안 07, 11, 15, 16): 라벨, 드롭다운, 버튼 묶음, 아래에서 뜨는 창, 확인 창
import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { color } from '../lib/theme';

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return <Text style={f.label}>{children}{required ? ' *' : ''}</Text>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={color.inkSub} {...props} style={[f.box, f.input, props.style]} />;
}

/** 누르면 목록이 뜨는 드롭다운 */
export function Select<T extends string | number>({ value, items, label, onChange, highlight }: {
  value: T; items: T[]; label?: (v: T) => string; onChange: (v: T) => void; highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const show = label ?? String;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[f.box, f.select, highlight && f.selected]}>
        <Text style={[f.input, highlight && { color: color.primary }]}>{show(value)}</Text>
        <Feather name="chevron-down" size={18} color={color.inkSub} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <ScrollView style={{ maxHeight: 360 }}>
          {items.map((v) => (
            <Pressable key={String(v)} style={f.option} onPress={() => { onChange(v); setOpen(false); }}>
              <Text style={[f.optionText, v === value && { color: color.primary, fontWeight: '800' }]}>{show(v)}</Text>
              {v === value && <Feather name="check" size={18} color={color.primary} />}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

/** 나란히 놓인 선택 버튼 (재학/휴학/복학, 전공/교양) */
export function Segmented<T extends string>({ value, items, label, onChange }: {
  value: T; items: T[]; label?: (v: T) => string; onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[f.box, f.seg, v === value && f.selected]}>
          <Text style={[f.segText, v === value && { color: color.primary, fontWeight: '800' }]}>{(label ?? String)(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 화면 위에 뜨는 흰 카드 (뒤는 어둡게). 시안 04~08의 팝업 */
export function Sheet({ visible, onClose, title, sub, children }: {
  visible: boolean; onClose: () => void; title?: string; sub?: string; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={f.dim}>
        {/* 어두운 바탕은 카드와 형제로 둠: 카드 안을 누른 게 바탕까지 전달돼 창이 닫히지 않게 */}
        <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={f.sheet}>
          {title && (
            <View style={f.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={f.sheetTitle}>{title}</Text>
                {sub && <Text style={f.sheetSub}>{sub}</Text>}
              </View>
              <Pressable accessibilityLabel="닫기" onPress={onClose}><Feather name="x" size={22} color={color.inkSub} /></Pressable>
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** 확인 창 (시안 08, 16). tone='danger'면 주황 버튼 하나 */
export function Confirm({ visible, icon = '!', title, children, okLabel, onOk, onCancel, tone = 'primary' }: {
  visible: boolean; icon?: string; title: string; children?: ReactNode; okLabel: string;
  onOk: () => void; onCancel?: () => void; tone?: 'primary' | 'danger';
}) {
  const danger = tone === 'danger';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel ?? onOk}>
      <View style={f.dim}>
        <View style={[f.sheet, { alignItems: 'center', gap: 14 }]}>
          <View style={[f.iconCircle, { backgroundColor: danger ? color.alert : '#F6C34A' }]}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>{icon}</Text>
          </View>
          <Text style={f.confirmTitle}>{title}</Text>
          {children}
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
            {onCancel && (
              <Pressable style={[f.btn, { flex: 1, backgroundColor: color.surface }]} onPress={onCancel}>
                <Text style={[f.btnText, { color: color.inkSub }]}>취소</Text>
              </Pressable>
            )}
            <Pressable style={[f.btn, { flex: 2, backgroundColor: danger ? color.alert : color.primary }]} onPress={onOk}>
              <Text style={f.btnText}>{okLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const f = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: color.ink, marginTop: 6 },
  box: { backgroundColor: color.surface, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  input: { fontSize: 15, color: color.ink, paddingHorizontal: 14, paddingVertical: 12, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  selected: { borderColor: color.primary, backgroundColor: color.primarySoft },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  segText: { fontSize: 15, color: color.inkSub, fontWeight: '600' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: color.line },
  optionText: { fontSize: 16, color: color.ink },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 10, width: '100%', maxWidth: 460, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: color.ink },
  sheetSub: { fontSize: 13, color: color.inkSub, marginTop: 4 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 19, fontWeight: '800', color: color.ink, textAlign: 'center' },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
