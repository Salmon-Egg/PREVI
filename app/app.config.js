// ▶ FE 6번에 해당하는 부분: 시연용 웹 빌드 설정
// 평소에는 app.json 그대로 씀. DEMO_BUILD=1(scripts/build-demo.mjs)일 때만 화면 코드를 나눠 받지 않고(asyncRoutes 끔)
// 한 파일로 묶어서, HTML 한 장짜리 시연 사이트로 만들 수 있게 함
module.exports = ({ config }) => {
  if (process.env.DEMO_BUILD !== '1') return config;
  return {
    ...config,
    plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : p)),
  };
};
