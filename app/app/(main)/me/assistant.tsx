// ▶ FE 11번에 해당하는 부분: M-5 AI 비서 설정 — 비서가 볼 정보, 알림 종류별 켜기·끄기
// (알림 받을 시각은 마이페이지 '마감 임박 및 브리핑 알림'과 겹쳐서 여기서는 뺌)

import { Switch, View } from 'react-native';

import { Body, Card, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { api, attempt, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { DEFAULT_SCOPE, type AssistantScope, type Me } from '../../../lib/types';

// 비서가 볼 정보 (assistant_scope). 끄면 서버가 판정·브리핑·챗봇 답변에 그 정보를 쓰지 않음 → API 명세 추가 필요(조장 확인)
const SCOPES: { key: keyof AssistantScope; label: string; desc: string }[] = [
  { key: 'status', label: '학적 정보', desc: '학과·학년·학적 상태로 나에게 해당하는 공지를 골라요' },
  { key: 'grades', label: '성적', desc: '졸업 학점 계산, 평점 조건이 있는 장학금 판정에 써요' },
  { key: 'timetable', label: '시간표', desc: '수강 점검(시간 중복·학점 상한)과 일정 안내에 써요' },
  { key: 'chat_history', label: '이전 대화', desc: '같은 대화 안에서 앞의 질문을 이어서 이해해요' },
];

const KINDS: { key: keyof Omit<Me['notify'], 'time' | 'quiet'>; label: string; desc: string }[] = [
  { key: 'notice', label: '나에게 해당하는 새 공지', desc: '수집한 공지가 내 학년·학적·조건에 맞을 때' },
  { key: 'deadline', label: '마감 알림', desc: '할 일 마감 전날·당일' },
  { key: 'calendar', label: '학사일정', desc: '일정 3일 전·당일' },
  { key: 'chat', label: '답변 도착', desc: '질문하고 앱을 나갔을 때' },
];

export default function AssistantSettings() {
  const { data: me, error, loading, reload, setData } = useApi<Me>('/me');
  const scope = { ...DEFAULT_SCOPE, ...me?.assistant_scope };

  async function update(notify: Partial<Me['notify']>) {
    await attempt(async () => setData(await api.put<Me>('/me', { notify })));
  }

  async function updateScope(patch: Partial<AssistantScope>) {
    await attempt(async () => setData(await api.put<Me>('/me', { assistant_scope: { ...scope, ...patch } })));
  }

  return (
    <Screen title="AI 비서 설정">
      <StateView loading={loading} error={error} empty={!me} onRetry={reload}>
        {me && (
          <>
            <Sub>비서는 내 학적·성적·시간표와 학교 공지를 대조해서 챙길 일을 찾아요. 정보는 학교 밖 AI 회사로 보내지 않아요.</Sub>

            <Title>비서가 볼 정보</Title>
            {SCOPES.map((k) => (
              <Card key={k.key}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}><Body>{k.label}</Body><Sub>{k.desc}</Sub></View>
                  <Switch value={scope[k.key]} onValueChange={(v) => updateScope({ [k.key]: v })} trackColor={{ true: color.primaryLight }} thumbColor="#fff" />
                </Row>
              </Card>
            ))}
            {!scope.grades && <Sub style={{ color: color.warn }}>성적을 끄면 평점 조건이 있는 장학금은 “확인 필요”로 보여요.</Sub>}

            <Title>알림 종류</Title>
            {KINDS.map((k) => (
              <Card key={k.key}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}><Body>{k.label}</Body><Sub>{k.desc}</Sub></View>
                  <Switch value={me.notify[k.key]} onValueChange={(v) => update({ [k.key]: v })} trackColor={{ true: color.primaryLight }} thumbColor="#fff" />
                </Row>
              </Card>
            ))}
          </>
        )}
      </StateView>
    </Screen>
  );
}
