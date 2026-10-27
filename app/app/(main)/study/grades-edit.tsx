// ▶ FE 23번에 해당하는 부분: L-9 성적 수정 모드 (과목 삭제 −, 학기별 + 과목 추가하기 창, 수정 완료하기) — 화면은 components/GradesView.tsx
import { GradesScreen } from '../../../components/GradesView';

export default function GradesEdit() {
  return <GradesScreen editing />;
}
