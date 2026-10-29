// ▶ FE 17번에 해당하는 부분: T-2 할 일 상세 (근거, 마감, 신청 링크, 완료 체크, 채팅으로 묻기 → FE 32번 맥락 넘김)
// 공지 안내와 같은 흰 시트: 머리(📋 할 일 ✕) → 할 일 칸에 제목 → ✨ 왜 나에게 해당하나요?(AI 근거) → 유의사항,
// 창 아래 [📢 공지 자세히 보기 | ☑️ 완료했어요]. 신청 페이지·프리비에게 묻기는 칸 안의 작은 버튼
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { CloseButton } from '../../../components/form';
import { sheet as st } from '../../../components/sheet';
import { Text } from '../../../components/Text';
import { Button, DdayBadge, goBack, openLink, Row, Screen, showAlert, StateView } from '../../../components/ui';
import { api, ApiError, useApi } from '../../../lib/api';
import { askChat } from '../../../lib/chatStore';
import { TODO_TYPE_KO, type TodoDetail } from '../../../lib/types';

export default function TodoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, loading, reload, setData } = useApi<TodoDetail>(`/todos/${id}`);
  const noticeId = t?.source?.kind === 'notice' ? t.source.id : null;

  /** '완료했어요': 저장하자마자 들어오기 전 화면(할 일 목록·홈)으로 돌아감 → 그 화면이 다시 불러와서 이 일이 바로 빠짐
   *  '완료 취소'(완료 기록에서 열었을 때): 이 화면에 남아서 되돌린 상태를 보여 줌 */
  async function toggle() {
    if (!t) return;
    try {
      const next = await api.patch<TodoDetail>(`/todos/${t.id}`, { done: !t.done });
      if (!next.done) return setData(next);
      if (router.canGoBack()) router.back();
      else router.replace('/todos'); // 알림 등으로 이 화면부터 열었으면 할 일 목록으로
    } catch (e) {
      showAlert('저장하지 못했어요', (e as ApiError).message);
    }
  }

  return (
    <Screen title="할 일" scroll={false} gap={0}>
      <StateView loading={loading} error={error} empty={!t} onRetry={reload}>
        {t && (
          <View style={st.sheet}>
            <View style={st.head}>
              <Text style={st.headIcon}>📋</Text>
              <Text style={st.headTitle}>할 일</Text>
              <CloseButton onPress={goBack} />
            </View>
            <ScrollView contentContainerStyle={st.body}>
              <View style={st.article}>
                <Text style={st.title}>{t.type !== 'deadline' ? `[${TODO_TYPE_KO[t.type]}] ` : ''}{t.title}</Text>
                <Row><DdayBadge dDay={t.d_day} />{t.due_date && <Text style={st.meta}>마감 {t.due_date}</Text>}</Row>
                <View style={st.rule} />
                <View style={st.ai}>
                  <Text style={st.aiHead}>✨ 왜 나에게 해당하나요?</Text>
                  <Text style={st.aiLine}>{t.reason ?? '비서가 정리한 근거가 아직 없어요.'}</Text>
                </View>
                {t.link && <Button compact kind="ghost" label="🔗 신청 페이지 열기" onPress={() => openLink(t.link)} />}
                <Button compact kind="ghost" label="💬 프리비에게 묻기"
                  onPress={() => askChat(`${t.title} 어떻게 해?`, { kind: 'todo', id: t.id })} />
                <View style={st.caution}>
                  <Text style={st.cautionHead}>⚠️ AI 근거 유의사항</Text>
                  <Text style={st.cautionText}>근거는 내 학적·성적과 공지를 바탕으로 비서가 정리했어요.{'\n'}실제 신청 전 학교 공지를 반드시 확인해 주세요.</Text>
                </View>
              </View>
            </ScrollView>
            <View style={st.bottom}>
              {noticeId && (
                <View style={{ flex: 1 }}>
                  <Button compact kind="ghost" label="📢 공지 자세히 보기" onPress={() => router.push(`/notices/${noticeId}`)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Button compact kind={t.done ? 'ghost' : undefined} label={t.done ? '↩️ 완료 취소' : '☑️ 완료했어요'} onPress={toggle} />
              </View>
            </View>
          </View>
        )}
      </StateView>
    </Screen>
  );
}
