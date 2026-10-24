// ▶ FE 6번에 해당하는 부분: 웹 내보내기 → 서버 없이 열리는 시연 사이트 (HTML 한 장)
// 사용법 (app 폴더에서):  npm run build:demo
// 결과: ../demo/index.html — 예시 데이터 모드라 서버 없이 모든 화면이 돌아감.
//   · 더블클릭으로는 안 열리고(브라우저가 file:// 주소의 화면 이동을 막음) ../demo/시연_사이트_열기.bat 으로 열기
//   · 정적 호스팅(Vercel, GitHub Pages, Netlify 등)에 index.html 하나만 올려도 됨
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(APP, 'dist-demo');
const DEMO = join(APP, '..', 'demo');

// 1) 예시 데이터 모드 + 분실물 켠 상태로 웹 내보내기 (app.config.js가 DEMO_BUILD=1이면 한 파일로 묶음)
rmSync(OUT, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir dist-demo --clear`, {
  cwd: APP,
  stdio: 'inherit',
  env: { ...process.env, DEMO_BUILD: '1', EXPO_PUBLIC_USE_MOCK: '1', EXPO_PUBLIC_DEV_LOGIN: '1', EXPO_PUBLIC_LOST_ENABLED: '1' },
});

// 2) 그림·글꼴을 data: 주소로 바꿔 넣기. 아이콘 글꼴은 실제로 쓰는 두 가지만 (나머지는 불러지지 않음)
const MIME = { png: 'image/png', jpg: 'image/jpeg', ttf: 'font/ttf', ico: 'image/x-icon' };
const USED_FONT = /Fonts\/(Feather|MaterialCommunityIcons)\./;
function inlineAssets(js) {
  return js.replace(/"(\/assets\/[^"]+\.(png|jpg|ttf))"/g, (whole, path, ext) => {
    const file = join(OUT, decodeURIComponent(path));
    if (!existsSync(file) || (ext === 'ttf' && !USED_FONT.test(path))) return whole;
    return `"data:${MIME[ext]};base64,${readFileSync(file).toString('base64')}"`;
  });
}

// 3) index.html의 <script src>를 내용으로 바꿔 넣고, 어느 주소에서 열려도 첫 화면('/')부터 시작하게 함
let html = readFileSync(join(OUT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)];
for (const [tag, src] of scripts) {
  const code = inlineAssets(readFileSync(join(OUT, src), 'utf8')).replaceAll('</script', '<\\/script');
  html = html.replace(tag, () => `<script>${code}</script>`);
}
const boot = `<script>try{if(!/^\\/(login|onboarding)?$/.test(location.pathname))history.replaceState(null,'','/')}catch(e){}</script>`;
html = html
  .replace('<div id="root"></div>', `<div id="root"></div>${boot}`)
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace('<html lang="en">', '<html lang="ko">');

mkdirSync(DEMO, { recursive: true });
writeFileSync(join(DEMO, 'index.html'), html);
rmSync(OUT, { recursive: true, force: true });
console.log(`시연 사이트 완성: ${join(DEMO, 'index.html')} (${(html.length / 1024 / 1024).toFixed(1)}MB)`);
