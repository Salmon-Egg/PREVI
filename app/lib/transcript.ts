import type { TranscriptItem } from './types';

export function transcriptGroup(item: TranscriptItem, index: number): string {
  return item.source_year && item.source_semester ? `${item.source_year}-${item.source_semester}` : `row-${index}`;
}

/** 원문 학기를 사용자가 지정한 학기에만 연결한다. 원문·경고 필드는 저장 API에 보내지 않는다. */
export function transcriptPayload(item: TranscriptItem, term: string | undefined) {
  if (item.excluded || !term || !/^[1-4]-[12]$/.test(term) || !item.course_name.trim()
    || item.course_name.trim().length > 200 || !item.credits || !Number.isFinite(item.credits)
    || item.credits <= 0 || item.credits > 30 || !item.grade
    || !['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'].includes(item.grade) || !item.area.trim()) return null;
  return { term, course_name: item.course_name.trim(), credits: item.credits, grade: item.grade, area: item.area.trim() };
}
