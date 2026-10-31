// ▶ FE 9번에 해당하는 부분: M-3 마이페이지 (새 시안) — 프로필(졸업 진행 막대) · 알림 설정 · 화면 설정 · 계정 관리 · 서비스 정보
// 알림: 알림 받기 / 마감 임박 및 브리핑 알림 시각 / 방해 금지 시간(notify.quiet) / AI 비서 설정(FE 11번)
// 화면: 글자 크기 (이 기기에만 저장, lib/display.ts). 다크 모드는 색이 어색해서 뺌. 계정: 비밀번호 변경 / 로그아웃 / 계정 삭제(경고 두 번)
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Input, Label, LegalSheet, OptionSheet, Select, Sheet } from '../../../components/form';
import { Pressable, Text } from '../../../components/Text';
import { Button, confirmAsk, Screen, showAlert, StateView } from '../../../components/ui';
import { api, attempt, ApiError, useApi, useSubmit } from '../../../lib/api';
import { changePassword, PASSWORD_MIN } from '../../../lib/auth';
import { HALF_HOURS, QUIET_CUSTOM } from '../../../lib/constants';
import { setDisplay, useDisplay } from '../../../lib/display';
import { logout } from '../../../lib/session';
import { color, gradient, gradientBg } from '../../../lib/theme';
import { STATUS_KO, type Graduation, type Me } from '../../../lib/types';

