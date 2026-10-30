// 습득물 사진 (목록·상세). 전달 완료면 사진을 흐리게 하고 '주인 찾음' 도장을 찍음
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { color } from '../lib/theme';
import type { LostItem } from '../lib/types';
import { Text } from './Text';

export function LostPhoto({ it, small, style }: { it: LostItem; small?: boolean; style: ViewStyle }) {
  const done = it.status === 'closed';
  return (
    <View style={[st.box, style]}>
      {it.image_url && <Image source={{ uri: it.image_url }} blurRadius={done ? (small ? 3 : 12) : 0} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityLabel={it.title} />}
      {done && (
        <View style={[st.stamp, small && { borderWidth: 1.5, padding: 1 }]}>
          <View style={[st.inner, small && { paddingHorizontal: 2, paddingVertical: 1 }]}>
            <Text style={[st.text, small && { fontSize: 10, letterSpacing: 0 }]} numberOfLines={1}>주인 찾음</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stamp: { borderWidth: 3, borderColor: color.red, borderRadius: 8, padding: 2, backgroundColor: 'rgba(255,255,255,0.7)', transform: [{ rotate: '-14deg' }] },
  inner: { borderWidth: 1, borderColor: color.red, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 4 },
  text: { fontSize: 26, fontWeight: '800', color: color.red, letterSpacing: 2 },
});
