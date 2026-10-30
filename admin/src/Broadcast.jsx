// AD-4 공지 발송: 새 공지(대상 조건 → 자동 인원 → 학생 화면 미리보기 → 발송) · 보낸 공지(결과 보기, 내리기).
// 학생 앱 공지 목록에 '학생지원팀' 공지로 올라가고, 대상 학생에게 푸시.
import { useEffect, useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded, Modal, Tabs } from './ui.jsx';

const STATUSES = [['enrolled', '재학'], ['leave', '휴학'], ['returned', '복학']];
const EMPTY = { title: '', body: '', category: '일반', deadline: '', grades: [], departments: [], statuses: [] };
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function Broadcast() {
  const [tab, setTab] = useState('new');
  return (
    <>
      <h1 className="title">공지 발송</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['new', '새 공지'], ['sent', '보낸 공지']]} />
      {tab === 'new' ? <Compose onSent={() => setTab('sent')} /> : <Sent />}
    </>
  );
}

function Compose({ onSent }) {
  const [f, setF] = useState(EMPTY);
  const [count, setCount] = useState(null); // null 계산 중, false 불러오기 실패
  const [busy, setBusy] = useState(false);
  const grad = useLoad('/admin/graduation');
  const departments = [...new Set((grad.data ?? []).map((g) => g.department))];
  const target = { grades: f.grades, departments: f.departments, statuses: f.statuses };
  const targetKey = JSON.stringify(target);
  const set = (patch) => setF({ ...f, ...patch });

  useEffect(() => {
    let alive = true;
    setCount(null);
    const timer = setTimeout(() => api('POST', '/admin/broadcast/preview', target).then(
      (r) => alive && setCount(r.count),
      () => alive && setCount(false),
    ), 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [targetKey]);

  async function send(e) {
    e.preventDefault();
    const r = await run(() => api('POST', '/admin/broadcast/preview', target));
    if (!r) return;
    setCount(r.count);
    if (!r.count) return alert('조건에 맞는 학생이 없어요.');
    if (!confirm(`학생 ${r.count}명에게 보낼까요?\n알림을 끈 학생·조용한 시간인 학생은 앱 공지 목록에서만 보여요.\n이미 간 푸시는 되돌릴 수 없어요.`)) return;
    setBusy(true);
    await run(() => api('POST', '/admin/broadcast', {
      title: f.title, body: f.body, category: f.category,
      deadline: f.deadline ? new Date(f.deadline).toISOString() : null, target,
    }), () => { alert('발송을 시작했어요. 학생이 많으면 몇 분 걸릴 수 있어요.'); onSent(); });
    setBusy(false);
  }

  return (
    <div className="compose">
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
          <span className={'note' + (count === false ? ' bad' : '')} aria-live="polite">
            {count === null ? '대상 인원 계산 중…' : count === false ? '대상 인원을 불러오지 못했어요' : `대상 학생 ${count}명`}
          </span>
          <button className="primary" disabled={busy}>{busy ? '보내는 중…' : '발송'}</button>
        </div>
      </form>
      <Preview f={f} />
    </div>
  );
}

// 학생 앱 공지 상세(app/app/(main)/notices/[id].tsx)와 같은 순서·문구
function Preview({ f }) {
  return (
    <aside className="card preview" aria-label="학생 화면 미리보기">
      <p className="note">학생 화면 미리보기</p>
      <h2>[{f.category}] {f.title || '제목'}</h2>
      <p className="note">작성일 : {new Date().toLocaleDateString('ko-KR')} | 작성자 : 학생지원팀</p>
      <div className="answer">
        <strong>📌 핵심 내용</strong>{f.deadline && <span className="bad">   ⏰ {fmt(new Date(f.deadline).toISOString())} 마감</span>}
        <br />{f.body.trim().slice(0, 120) || '내용 앞부분 120자가 들어가요.'}
      </div>
      {f.body && <p className="preview-body">{f.body}</p>}
    </aside>
  );
}

function targetText(t) {
  const parts = [
    t.grades?.length && t.grades.join('·') + '학년',
    t.statuses?.length && t.statuses.map((s) => STATUSES.find(([k]) => k === s)?.[1] ?? s).join('·'),
    t.departments?.length && t.departments.join('·'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : '전체 학생';
}

function Sent() {
  const load = useLoad('/admin/broadcasts');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);

  async function retract(n) {
    if (!confirm(`'${n.title}' 공지를 내릴까요?\n학생 앱의 공지, 이 공지로 생긴 할 일과 신청 기록이 함께 지워지고 되돌릴 수 없어요.\n이미 간 푸시는 회수되지 않아요.`)) return;
    setBusy(n.id);
    await run(() => api('DELETE', `/admin/broadcasts/${n.id}`), () => { setOpen(null); load.reload(); });
    setBusy(null);
  }

  return (
    <section className="card">
      <p className="note">앱 목록은 공지가 보이는 학생 수, 알림은 앱 알림이 만들어진 학생 수예요. 발송 직후에는 숫자가 계속 늘어요.</p>
      <Loaded load={load} empty="아직 보낸 공지가 없어요.">
        {(rows) => (
          <table>
            <thead><tr><th>보낸 때</th><th>제목</th><th>대상</th><th>앱 목록</th><th>알림</th><th /></tr></thead>
            <tbody>{rows.map((n) => (
              <tr key={n.id}>
                <td>{fmt(n.posted_at)}</td>
                <td>{n.title}<span className="tag">{n.category}</span></td>
                <td>{targetText(n.target)}</td>
                <td>{n.listed}명</td><td>{n.notified}명</td>
                <td className="nowrap">
                  <button className="soft small" onClick={() => setOpen(n)}>내용 보기</button>{' '}
                  <button className="ghost small" disabled={busy === n.id} onClick={() => retract(n)}>{busy === n.id ? '내리는 중…' : '내리기'}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Loaded>
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          <p className="note">{open.category} · {fmt(open.posted_at)} · {targetText(open.target)}{open.deadline && ` · ${fmt(open.deadline)} 마감`}</p>
          <p className="preview-body">{open.body}</p>
          <div className="actions"><button className="ghost" onClick={() => setOpen(null)}>닫기</button></div>
        </Modal>
      )}
    </section>
  );
}
