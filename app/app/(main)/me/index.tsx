// ▶ FE 9번에 해당하는 부분: M-3 마이페이지
// 시안 14 마이페이지: 프로필(졸업 진행 막대) · 알림 설정 · 계정 관리 · 서비스 정보
// 시안의 '비밀번호 변경'은 이메일 인증번호 로그인이라 비밀번호가 없어서 뺌.
// '방해 금지 시간', '다크 모드', '글자 크기'는 서버·앱에 아직 기능이 없어서 뺌.
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Select } from '../../../components/form';
import { confirmAsk, Screen, showAlert, StateView } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { logout } from '../../../lib/session';
import { color } from '../../../lib/theme';
import { STATUS_KO, type Graduation, type Me } from '../../../lib/types';

const TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];
const timeLabel = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${t.slice(3)}`;
};

export default function MyPage() {
  const { data: me, error, loading, reload, setData } = useApi<Me>('/me');
  const grad = useApi<Graduation>('/graduation');
  const allOn = !!me && me.notify.notice && me.notify.deadline && me.notify.calendar && me.notify.chat;

  async function setNotify(notify: Partial<Me['notify']>) {
    setData(await api.put<Me>('/me', { notify }));
  }

  function deleteAccount() {
    confirmAsk('계정 삭제 및 탈퇴', '성적을 포함한 모든 정보와 AI 브리핑 기록이 지워지고 되돌릴 수 없어요.', '삭제', async () => {
      await api.del('/me');
      await logout();
    });
  }

  const g = grad.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: '마이페이지' }} />
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
                <Pressable accessibilityLabel="학적 정보 변경" onPress={() => router.push('/me/status')} style={st.pencil}>
                  <Feather name="edit-2" size={16} color={color.ink} />
                </Pressable>
              </View>
              {g && (
                <View style={st.bar}>
                  <View style={[st.barFill, { width: `${Math.min(100, (g.earned_total / g.required_total) * 100)}%` }]} />
                  <Text style={st.barText}>졸업까지 {g.earned_total} / {g.required_total} 학점</Text>
                </View>
              )}
            </View>

            <Section title="알림 설정">
              <Item title="알림 받기" sub="끄면 모든 알림이 오지 않아요"
                right={<Switch value={allOn} trackColor={{ true: color.primary }}
                  onValueChange={(v) => setNotify({ notice: v, deadline: v, calendar: v, chat: v })} />} />
              <View style={st.item}>
                <Text style={st.itemTitle}>마감 임박 및 브리핑 알림</Text>
                <View style={{ width: 130 }}>
                  <Select value={me.notify.time} items={TIMES} label={timeLabel} onChange={(time) => setNotify({ time })} />
                </View>
              </View>
              <Item title="알림 종류 자세히" onPress={() => router.push('/me/assistant')} />
            </Section>

            <Section title="계정 관리">
              <Item title="로그아웃" onPress={logout} />
              <Item title="계정 삭제 및 탈퇴" sub="모든 개인 설정 및 AI 브리핑 기록이 삭제됩니다" danger onPress={deleteAccount} />
            </Section>

            <Section title="서비스 정보">
              <Item title="이용약관 및 개인정보 처리방침"
                onPress={() => showAlert('개인정보 처리방침', '수집 항목: 학과, 부전공, 학년·학기, 학적 상태, 입학년도, 직접 입력한 성적, 시간표, 채팅 내용\n이용 목적: 나에게 해당하는 공지·장학금·졸업 요건 안내와 알림\n보관: 계정을 삭제하면 모든 정보가 함께 지워져요.')} />
              <Item title="현재 앱 버전" right={<Text style={st.version}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>} />
            </Section>
          </>
        )}
      </StateView>
    </Screen>
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

function Item({ title, sub, right, danger, onPress }: { title: string; sub?: string; right?: ReactNode; danger?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={st.item} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[st.itemTitle, danger && { color: color.alert }]}>{title}</Text>
        {sub && <Text style={[st.itemSub, danger && { color: color.alert }]}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={20} color={color.inkSub} /> : null)}
    </Pressable>
  );
}

const st = StyleSheet.create({
  profile: { backgroundColor: color.primarySoft, borderRadius: 20, padding: 18, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: color.ink },
  dept: { fontSize: 13, fontWeight: '700', color: color.primary, marginTop: 2 },
  pencil: { backgroundColor: '#fff', borderRadius: 16, padding: 8 },
  bar: { height: 26, borderRadius: 13, backgroundColor: '#CFE3D7', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.primary, borderRadius: 13 },
  barText: { textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: '800' },
  section: { borderTopWidth: 1, borderColor: color.line, paddingTop: 14, gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: color.primary, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: color.ink, flex: 1 },
  itemSub: { fontSize: 12, color: color.inkSub, marginTop: 2 },
  version: { fontSize: 14, color: color.inkSub },
});
