// 성적 보기 (시안 09) / 수정 모드 (시안 10). 내 학업 탭과 성적 수정 화면이 같이 씀.
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, useApi } from '../lib/api';
import { overall, termLabel } from '../lib/format';
import { color } from '../lib/theme';
import type { GradeTerm } from '../lib/types';
import { Button, confirmAsk, Row, StateView, Sub } from './ui';

const gradeTone = (g: string) => (g.startsWith('A') ? { bg: color.primarySoft, fg: color.primary }
  : g.startsWith('B') ? { bg: color.warmSoft, fg: color.alert } : { bg: color.surface, fg: color.inkSub });

export function GradesView({ editing = false }: { editing?: boolean }) {
  const { data, error, loading, reload } = useApi<GradeTerm[]>('/grades');
  const [open, setOpen] = useState<string | null>(null);
  const terms = data ?? [];
  const sum = overall(terms);
  const openTerm = open ?? terms[0]?.term;

  function remove(id: number, name: string) {
    confirmAsk(name, '이 과목 성적을 지울까요?', '삭제', async () => {
      await api.del(`/grades/${id}`);
      reload();
    });
  }

  return (
    <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
      {editing ? (
        <View style={st.editBanner}>
          <Text style={{ color: color.alert, fontWeight: '800' }}>✏️ 성적 편집 중</Text>
          <Sub>과목 삭제 또는 항목 추가 후 완료 버튼을 눌러주세요.</Sub>
        </View>
      ) : (
        <View style={st.summary}>
          <View style={{ flex: 1 }}>
            <Sub>전체 평점 평균</Sub>
            <Text style={st.big}>{sum.gpa ?? '-'}<Text style={st.bigSub}> / 4.5</Text></Text>
          </View>
          <View style={{ flex: 1 }}>
            <Sub>총 취득학점</Sub>
            <Text style={st.big}>{sum.earned}<Text style={st.bigSub}> 학점</Text></Text>
          </View>
        </View>
      )}
      {terms.length === 0 && <Sub>입력한 성적이 없어요</Sub>}
      {terms.map((t) => {
        const isOpen = t.term === openTerm;
        return (
          <View key={t.term} style={[st.term, isOpen && st.termOpen]}>
            <Pressable style={st.termHead} onPress={() => setOpen(isOpen ? '' : t.term)}>
              <Text style={st.termTitle}>{termLabel(t.term)}</Text>
              <Row>
                {!editing && <Text style={st.termGpa}>{t.gpa ?? '-'} / 4.5</Text>}
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.inkSub} />
              </Row>
            </Pressable>
            {isOpen && t.items.map((g) => (
              <Pressable key={g.id} style={st.item} disabled={!editing}
                onPress={() => router.push({ pathname: '/study/grade-edit', params: { ...g, id: String(g.id), credits: String(g.credits) } })}>
                <Text style={st.itemName}>{g.course_name} ({g.credits}학점)</Text>
                {editing ? (
                  <Pressable accessibilityLabel={`${g.course_name} 삭제`} onPress={() => remove(g.id, g.course_name)} style={st.minus}>
                    <Text style={{ color: '#fff', fontWeight: '900' }}>−</Text>
                  </Pressable>
                ) : (
                  <View style={[st.grade, { backgroundColor: gradeTone(g.grade).bg }]}>
                    <Text style={{ color: gradeTone(g.grade).fg, fontWeight: '800', fontSize: 12 }}>{g.grade}</Text>
                  </View>
                )}
              </Pressable>
            ))}
            {isOpen && editing && (
              <Pressable style={st.addRow} onPress={() => router.push({ pathname: '/study/grade-edit', params: { term: t.term } })}>
                <Text style={{ color: color.primary, fontWeight: '700' }}>+ 과목 추가하기</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {editing && terms.length === 0 && <Button label="+ 과목 추가하기" kind="ghost" onPress={() => router.push('/study/grade-edit')} />}
      {editing
        ? <Button label="수정 완료하기" onPress={() => router.back()} />
        : <Button label="✏️ 성적 수정하기" kind="ghost" onPress={() => router.push('/study/grades-edit')} />}
    </StateView>
  );
}

const st = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: color.primarySoft, borderRadius: 16, padding: 16 },
  big: { fontSize: 26, fontWeight: '900', color: color.primary },
  bigSub: { fontSize: 14, fontWeight: '600', color: color.inkSub },
  editBanner: { borderWidth: 1.5, borderColor: color.alert, backgroundColor: color.warmSoft, borderRadius: 14, padding: 14, gap: 4 },
  term: { backgroundColor: color.surface, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: 'transparent' },
  termOpen: { backgroundColor: '#fff', borderColor: color.primary },
  termHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  termTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  termGpa: { fontSize: 13, fontWeight: '700', color: color.primary },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderColor: color.line },
  itemName: { fontSize: 14, fontWeight: '600', color: color.ink, flex: 1 },
  grade: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  minus: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.alert, alignItems: 'center', justifyContent: 'center' },
  addRow: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.primary, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 14 },
});
