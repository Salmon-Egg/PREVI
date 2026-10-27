// 색·그라데이션 (2026-10-27 새 시안: 하늘색→연두 배경, 반투명 흰 판, 초록 그라데이션 버튼)
import { Platform } from 'react-native';

export const color = {
  primary: '#0C6B3F',
  primarySoft: '#E9F3EE',
  primaryLight: '#17A05D', // 피그마 홈: D-DAY 배지, 진행 점, '오늘 마감' 글자
  title: '#0E5A42', // 새 시안: 화면 제목·창 제목·라벨의 진한 초록
  homeBg: '#F3F8F4', // 피그마 홈 배경
  warmSoft: '#FFF1E8', // 시안: 교양 과목 칸, 미신청 장학 카드, 주의 상자
  ink: '#121714',
  inkSub: '#656E69',
  surface: '#F1F3F2',
  alert: '#B93C0A',
  bg: '#FFFFFF',
  line: '#E3E6E4',
  field: '#CFE4D8', // 새 시안: 입력칸·흰 카드 테두리 (연한 초록)
  warnSoft: '#FBF0DC',
  warn: '#7A5205',
  badSoft: '#FBE9E3',
  red: '#E0574F', // 새 시안: 오류 테두리·문구, 빼기(−) 버튼, '미신청' 배지
  redSoft: '#FCE3E1',
};

export const gradient = {
  primary: 'linear-gradient(135deg, #17995D 0%, #0B6B3F 100%)', // 주 버튼
  screen: 'linear-gradient(180deg, #CBE5F3 0%, #E4F1EE 50%, #D3ECDB 100%)', // 화면 배경
  login: 'linear-gradient(180deg, #BFDDF2 0%, #DCEEF0 45%, #D6EEDC 100%)', // 로그인 배경 (하늘이 더 파랗게)
};

/** 그라데이션 배경. 웹은 CSS, 휴대폰(새 아키텍처)은 experimental_backgroundImage. 안 되는 곳은 fallback 색만 보임 */
export function gradientBg(css: string, fallback: string) {
  return { backgroundColor: fallback, ...(Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) } as object;
}

/** 웹에서만 뒤 배경을 흐리게 (반투명 흰 판·창) */
export const webBlur = (px: number) => (Platform.OS === 'web' ? ({ backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } as object) : null);
