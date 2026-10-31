// 습득물 사진 가리기: 사진 위를 손가락(마우스)으로 끌면 그 네모가 검게 가려짐 (이름·학번·얼굴·카드 번호 등)
// 올릴 때 가린 그대로 새 사진을 만들어 보내서 원본은 서버에 가지 않음 (사진 저장소는 주소만 알면 누구나 보는 public)
// 휴대폰은 react-native-view-shot으로 사진+네모를 찍고, 웹은 브라우저 canvas로 원래 크기 그대로 칠함
import { useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Image, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { boxFrom, type Box } from '../lib/maskBox';
import { color } from '../lib/theme';
import { Pressable, Text } from './Text';

export type Photo = { uri: string; base64: string; width: number; height: number };
/** 찍을(capture) 사진 칸 */
export type Shot = RefObject<ComponentRef<typeof View> | null>;
export type { Box };

export function PhotoMask({ photo, boxes, onChange, shot }: { photo: Photo; boxes: Box[]; onChange: (b: Box[]) => void; shot: Shot }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Box | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const ratio = photo.width / photo.height;

  /* eslint-disable react-hooks/refs -- 처리 함수는 그리는 중이 아니라 손가락 움직임 때만 불림 */
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // 끄는 동안 화면 스크롤이 가져가지 않게
    onPanResponderGrant: (e) => {
      start.current = { x: e.nativeEvent.locationX / size.w, y: e.nativeEvent.locationY / size.h };
    },
    onPanResponderMove: (_, g) => {
      const { x, y } = start.current;
      setDraft(boxFrom(x, y, x + g.dx / size.w, y + g.dy / size.h));
    },
    onPanResponderRelease: (_, g) => {
      const { x, y } = start.current;
      const b = boxFrom(x, y, x + g.dx / size.w, y + g.dy / size.h);
      setDraft(null);
      if (b) onChange([...boxes, b]);
    },
    onPanResponderTerminate: () => setDraft(null),
  }), [size, boxes, onChange]);
  /* eslint-enable react-hooks/refs */

  const rect = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }) as const;

  return (
    <View style={{ gap: 6 }}>
      {/* 세로로 긴 사진은 폭을 줄여 화면을 넘지 않게 (비율은 그대로 → 찍은 사진이 늘어나지 않음) */}
      <View ref={shot} collapsable={false} {...pan.panHandlers}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={[st.frame, { aspectRatio: ratio, width: ratio < 0.75 ? `${(ratio / 0.75) * 100}%` : '100%' }, Platform.OS === 'web' && (WEB_DRAW as object)]}
        accessibilityLabel="고른 사진. 끌어서 가릴 부분을 검게 칠해요">
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        {boxes.map((b, i) => <View key={i} pointerEvents="none" style={[st.box, rect(b)]} />)}
        {draft && <View pointerEvents="none" style={[st.box, st.draft, rect(draft)]} />}
      </View>
      <Text style={st.hint}>사진 위를 끌어서 이름·학번·얼굴·카드 번호처럼 개인정보가 보이는 곳을 검게 가려 주세요. 가린 그대로 올라가요.</Text>
      {boxes.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => onChange(boxes.slice(0, -1))}><Text style={st.link}>마지막 가림 취소</Text></Pressable>
          <Pressable onPress={() => onChange([])}><Text style={st.link}>가림 모두 지우기</Text></Pressable>
        </View>
      )}
    </View>
  );
}

/** 올릴 사진(base64). 가린 곳이 없으면 원본 그대로, 있으면 검게 칠한 새 JPG */
export async function maskedBase64(photo: Photo, boxes: Box[], shot: Shot): Promise<string> {
  if (boxes.length === 0) return photo.base64;
  if (Platform.OS !== 'web') return captureRef(shot, { format: 'jpg', quality: 0.8, result: 'base64' });
  // 웹: 원본 크기 canvas에 사진을 그리고 네모를 칠함 (view-shot의 웹 기능은 추가 패키지가 필요해서 직접)
  const img = new window.Image();
  img.src = photo.uri;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#000';
  for (const b of boxes) ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// 웹: 끄는 동안 글자 선택·페이지 스크롤 막고, 그리기 커서
const WEB_DRAW = { userSelect: 'none', touchAction: 'none', cursor: 'crosshair' };

const st = StyleSheet.create({
  frame: { alignSelf: 'center', overflow: 'hidden' }, // 둥근 모서리는 안 줌: 찍은 사진 모서리가 까맣게 잘리지 않게
  box: { position: 'absolute', backgroundColor: '#000' },
  draft: { backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 2, borderColor: '#fff' },
  hint: { fontSize: 13, color: color.inkSub, lineHeight: 19 },
  link: { fontSize: 13, color: color.primary, fontWeight: '700' },
});
