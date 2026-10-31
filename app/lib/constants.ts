// 여러 화면이 같이 쓰는 목록. 한 곳에서만 고치면 되도록 모음
import type { Status } from './types';

/** 요일 (Date.getDay() 순서) */
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 시간표 요일 (월~금) */
export const CLASS_DAYS = ['월', '화', '수', '목', '금'];

// 처음 설정(M-2, onboarding.tsx)과 학적 정보 변경(M-4, me/status.tsx). 학과·전공 목록은 lib/departments.ts
export const STATUSES: Status[] = ['enrolled', 'leave', 'returned'];
/** 입학연도 고르기: 2015년부터 올해까지 (해가 바뀌면 자동으로 늘어남) */
export const ADMISSION_YEARS = Array.from({ length: new Date().getFullYear() - 2015 + 1 }, (_, i) => 2015 + i);

/** 방해 금지 시간 (마이페이지): '' = 끔, 아니면 '직접 입력'으로 시작·끝 시각을 30분 단위로 고름. 브리핑 시각도 HALF_HOURS에서 고름 */
export const QUIET_CUSTOM = '직접 입력';
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
