// AD-4 공지 발송: 대상 조건 → 인원 확인 → 발송. 학생 앱 공지 목록에 '학생지원팀' 공지로 올라가고, 대상 학생에게 푸시.
import { useState } from 'react';

import { api, run, useLoad } from './api.js';

const STATUSES = [['enrolled', '재학'], ['leave', '휴학'], ['returned', '복학']];
const EMPTY = { title: '', body: '', category: '일반', deadline: '', grades: [], departments: [], statuses: [] };
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function Broadcast() {
  const [f, setF] = useState(EMPTY);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const grad = useLoad('/admin/graduation');
  const departments = [...new Set((grad.data ?? []).map((g) => g.department))];
  const target = { grades: f.grades, departments: f.departments, statuses: f.statuses };
  const set = (patch) => { setF({ ...f, ...patch }); if ('grades' in patch || 'departments' in patch || 'statuses' in patch) setCount(null); };

  const preview = () => run(() => api('POST', '/admin/broadcast/preview', target), (r) => setCount(r.count));

  async function send(e) {
    e.preventDefault();
    const r = await run(() => api('POST', '/admin/broadcast/preview', target));
    if (!r) return;
    setCount(r.count);
    if (!r.count) return alert('조건에 맞는 학생이 없어요.');
    if (!confirm(`학생 ${r.count}명에게 보낼까요?\n알림을 끈 학생·조용한 시간인 학생은 앱 공지 목록에서만 보여요.\n보낸 뒤에는 되돌릴 수 없어요.`)) return;
    setBusy(true);
    await run(() => api('POST', '/admin/broadcast', {
      title: f.title, body: f.body, category: f.category,
      deadline: f.deadline ? new Date(f.deadline).toISOString() : null, target,
    }), () => { alert('발송을 시작했어요. 학생이 많으면 몇 분 걸릴 수 있어요.'); setF(EMPTY); setCount(null); });
    setBusy(false);
  }

  return (
    <>
      <h1 className="title">공지 발송</h1>
      <form className="card form" onSubmit={send}>
        <label>제목<input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required /></label>
        <label>내용<textarea rows={7} value={f.body} onChange={(e) => set({ body: e.target.value })} maxLength={5000} required /></label>
        <div className="grid2">
          <label>분류<select value={f.category} onChange={(e) => set({ category: e.target.value })}>
            {['일반', '학사', '장학'].map((c) => <option key={c}>{c}</option>)}
          </select></label>
          <label>마감 (선택)<input type="datetime-local" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /></label>
        </div>
        <p className="note">학사·장학 공지에 마감을 넣으면 대상 학생의 할 일에도 들어가요.</p>

        <fieldset>
          <legend>대상 학년 <small>(안 고르면 전체)</small></legend>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <label key={g} className="chip"><input type="checkbox" checked={f.grades.includes(g)} onChange={() => set({ grades: toggle(f.grades, g) })} />{g}학년</label>
          ))}
        </fieldset>
        <fieldset>
          <legend>대상 학적 <small>(안 고르면 전체 · 재학을 고르면 복학생도 포함)</small></legend>
          {STATUSES.map(([k, v]) => (
            <label key={k} className="chip"><input type="checkbox" checked={f.statuses.includes(k)} onChange={() => set({ statuses: toggle(f.statuses, k) })} />{v}</label>
          ))}
        </fieldset>
        <fieldset>
          <legend>대상 학과 <small>(안 고르면 전체)</small></legend>
          {departments.map((d) => (
            <label key={d} className="chip"><input type="checkbox" checked={f.departments.includes(d)} onChange={() => set({ departments: toggle(f.departments, d) })} />{d}</label>
          ))}
          {!departments.length && <p className="note">학과 목록을 불러오는 중…</p>}
        </fieldset>

        <div className="actions">
          <span className="note">{count == null ? '' : `대상 학생 ${count}명`}</span>
          <button type="button" className="ghost" onClick={preview}>대상 인원 확인</button>
          <button className="primary" disabled={busy}>{busy ? '보내는 중…' : '발송'}</button>
        </div>
      </form>
    </>
  );
}
