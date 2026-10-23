// T-4 알림 센터: 받은 알림, 누르면 읽음 처리 후 해당 화면으로
import { router, Stack } from 'expo-router';
import { Text } from 'react-native';

import { Card, Screen, StateView, Sub } from '../../components/ui';
import { api, useApi } from '../../lib/api';
import { screenFor } from '../../lib/push';
import { color } from '../../lib/theme';
import type { Notification } from '../../lib/types';

export default function Notifications() {
  const { data, error, loading, reload } = useApi<Notification[]>('/notifications');

  async function open(n: Notification) {
    if (!n.read) api.patch(`/notifications/${n.id}`, { read: true });
    router.push(screenFor(n.type, n.target_id));
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '알림' }} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="받은 알림이 없어요" onRetry={reload}>
        {data?.map((n) => (
          <Card key={n.id} onPress={() => open(n)} style={n.read ? undefined : { backgroundColor: color.primarySoft, borderColor: color.primarySoft }}>
            <Text style={{ fontSize: 15, fontWeight: n.read ? '400' : '700', color: color.ink }}>{n.title}</Text>
            <Sub>{n.sent_at.slice(5, 16).replace('T', ' ')}</Sub>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
