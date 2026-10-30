// 습득물 상세 — 확인 질문에 맞게 답하면 보관 장소가 보임. 내 글이면 보관 장소 + 찾아감/삭제
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Input, Label, NO_GROW } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Badge, Body, Button, Card, confirmAsk, goBack, Row, Screen, StateView, Sub } from '../../../components/ui';
import { api, attempt, useApi, useSubmit } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { LostItemDetail } from '../../../lib/types';

export default function LostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: it, error, loading, reload } =useApi<LostItemDetail>(`/lost-items/${id}`);
  const [answer, setAnswer] = useState('');
  const { busy, run } = useSubmit();

  const claim = () => run(async () => {
    await attempt(() => api.post(`/lost-items/${id}/claim`, { answer }), '확인하지 못했어요');
    reload(); // 맞혔으면 보관 장소, 틀렸으면 남은 기회를 다시 받아 옴
  });
  const toggle = () => run(async () => {
    await attempt(() => api.patch(`/lost-items/${id}`, { status: it?.status === 'open' ? 'closed' : 'open' }));
    reload();
  });
  const remove = () => confirmAsk('글을 지울까요?', '사진과 함께 지워지고 되돌릴 수 없어요.', '지우기',
    () => run(async () => { if (await attempt(() => api.del(`/lost-items/${id}`), '지우지 못했어요')) goBack(); }));

  return (
    <Screen title="습득물">
      <StateView loading={loading} error={error} empty={!it} onRetry={reload}>
        {it && (
          <>
            {it.image_url && <Image source={{ uri: it.image_url }} style={{ width: '100%', height: 220, borderRadius: 16 }} resizeMode="cover" accessibilityLabel={it.title} />}
            <Row><Badge label={it.category} />{it.status === 'closed' && <Badge label="주인이 찾아감" tone="warn" />}</Row>
            <Text style={{ fontSize: 19, fontWeight: '800', color: color.ink }}>{it.title}</Text>
            <Sub>{it.place} · {it.found_on}에 주웠어요</Sub>
            {!!it.description && <Body>{it.description}</Body>}

            <Card>
              <Label>확인 질문</Label>
              <Body>{it.question}</Body>
              {it.storage_place ? (
                <>
                  <Label>보관 장소</Label>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: color.primary }}>{it.storage_place}</Text>
                </>
              ) : it.tries_left > 0 ? (
                <>
                  <Input style={NO_GROW} value={answer} onChangeText={setAnswer} placeholder="답을 적어 주세요" maxLength={50} onSubmitEditing={claim} />
                  <Sub>맞게 답하면 보관 장소가 보여요. 남은 기회 {it.tries_left}번</Sub>
                  <Button label="확인" disabled={!answer.trim() || busy} onPress={claim} />
                </>
              ) : <Sub>3번 모두 틀려서 더 답할 수 없어요. 학생지원팀에 문의해 주세요.</Sub>}
            </Card>

            {it.mine && (
              <Row>
                <View style={{ flex: 1 }}><Button compact kind="ghost" label="지우기" disabled={busy} onPress={remove} /></View>
                <View style={{ flex: 1.5 }}><Button compact label={it.status === 'open' ? '주인이 찾아갔어요' : '다시 보관 중으로'} disabled={busy} onPress={toggle} /></View>
              </Row>
            )}
          </>
        )}
      </StateView>
    </Screen>
  );
}
