// 여러 화면이 같이 쓰는 목록. 한 곳에서만 고치면 되도록 모음
import type { Status } from './types';

/** 요일 (Date.getDay() 순서) */
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 시간표 요일 (월~금) */
export const CLASS_DAYS = ['월', '화', '수', '목', '금'];

// 처음 설정(M-2, onboarding.tsx)과 학적 정보 변경(M-4, me/status.tsx). 학과·전공 목록은 lib/departments.ts
export const STATUSES: Status[] = ['enrolled', 'leave', 'returned'];

/** 개인정보 수집·이용 안내 (로그인 아래 문구, 마이페이지 이용약관). 한 줄에 하나씩 보여 줌 (form.tsx PrivacySheet) */
export const PRIVACY: { title: string; lines: string[] }[] = [
  { title: '수집 항목', lines: ['학번, 이름, 학교 이메일', '학과·부전공, 학년·학기, 학적 상태, 입학년도', '직접 입력한 성적, 시간표', '채팅 내용'] },
  { title: '이용 목적', lines: ['나에게 해당하는 공지·장학금·졸업 요건 안내', '마감·학사일정 알림'] },
  { title: '보관 기간', lines: ['계정을 삭제하면 모든 정보가 함께 지워져요.'] },
];

/** 브리핑 받을 시각 (마이, 비서 설정) */
export const BRIEF_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];
/** 방해 금지 시간 (마이페이지): '' = 끔, 아니면 '직접 입력'으로 시작·끝 시각을 30분 단위로 고름 */
export const QUIET_CUSTOM = '직접 입력';
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
