// 앱의 모든 Text·TextInput은 react-native 대신 이 파일에서 가져옴
// ▶ FE 9번에 해당하는 부분: 글자 크기 '크게' — 글자 크기·줄 높이에만 배율을 곱함 (안에 든 글자는 바깥 크기를 이어받으므로 크기가 정해진 글자만)
// ▶ 글꼴 통일: 웹은 화면·브라우저마다 기본 글꼴이 달라서(입력칸은 특히) 모든 글자를 Noto Sans KR 하나로. 휴대폰은 기기 기본 글꼴
import { forwardRef, type ComponentRef } from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput, StyleSheet, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import { FONT_SCALE, useDisplay } from '../lib/display';

const web = Platform.OS === 'web';
const FONT = web ? { fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' } : null;
// 웹: 글꼴 파일을 한 번만 불러옴 (Google Fonts)
if (web && typeof document !== 'undefined' && !document.getElementById('app-font')) {
  const link = document.createElement('link');
  link.id = 'app-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap';
  document.head.appendChild(link);
}

function scaled(style: StyleProp<TextStyle>, large: boolean) {
  if (!large) return [FONT, style];
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {};
  if (!fontSize) return [FONT, style];
  return [FONT, style, { fontSize: fontSize * FONT_SCALE, ...(lineHeight ? { lineHeight: lineHeight * FONT_SCALE } : null) }];
}

export function Text(props: TextProps) {
  const { large } = useDisplay();
  return <RNText {...props} style={scaled(props.style, large)} />;
}

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput(props, ref) {
  const { large } = useDisplay();
  return <RNTextInput ref={ref} {...props} style={scaled(props.style, large)} />;
});
