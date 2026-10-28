// ▶ FE 26번에 해당하는 부분: S-3 장학 신청 내역 (장학금 내역의 '신청 완료' 목록 아래 '신청 내역 자세히 보기'에서 들어옴)
// 서버(GET /scholarship-applications)는 장학금 이름을 안 줘서 장학금 목록(GET /scholarships)에서 찾아 붙임
import { router } from 'expo-router';

import { Badge, ItemCard, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { dotDate } from '../../../lib/format';
import type { Application, Scholarship } from '../../../lib/types';

export default function Applications() {
  const { data, error, loading, reload } = useApi<Application[]>('/scholarship-applications');
  const list = useApi<Scholarship[]>('/scholarships');
  const titleOf = (a: Application) => a.title ?? list.data?.find((s) => s.notice_id === a.notice_id)?.title ?? '장학금';
  return (
    <Screen title="신청 내역">
      <Sub>장학금 안내에서 “신청 완료 체크”를 누른 장학금이에요. 같은 장학금 알림은 다시 보내지 않아요.</Sub>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="신청 완료로 체크한 장학금이 없어요" onRetry={reload}>
        {data?.map((a) => (
          <ItemCard key={a.notice_id} icon="award" title={titleOf(a).replace(/ 안내$/, '')} badge={<Badge label="신청 완료" tone="strong" />}
            meta={`${dotDate(a.applied_at)} 신청 완료`} onPress={() => router.push(`/notices/${a.notice_id}`)} />
        ))}
      </StateView>
    </Screen>
  );
}
