// ▶ FE 34번에 해당하는 부분: H-3 대화 목록 — 검색, 고정, 분류 칩 (피그마 06_ai_chat ⑤ 대화 기록)
// 홈의 끌어 올리는 대화창(ChatSheet) 안과 대화 기록 화면(chat/history)이 같이 씀. 대화를 누르면 onOpen
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, attempt, useApi } from '../lib/api';
import { color } from '../lib/theme';
import type { ChatCategory, Conversation } from '../lib/types';
import { Pressable, Text, TextInput } from './Text';
import { Chips, StateView, Sub } from './ui';

const CATS: ('전체' | ChatCategory)[] = ['전체', '수업/졸업', '장학금', '학사 행정', '기타'];
const ICON: Record<ChatCategory, keyof typeof Feather.glyphMap> = {
  '수업/졸업': 'book-open', 장학금: 'award', '학사 행정': 'file-text', 기타: 'message-circle',
};

/** 서버가 category를 안 주면 제목 낱말로 추측 */
function categoryOf(c: Conversation): ChatCategory {
  if (c.category) return c.category;
  const t = c.title;
  if (/장학/.test(t)) return '장학금';
  if (/졸업|학점|성적|수강|시간표|과목/.test(t)) return '수업/졸업';
  if (/휴학|복학|학사|공지|일정/.test(t)) return '학사 행정';
  return '기타';
}

export function ChatHistory({ onOpen }: { onOpen: (conversationId: number) => void }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('전체');
  // 글자를 칠 때마다 부르지 않고 0.3초 멈추면 검색
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload, setData } = useApi<Conversation[]>(`/conversations?q=${encodeURIComponent(query)}`);
  const list = (data ?? [])
    .filter((c) => cat === '전체' || categoryOf(c) === cat)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)); // 고정한 대화가 위로

  async function togglePin(c: Conversation) {
    if (!(await attempt(() => api.patch(`/conversations/${c.id}`, { pinned: !c.pinned }), '고정하지 못했어요'))) return;
    setData((l) => l?.map((x) => (x.id === c.id ? { ...x, pinned: !c.pinned } : x)) ?? null);
  }

  return (
    <>
      <View style={st.search}>
        <Feather name="search" size={18} color={color.inkSub} />
        <TextInput style={st.input} placeholder="대화 검색" placeholderTextColor={color.inkSub} value={q} onChangeText={setQ} />
      </View>
      <Chips items={CATS} value={cat} onChange={setCat} label={(v) => v} />
      <StateView loading={loading} error={error} empty={!list.length} emptyText="대화가 없어요" onRetry={reload}>
        {list.map((c) => {
          const k = categoryOf(c);
          return (
            <Pressable key={c.id} accessibilityRole={undefined} style={st.row} onPress={() => onOpen(c.id)}>
              <View style={st.icon}><Feather name={ICON[k]} size={18} color={color.primary} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.title} numberOfLines={1}>{c.title}</Text>
                {!!c.preview && <Sub>{c.preview}</Sub>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={st.date}>{Number(c.updated_at.slice(5, 7))}월 {Number(c.updated_at.slice(8, 10))}일</Text>
                <Pressable accessibilityLabel={c.pinned ? '고정 풀기' : '고정하기'} onPress={() => togglePin(c)} hitSlop={8}>
                  <Feather name="bookmark" size={16} color={c.pinned ? color.primary : color.inkSub} />
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </StateView>
    </>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: color.field, borderRadius: 14, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, paddingVertical: 11, color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.line },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: color.ink },
  date: { fontSize: 12, color: color.inkSub },
});
