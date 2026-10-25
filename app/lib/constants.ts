// 여러 화면이 같이 쓰는 목록. 한 곳에서만 고치면 되도록 모음
import type { Status } from './types';

/** 요일 (Date.getDay() 순서) */
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 시간표 요일 (월~금) */
export const CLASS_DAYS = ['월', '화', '수', '목', '금'];

// 처음 설정(M-2, onboarding.tsx)과 학적 정보 변경(M-4, me/status.tsx)
export const DEPTS = ['소프트웨어학과', '전자컴퓨터공학과'];
export const MINORS = ['없음', '경영학부 (부전공)', '소프트웨어학과 (복수전공)', '전자컴퓨터공학과 (복수전공)'];
export const STATUSES: Status[] = ['enrolled', 'leave', 'returned'];

/** 브리핑 받을 시각 (마이, 비서 설정) */
export const BRIEF_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];
