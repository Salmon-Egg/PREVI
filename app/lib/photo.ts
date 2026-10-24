// ▶ FE 35번에 해당하는 부분: C-2 습득물 제보 — 사진 고르기(카메라·앨범) → 긴 변 1024px로 축소 후 업로드용 JPEG
// 사진 원본은 크기가 커서(수 MB) 그대로 올리지 않고 줄여서 보냄 (작업 리스트 1-9 '사진 축소 후 업로드')
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type Photo = { uri: string; base64: string | null; width: number; height: number };

const MAX = 1024;

/** camera=true면 카메라, 아니면 앨범. 취소하면 null */
export async function pickPhoto(camera = false): Promise<Photo | null> {
  if (camera && Platform.OS !== 'web') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = camera && Platform.OS !== 'web' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  return shrink(res.assets[0].uri, res.assets[0].width, res.assets[0].height);
}

/** 긴 변이 MAX보다 크면 줄이고 JPEG(품질 0.7)로 저장 */
async function shrink(uri: string, width: number, height: number): Promise<Photo> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX) ctx.resize(width >= height ? { width: MAX } : { height: MAX });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return { uri: out.uri, base64: out.base64 ?? null, width: out.width, height: out.height };
}
