// ▶ FE 26번에 해당하는 부분: S-3 장학 신청 내역 (장학금 화면의 '신청 완료' 칩·'신청 내역 전체 보기'에서 들어옴)
import { router } from 'expo-router';

import { Badge, ItemCard, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { dotDate } from '../../../lib/format';
import type { Application } from '../../../lib/types';

export default function Applications() {
  const { data, error, loading, reload } = useApi<Application[]>('/scholarship-applications');
  return (
    <Screen title="신청 내역">
      <Sub>공지 상세에서 “신청 완료 체크”를 누른 장학금이에요. 같은 장학금 알림은 다시 보내지 않아요.</Sub>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="신청 완료로 체크한 장학금이 없어요" onRetry={reload}>
        {data?.map((a) => (
          <ItemCard key={a.notice_id} icon="award" title={a.title} badge={<Badge label="신청 완료" tone="strong" />}
            meta={`${dotDate(a.applied_at)} 신청 완료`} onPress={() => router.push(`/notices/${a.notice_id}`)} />
        ))}
      </StateView>
    </Screen>
  );
}
