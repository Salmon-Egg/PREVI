// ▶ FE 19번에 해당하는 부분: T-4 알림 센터 — 푸시로 받은 알림 목록, 읽음 처리, 누르면 대상 화면
import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';

import { Pressable, Text } from '../../components/Text';
import { Card, Row, Screen, StateView, Sub } from '../../components/ui';
import { api, useApi } from '../../lib/api';
import { openNotification } from '../../lib/push';
import { color } from '../../lib/theme';
import type { Notification, NotifyType } from '../../lib/types';

const ICON: Record<NotifyType, keyof typeof Feather.glyphMap> = { notice: 'file-text', deadline: 'clock', calendar: 'calendar', chat: 'message-circle' };
const TYPE_KO: Record<NotifyType, string> = { notice: '새 공지', deadline: '마감', calendar: '학사일정', chat: '답변 도착' };

export default function Notifications() {
  const { data, error, loading, reload, setData } = useApi<Notification[]>('/notifications');
  const unread = data?.filter((n) => !n.read) ?? [];

  async function open(n: Notification) {
    if (!n.read) {
      api.patch(`/notifications/${n.id}`, { read: true });
      setData((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    }
    openNotification(n.type, n.target_id);
  }

  // 모두 읽음: 알림마다 PATCH (일괄 API가 없어서)
  async function readAll() {
    await Promise.all(unread.map((n) => api.patch(`/notifications/${n.id}`, { read: true })));
    setData((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
  }

  return (
    <Screen title="알림" right={unread.length ? <Pressable onPress={readAll} hitSlop={8}><Text style={{ color: color.primary, fontWeight: '800' }}>모두 읽음</Text></Pressable> : null}>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="받은 알림이 없어요" onRetry={reload}>
        {data?.map((n) => (
          <Card key={n.id} onPress={() => open(n)} style={n.read ? undefined : { backgroundColor: color.primarySoft, borderColor: color.primarySoft }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={ICON[n.type]} size={18} color={color.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Sub>{TYPE_KO[n.type]} · {n.sent_at.slice(5, 16).replace('T', ' ')}</Sub>
                <Text style={{ fontSize: 15, fontWeight: n.read ? '400' : '700', color: color.ink }}>{n.title}</Text>
              </View>
              {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.primaryLight, marginTop: 6 }} />}
            </Row>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
