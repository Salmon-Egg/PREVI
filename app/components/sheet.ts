// 공지 안내(S-2·A-1)와 할 일 상세(T-2)가 같이 쓰는 흰 시트 모양: 머리(아이콘·제목·✕) → 공지 칸 → AI 상자 → 유의사항, 아래 버튼 2칸
import { StyleSheet } from 'react-native';

import { color } from '../lib/theme';

export const sheet = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff', borderRadius: 24, margin: -6, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.line },
  headIcon: { fontSize: 18 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: color.title },
  body: { padding: 12, gap: 12 },
  ai: { backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 14, padding: 14, gap: 6, marginBottom: 6 },
  aiHead: { fontSize: 13, fontWeight: '800', color: color.title },
  aiLine: { fontSize: 13, color: color.ink, lineHeight: 19 },
  verdict: { fontSize: 13, color: color.title, fontWeight: '700', lineHeight: 19 },
  article: { backgroundColor: '#F4FAF6', borderWidth: 1, borderColor: color.field, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: 17, fontWeight: '800', color: color.title, lineHeight: 24 },
  meta: { fontSize: 12, color: color.inkSub },
  rule: { height: 1, backgroundColor: color.field, marginVertical: 6 },
  text: { fontSize: 14, color: color.ink, lineHeight: 22 },
  caution: { marginTop: 12, backgroundColor: '#FFF6EA', borderWidth: 1, borderColor: '#F3C98B', borderRadius: 12, padding: 12, gap: 4 },
  cautionHead: { fontSize: 13, fontWeight: '800', color: '#B4630B' },
  cautionText: { fontSize: 12, color: color.ink, lineHeight: 18 },
  bottom: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: color.line },
});
