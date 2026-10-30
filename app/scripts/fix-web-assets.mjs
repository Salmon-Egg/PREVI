// ▶ FE 6번에 해당하는 부분: 웹 내보내기(dist) 뒤처리 — npm run export:web 이 자동으로 부름
// Cloudflare Pages(wrangler)는 이름이 node_modules인 폴더를 올리지 않음 → 아이콘 글꼴(Feather 등)이
// dist/assets/node_modules/@expo/vector-icons/… 에 있어서 배포 사이트에서 아이콘이 ☒로 깨짐 (2026-10-30 확인)
// 그래서 그 폴더를 dist/assets/vendor 로 옮기고, 빌드 파일 안의 경로도 같이 바꿈
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const FROM = '/assets/node_modules/';
const TO = '/assets/vendor/';

if (!existsSync(join(DIST, 'assets', 'node_modules'))) {
  console.log('fix-web-assets: 옮길 node_modules 폴더 없음 (그대로 둠)');
  process.exit(0);
}
renameSync(join(DIST, 'assets', 'node_modules'), join(DIST, 'assets', 'vendor'));

/** dist 안의 모든 파일 */
const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));

let changed = 0;
for (const f of files(DIST).filter((f) => /\.(js|html|css|json|map)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes(FROM)) continue;
  writeFileSync(f, s.replaceAll(FROM, TO));
  changed++;
}
// 하나도 못 바꿨으면 Expo가 경로 모양을 바꾼 것 → 깨진 채로 배포되지 않게 실패시킴
if (changed === 0) {
  console.error(`fix-web-assets: 빌드 파일에서 ${FROM} 경로를 못 찾음. 아이콘 글꼴 경로를 확인하세요.`);
  process.exit(1);
}
console.log(`fix-web-assets: 글꼴 폴더를 assets/vendor로 옮기고 파일 ${changed}개의 경로를 바꿈`);
