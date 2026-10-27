// ▶ FE 22번에 해당하는 부분: L-3 시간표 (새 시안 '2026학년도 2학기 시간표': 제목 옆 ✎ → L-4 수강 과목 편집)
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';

import { TimetableGrid } from '../../../components/TimetableGrid';
import { Screen, StateView } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { semesterLabel } from '../../../lib/format';
import { color } from '../../../lib/theme';
import type { TimetableEntry } from '../../../lib/types';

export default function Timetable() {
  const { data, error, loading, reload } = useApi<TimetableEntry[]>('/timetable');
  return (
    <Screen title={`${semesterLabel()} 시간표`} scroll={false} gap={0}
      right={(
        <Pressable accessibilityLabel="시간표 편집" hitSlop={10} onPress={() => router.push('/study/timetable-edit')}>
          <Feather name="edit-2" size={20} color={color.primaryLight} />
        </Pressable>
      )}>
      <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
        {/* 판 가장자리까지 표가 닿게 판 안쪽 여백을 되돌림 */}
        <ScrollView style={{ margin: -18 }}>
          <TimetableGrid entries={data ?? []} />
        </ScrollView>
      </StateView>
    </Screen>
  );
}
