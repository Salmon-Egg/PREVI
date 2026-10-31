// 고객센터 — 내 문의 목록(답변 포함), 아래 버튼으로 관리자에게 문의 보내기. 답변이 오면 알림(종류 support)
import { useState } from 'react';
import { View } from 'react-native';

import { Input, Label, NO_GROW, Select, Sheet } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, Row, Screen, StateView, Sub } from '../../../components/ui';
import { api, attempt, useApi, useSubmit } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { SUPPORT_CATEGORIES, type SupportCategory, type SupportTicket } from '../../../lib/types';

const EMPTY = { category: '기타' as SupportCategory, title: '', body: '' };
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');

export default function Support() {
  const { data, error, loading, reload } = useApi<SupportTicket[]>('/support');
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { busy, run } = useSubmit();
  const ready = form.title.trim() && form.body.trim();

  const submit = () => run(async () => {
    if (!await attempt(() => api.post('/support', form), '보내지 못했어요')) return;
    setForm(EMPTY); // 실패하면 쓴 글을 지우지 않음
    setWriting(false);
    reload();
  });

  return (
    <Screen title="고객센터" footer={<Button label="문의하기" onPress={() => setWriting(true)} />}>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="보낸 문의가 없어요" onRetry={reload}>
        {data?.map((t) => (
          <Card key={t.id}>
            <Row>
              <Badge label={t.category} />
              <Badge label={t.answer === null ? '답변 대기' : '답변 완료'} tone={t.answer === null ? 'warn' : 'strong'} />
            </Row>
            <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{t.title}</Text>
            <Text style={{ fontSize: 14, color: color.ink }}>{t.body}</Text>
            <Sub>{day(t.created_at)}</Sub>
            {t.answer !== null && (
              <View style={{ backgroundColor: color.primarySoft, borderRadius: 12, padding: 12, gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: color.primary }}>답변</Text>
                <Text style={{ fontSize: 14, color: color.ink }}>{t.answer}</Text>
              </View>
            )}
          </Card>
        ))}
      </StateView>
      <Sheet visible={writing} onClose={() => setWriting(false)} title="문의하기" sub="비밀번호·성적 같은 민감한 정보는 적지 말아 주세요">
        <Label required>종류</Label>
        <Select value={form.category} items={[...SUPPORT_CATEGORIES]} onChange={(category) => setForm((f) => ({ ...f, category }))} title="종류" />
        <Label required>제목</Label>
        <Input style={NO_GROW} value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} placeholder="예) 알림이 오지 않아요" maxLength={100} />
        <Label required>내용</Label>
        <Input style={{ ...NO_GROW, minHeight: 140, textAlignVertical: 'top' }} value={form.body} onChangeText={(body) => setForm((f) => ({ ...f, body }))} placeholder="어떤 상황인지 적어 주세요" maxLength={2000} multiline />
        <View style={{ height: 4 }} />
        <Button label={busy ? '보내는 중…' : '보내기'} disabled={!ready || busy} onPress={submit} />
      </Sheet>
    </Screen>
  );
}
