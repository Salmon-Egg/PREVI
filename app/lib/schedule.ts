// ▶ FE 22번에 해당하는 부분: L-7 시간 중복·학점 초과 검사 (앱에서 먼저 막고, 저장할 때 서버가 한 번 더 확인)
// 서버 server/logic/schedule.py와 같은 규칙으로 맞춰야 함
import { periodsOf, toMin } from './format';
import type { ClassTime, TimetableEntry } from './types';

/** 한 학기 최대 신청 학점. ⚠️ 학칙 기준(학년·직전 평점에 따라 다를 수 있음)은 BE와 확인 필요 */
export const CREDIT_LIMIT = 21;

/** 두 수업 시간이 겹치는 부분. 안 겹치면 null */
function overlap(a: ClassTime, b: ClassTime): ClassTime | null {
  if (a.day !== b.day) return null;
  const start = Math.max(toMin(a.start), toMin(b.start));
  const end = Math.min(toMin(a.end), toMin(b.end));
  if (start >= end) return null;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { day: a.day, start: hhmm(start), end: hhmm(end) };
}

/** 넣으려는 과목이 시간표에 못 들어가는 이유. 들어가면 null.
 *  돌려주는 lines는 시안 08 '수강 과목 등록 불가' 창 모양 (API 명세 TIME_CONFLICT 메시지와 같음) */
export function checkAdd(
  entries: TimetableEntry[],
  next: Pick<TimetableEntry, 'course_id' | 'course_name' | 'credits' | 'times'>,
): { code: 'DUPLICATE' | 'TIME_CONFLICT' | 'CREDIT_LIMIT'; title: string; lines: string[] } | null {
  if (next.course_id !== null && entries.some((e) => e.course_id === next.course_id)) {
    return { code: 'DUPLICATE', title: '이미 담은 과목', lines: [`[${next.course_name}]은(는) 이미 수강 과목 목록에 있어요.`] };
  }
  for (const e of entries) {
    for (const t of next.times) {
      for (const u of e.times) {
        const o = overlap(t, u);
        if (o) {
          const ps = periodsOf(o);
          const when = ps ? `${ps.join(', ')}교시` : `${o.start}~${o.end}`;
          return {
            code: 'TIME_CONFLICT', title: '수강 과목 등록 불가',
            lines: [`강의 시간 중복 (${o.day}요일 ${when})`, `기존 수강 과목 [${e.course_name}]과 수업 시간대가 서로 겹칩니다.`],
          };
        }
      }
    }
  }
  const total = entries.reduce((n, e) => n + e.credits, 0) + next.credits;
  if (total > CREDIT_LIMIT) {
    return { code: 'CREDIT_LIMIT', title: '학점 초과', lines: [`신청 가능 학점 초과 (${total} / ${CREDIT_LIMIT}학점)`, `한 학기에 ${CREDIT_LIMIT}학점까지 들을 수 있어요.`] };
  }
  return null;
}
