// node --test lib/maskBox.test.mjs (Node 23.6+는 .ts를 바로 읽음)
import assert from 'node:assert/strict';
import test from 'node:test';

import { boxFrom } from './maskBox.ts';

test('거꾸로 끌어도 같은 네모', () => {
  assert.deepEqual(boxFrom(0.5, 0.5, 0.2, 0.1), boxFrom(0.2, 0.1, 0.5, 0.5));
});

test('사진 밖으로 끈 부분은 잘림', () => {
  const b = boxFrom(0.8, 0.9, 1.4, -0.3);
  assert.deepEqual([b.x, b.y, b.h], [0.8, 0, 0.9]);
  assert.ok(Math.abs(b.w - 0.2) < 1e-9); // 1 - 0.8 (소수 오차만큼 허용)
});

test('너무 작게 끈 건 무시 (누르기만 한 것)', () => {
  assert.equal(boxFrom(0.5, 0.5, 0.51, 0.7), null);
  assert.equal(boxFrom(0.5, 0.5, 0.5, 0.5), null);
});