const timeLabel = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${t.slice(3)}`;
};
const quietLabel = (q: string) => (q === QUIET_CUSTOM ? q : q ? q.replace('-', ' - ') : '끔');

export default function MyPage() {
  const { data: me, error, loading, reload, setData } = useApi<Me>('/me');
  const grad = useApi<Graduation>('/graduation');
  const display = useDisplay();
  const [picker, setPicker] = useState<null | 'time' | 'quiet' | 'quietCustom' | 'password' | 'terms' | 'privacy'>(null);
  const allOn = !!me && me.notify.notice && me.notify.deadline && me.notify.calendar && me.notify.chat;

  async function setNotify(notify: Partial<Me['notify']>) {
    await attempt(async () => setData(await api.put<Me>('/me', { notify })));
  }

  // 계정 삭제는 되돌릴 수 없어서 경고를 두 번 띄움 → 두 번째에서도 '삭제'를 눌러야 지움 (지운 뒤 로그인 화면으로)
  function deleteAccount() {
    confirmAsk('계정 삭제 및 탈퇴', '성적을 포함한 모든 정보와 AI 브리핑 기록이 지워져요.', '계속', () => {
      confirmAsk('정말 삭제하시겠습니까?', '삭제하면 원래대로 되돌릴 수 없습니다.\n학적·성적·시간표·할 일·채팅 기록과 분실물 글·사진이 모두 지워져요.', '삭제', async () => {
        try {
          await api.del('/me');
          await logout();
        } catch (e) {
          showAlert('삭제하지 못했어요', (e as ApiError).message);
        }
      });
    });
  }

  const g = grad.data;
  return (
    <Screen title="마이페이지" gap={4}>
      <StateView loading={loading} error={error} empty={!me} onRetry={reload}>
        {me && (
          <>
            <View style={st.profile}>
              <View style={st.row}>
                <View style={st.avatar}><Text style={st.avatarText}>{(me.nickname || '학')[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{me.nickname || '학생'}</Text>
                  <Text style={st.dept}>{me.department} {me.grade}학년 {STATUS_KO[me.status]}</Text>
                </View>
                <Pressable accessibilityLabel="학적 정보 변경" hitSlop={8} onPress={() => router.push('/me/status')}>
                  <Feather name="edit-2" size={18} color={color.primaryLight} />
                </Pressable>
              </View>
              {g && g.earned_total !== null && (
                <View style={st.bar}>
                  <View style={[st.barFill, { width: `${Math.min(100, (g.earned_total / g.required_total) * 100)}%` }]} />
                  <Text style={st.barText}>졸업까지 {g.earned_total} / {g.required_total} 학점</Text>
                </View>
              )}
            </View>

            <Section title="알림 설정">
              <Item title="알림 받기" sub="끄면 모든 알림이 오지 않아요"
                right={<Switch value={allOn} trackColor={{ true: color.primaryLight, false: '#CBD5CF' }} thumbColor="#fff"
                  onValueChange={(v) => setNotify({ notice: v, deadline: v, calendar: v, chat: v })} />} />
              <Item title="마감 임박 및 브리핑 알림" value={timeLabel(me.notify.time)} onPress={() => setPicker('time')} />
              <Item title="방해 금지 시간" value={quietLabel(me.notify.quiet ?? '')} onPress={() => setPicker('quiet')} />
              <Item title="AI 비서 설정" sub="비서가 볼 정보, 알림 종류" onPress={() => router.push('/me/assistant')} />
            </Section>

            <Section title="화면 설정">
              <Item title="글자 크기" right={(
                <View style={st.sizeTrack}>
                  {(['표준', '크게'] as const).map((v) => {
                    const on = (v === '크게') === display.large;
                    return (
                      <Pressable key={v} onPress={() => setDisplay({ large: v === '크게' })} style={[st.sizeBtn, on && st.sizeOn]}>
                        <Text style={[st.sizeText, on && { color: color.title, fontWeight: '800' }]}>{v}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )} />
            </Section>

            <Section title="계정 관리">
              <Item title="비밀번호 변경" onPress={() => setPicker('password')} />
              <Item title="로그아웃" onPress={logout} />
              <Item title="계정 삭제 및 탈퇴" sub="학적·성적·시간표·채팅·분실물 글과 사진을 포함한 내 정보가 모두 삭제됩니다" danger onPress={deleteAccount} />
            </Section>

            <Section title="서비스 정보">
              <Item title="고객센터" sub="관리자에게 문의하고 답변 확인" onPress={() => router.push('/me/support')} />
              <Item title="이용약관" onPress={() => setPicker('terms')} />
              <Item title="개인정보 처리방침" onPress={() => setPicker('privacy')} />
              <Item title="현재 앱 버전" right={<Text style={st.value}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>} />
            </Section>

            {picker === 'time' && (
              <TimeSheet value={me.notify.time} onClose={() => setPicker(null)} onSave={(time) => setNotify({ time })} />
            )}
            {/* '직접 입력'을 고르면 목록 창이 닫히면서 시각 고르는 창이 열림 (닫기가 그 창을 닫지 않게 'quiet'일 때만 닫음) */}
            <OptionSheet visible={picker === 'quiet'} onClose={() => setPicker((p) => (p === 'quiet' ? null : p))} title="방해 금지 시간"
              value={me.notify.quiet ?? ''} items={['', QUIET_CUSTOM]} label={quietLabel}
              onChange={(quiet) => (quiet === QUIET_CUSTOM ? setPicker('quietCustom') : setNotify({ quiet }))} />
            {picker === 'quietCustom' && (
              <QuietSheet value={me.notify.quiet ?? ''} onClose={() => setPicker(null)} onSave={(quiet) => setNotify({ quiet })} />
            )}
          </>
        )}
      </StateView>
      <PasswordSheet visible={picker === 'password'} onClose={() => setPicker(null)} />
      <LegalSheet doc={picker === 'terms' || picker === 'privacy' ? picker : null} onClose={() => setPicker(null)} />
    </Screen>
  );
}

/** 마감 임박 및 브리핑 알림 시각 직접 입력 */
function TimeSheet({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (time: string) => void }) {
  const [time, setTime] = useState(value);
  return (
    <Sheet visible onClose={onClose} title="마감 임박 및 브리핑 알림 직접 입력" sub="이 시각부터 알림을 보내요">
      <Label>시각</Label>
      <Select value={time} items={HALF_HOURS} label={timeLabel} onChange={setTime} title="시각" />
      <View style={{ height: 4 }} />
      <Button label="저장하기" onPress={() => { onSave(time); onClose(); }} />
    </Sheet>
  );
}

/** 방해 금지 시간 직접 입력: 시작·끝 시각 (밤을 넘겨도 됨, 예 23:30 - 06:30) */
function QuietSheet({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (quiet: string) => void }) {
  const [from, to] = value ? value.split('-') : ['22:00', '07:00'];
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  return (
    <Sheet visible onClose={onClose} title="방해 금지 시간 직접 입력" sub="이 시간에는 알림을 보내지 않아요">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}><Label>시작</Label><Select value={start} items={HALF_HOURS} onChange={setStart} title="시작" /></View>
        <View style={{ flex: 1, gap: 6 }}><Label>끝</Label><Select value={end} items={HALF_HOURS} onChange={setEnd} title="끝" /></View>
      </View>
      {start === end && <Text style={st.error}>시작과 끝이 같아요.</Text>}
      <View style={{ height: 4 }} />
      <Button label="저장하기" disabled={start === end} onPress={() => { onSave(`${start}-${end}`); onClose(); }} />
    </Sheet>
  );
}

/** 비밀번호 변경: 지금 비밀번호 확인 → 새 비밀번호 두 번 */
function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState('');
  const { busy, run } = useSubmit();
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setMsg('');
  };
  const close = () => {
    setForm({ current: '', next: '', again: '' });
    setMsg('');
    onClose();
  };
  const save = () => run(async () => {
    if (form.next.length < PASSWORD_MIN) return setMsg(`새 비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`);
    if (form.next !== form.again) return setMsg('새 비밀번호가 서로 달라요.');
    try {
      await changePassword(form.current, form.next);
      close();
      showAlert('비밀번호를 바꿨어요', '다음 로그인부터 새 비밀번호를 쓰세요.');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : '서버에 연결할 수 없어요.');
    }
  });
  return (
    <Sheet visible={visible} onClose={close} title="비밀번호 변경">
      <Label>지금 비밀번호</Label>
      <Input value={form.current} onChangeText={set('current')} secureTextEntry placeholder="지금 비밀번호" />
      <Label>새 비밀번호</Label>
      <Input value={form.next} onChangeText={set('next')} secureTextEntry placeholder={`${PASSWORD_MIN}자 이상`} />
      <Input value={form.again} onChangeText={set('again')} secureTextEntry placeholder="새 비밀번호 한 번 더" />
      {!!msg && <Text style={st.error}>{msg}</Text>}
      <View style={{ height: 4 }} />
      <Button label="변경하기" disabled={busy || !form.current || !form.next} onPress={save} />
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 한 줄 설정. value가 있으면 오른쪽에 'value ›', right가 있으면 그것(스위치 등) */
function Item({ title, sub, value, right, danger, onPress }: {
  title: string; sub?: string; value?: string; right?: ReactNode; danger?: boolean; onPress?: () => void;
}) {
  return (
    // onPress가 없는 줄은 안에 스위치·버튼이 들어가므로 버튼 역할을 주지 않음
    <Pressable accessibilityRole={onPress ? 'button' : undefined} style={st.item} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[st.itemTitle, danger && { color: color.red }]}>{title}</Text>
        {sub && <Text style={st.itemSub}>{sub}</Text>}
      </View>
      {right ?? (value !== undefined
        ? <Text style={st.value}>{value} ›</Text>
        : onPress ? <Feather name="chevron-right" size={20} color={color.ink} /> : null)}
    </Pressable>
  );
}

const st = StyleSheet.create({
  profile: { backgroundColor: 'rgba(233,246,238,0.9)', borderWidth: 1, borderColor: color.field, borderRadius: 22, padding: 16, gap: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, ...gradientBg(gradient.primary, color.primary), alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: color.ink },
  dept: { fontSize: 13, color: color.inkSub, marginTop: 4 },
  bar: { height: 22, borderRadius: 11, backgroundColor: '#5E7268', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, ...gradientBg(gradient.primary, color.primary), borderRadius: 11 },
  barText: { textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: '800' },
  section: { borderTopWidth: 1, borderColor: color.field, paddingTop: 14, paddingBottom: 6, gap: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: color.title, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: color.ink },
  itemSub: { fontSize: 12, color: color.inkSub, marginTop: 2 },
  value: { fontSize: 14, color: color.inkSub },
  sizeTrack: { flexDirection: 'row', backgroundColor: '#E5ECE8', borderRadius: 14, padding: 3 },
  sizeBtn: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 11 },
  sizeOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sizeText: { fontSize: 14, color: color.inkSub, fontWeight: '600' },
  error: { color: color.red, fontSize: 13, fontWeight: '700' },
});
