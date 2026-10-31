// 습득물 사진 가리기(components/PhotoMask.tsx)의 네모 계산. 화면과 상관없는 순수 함수라 따로 둠 (lib/maskBox.test.mjs)

/** 가린 네모. 사진 크기에 대한 비율(0~1)이라 화면·원본 크기와 상관없음 */
export type Box = { x: number; y: number; w: number; h: number };

const MIN = 0.03; // 이보다 작게 끈 건 실수로 친 것 → 무시

/** 시작점·현재점(비율)으로 네모 만들기. 어느 방향으로 끌어도 되고, 사진 밖으로 끈 부분은 잘라냄 */
export function boxFrom(x0: number, y0: number, x1: number, y1: number): Box | null {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const [l, r] = [c(Math.min(x0, x1)), c(Math.max(x0, x1))];
  const [t, b] = [c(Math.min(y0, y1)), c(Math.max(y0, y1))];
  return r - l < MIN || b - t < MIN ? null : { x: l, y: t, w: r - l, h: b - t };
}
