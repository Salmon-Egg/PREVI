// 화면에 보여 줄 글자 모양 만들기
import type { AreaCourse, ClassTime, GradeTerm } from './types';
import { WEEKDAYS } from './constants';


const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 01교시 = 09:00~10:00. 정시면 ['02','03'], 아니면 null */
export function periodsOf(t: ClassTime): string[] | null {
  const s = toMin(t.start);
  const e = toMin(t.end);
  if (s % 60 || e % 60 || s < 540) return null;
  const out: string[] = [];
  for (let h = s / 60; h < e / 60; h++) out.push(String(h - 8).padStart(2, '0'));
  return out;
}

/** "월 02,03 / 수 01" (정시가 아니면 "월 10:30~12:00") */
export function timesText(times: ClassTime[]) {
  return times.map((t) => `${t.day} ${periodsOf(t)?.join(',') ?? `${t.start}~${t.end}`}`).join(' / ');
}

/** 교시 번호들 → 시작·끝 시각. ['02','03','04'] → 10:00~13:00 */
export function periodsToTime(periods: number[]) {
  const sorted = [...periods].sort((a, b) => a - b);
  const h = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return { start: h(sorted[0] + 8), end: h(sorted[sorted.length - 1] + 9) };
}

/** "2026학년도 2학기" (8월부터 2학기) */
export function semesterLabel() {
  const now = new Date();
  return `${now.getFullYear()}학년도 ${now.getMonth() >= 7 ? 2 : 1}학기`;
}

/** "4-1" → "4학년 1학기" */
export const termLabel = (term: string) => term.replace('-', '학년 ') + '학기';

const POINTS: Record<string, number> = { 'A+': 4.5, A0: 4, 'B+': 3.5, B0: 3, 'C+': 2.5, C0: 2, 'D+': 1.5, D0: 1, F: 0 };

/** 전체 평점 평균(P 제외)과 총 취득학점(F 제외). 서버 logic/grades.py와 같은 규칙 */
export function overall(terms: GradeTerm[]) {
  const items = terms.flatMap((t) => t.items);
  const scored = items.filter((i) => i.grade in POINTS);
  const credits = scored.reduce((n, i) => n + i.credits, 0);
  const gpa = credits ? scored.reduce((n, i) => n + POINTS[i.grade] * i.credits, 0) / credits : null;
  const earned = items.filter((i) => i.grade !== 'F').reduce((n, i) => n + i.credits, 0);
  return { gpa: gpa === null ? null : Math.round(gpa * 100) / 100, earned };
}

/** 오늘부터 그 날짜까지 남은 날 (지났으면 음수). 서버가 d_day를 안 주는 학사일정에 씀 */
export function ddayOf(date: string) {
  const today = new Date();
  return Math.round((new Date(date + 'T00:00:00').getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 864e5);
}

// 졸업 영역에 들어가는 과목: 서버(server/logic/graduation.py)와 같은 규칙 — 공백·대소문자 무시, '전공'·'교양'은 하위 영역을 모두 포함
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const MAJOR_AREAS = ['전공', '전공기초', '전공핵심', '전공심화', '전공필수', '전공선택'].map(norm);
const GENERAL_AREAS = ['교양', '교양필수', '핵심역량교양필수', '교양선택', '기초학문교양선택', '균형교양', '자유선택'].map(norm);

/** 그 졸업 영역에서 들은 과목 (서버가 courses를 안 줄 때 성적 목록에서 만듦) */
export function coursesInArea(areaName: string, terms: GradeTerm[]): AreaCourse[] {
  const names = areaName === '전공' ? MAJOR_AREAS : areaName === '교양' ? GENERAL_AREAS : [norm(areaName)];
  return terms.flatMap((t) => t.items).filter((g) => names.includes(norm(g.area)))
    .map(({ term, course_name, credits, grade }) => ({ term, course_name, credits, grade }));
}

/** "2026.09.15" */
export const dotDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/** 마감 문구: "오늘 18:00 마감!" / "D-12 (11/04까지)" */
export function deadlineText(iso: string | null) {
  if (!iso) return '마감 없음';
  const due = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(due.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 864e5);
  const hhmm = iso.slice(11, 16);
  if (days === 0) return `오늘 ${hhmm} 마감!`;
  if (days < 0) return `마감 지남 (${due.getMonth() + 1}/${due.getDate()}(${WEEKDAYS[due.getDay()]}))`; // 'D--30'처럼 나오지 않게
  return `D-${days} (${due.getMonth() + 1}/${due.getDate()}(${WEEKDAYS[due.getDay()]})까지)`;
}
