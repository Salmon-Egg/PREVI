// ▶ FE 9번에 해당하는 부분: 글자 크기 '크게' — 앱의 모든 Text·TextInput은 react-native 대신 이 파일에서 가져옴
// 글자 크기·줄 높이에만 배율을 곱함 (안에 든 글자는 바깥 글자 크기를 이어받으므로 크기가 정해진 글자만 바꿈)
import { forwardRef, type ComponentRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import { FONT_SCALE, useDisplay } from '../lib/display';

function scaled(style: StyleProp<TextStyle>, large: boolean) {
  if (!large) return style;
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {};
  if (!fontSize) return style;
  return [style, { fontSize: fontSize * FONT_SCALE, ...(lineHeight ? { lineHeight: lineHeight * FONT_SCALE } : null) }];
}

export function Text(props: TextProps) {
  const { large } = useDisplay();
  return <RNText {...props} style={scaled(props.style, large)} />;
}

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput(props, ref) {
  const { large } = useDisplay();
  return <RNTextInput ref={ref} {...props} style={scaled(props.style, large)} />;
});
