// AD-2·AD-3 AI 챗봇 관리 (시안 4): 못한 질문 · 아쉬워요 · 참고 자료
import { useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded, Modal, Tabs } from './ui.jsx';

const CAUSES = { no_document: '관련 문서 없음', outdated: '정보가 오래됨', ambiguous: '규정이 모호함', notice_missing: '새 공지 미수집' };
// 원인별 바로가기 버튼 (시안의 문서 추가 / 업데이트 / 답변 작성 / 공지 연결)
const ACTION = { no_document: '문서 추가', outdated: '업데이트', ambiguous: '답변 작성', notice_missing: '공지 연결' };

export default function Chatbot() {
  const [tab, setTab] = useState(location.hash.includes('?feedback') ? 'feedback' : 'open');
  const [answering, setAnswering] = useState(null); // { question, ids }
  const summary = useLoad('/admin/summary');
  const s = summary.data;
  return (
    <>
      <h1 className="title">AI 챗봇 관리</h1>
      <section className="stats two">
        <div className="card"><span>답변 성공률 · 7일</span><strong className="green">{s?.answer_rate ?? '—'}<small>{s?.answer_rate != null && '%'}</small></strong><span>질문 {s?.questions_week ?? '—'}건</span></div>
        <div className="card alert"><span>답하지 못한 질문</span><strong className="bad">{s?.unanswered_open ?? '—'}<small>건</small></strong><span>'아쉬워요' {s?.feedback_down_week ?? '—'}건 · 7일</span></div>
      </section>
      <Tabs value={tab} onChange={setTab} tabs={[['open', '못한 질문'], ['feedback', '아쉬워요'], ['docs', '참고 자료'], ['done', '처리 완료']]} />
      {tab === 'open' && <Unanswered status="open" onAnswer={setAnswering} onDocs={() => setTab('docs')} onChanged={summary.reload} />}
      {tab === 'done' && <Unanswered status="done" onChanged={summary.reload} />}
      {tab === 'feedback' && <Feedback onAnswer={setAnswering} />}
      {tab === 'docs' && <Documents />}
      {answering && <AnswerModal {...answering} onClose={() => setAnswering(null)} onSaved={() => { setAnswering(null); summary.reload(); }} />}
    </>
  );
}

function Unanswered({ status, onAnswer, onDocs, onChanged }) {
  const load = useLoad('/admin/unanswered?status=' + status);
  const patch = (ids, values) => run(() => api('PATCH', '/admin/unanswered', { ids, ...values }), () => { load.reload(); onChanged(); });
  return (
    <section className="card list">
      <Loaded load={load} empty={status === 'open' ? '답하지 못한 질문이 없어요.' : '처리한 질문이 없어요.'}>
        {(groups) => groups.map((g) => (
          <div key={g.ids[0]} className="item">
            <div className="grow">
              <b>{g.question}</b>
              <span><em className={g.count >= 10 ? 'bad' : ''}>{g.count}회</em> · {fmt(g.last_at)}</span>
            </div>
            <select aria-label="원인" value={g.cause ?? ''} onChange={(e) => patch(g.ids, { cause: e.target.value || null })}>
              <option value="">원인 선택</option>
              {Object.entries(CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {status === 'open' ? (
              <>
                <button className={g.count >= 10 ? 'primary' : 'soft'} onClick={() => {
                  if (g.cause === 'no_document' || g.cause === 'outdated') onDocs();
                  else if (g.cause === 'notice_missing') location.hash = '/notices';
                  else onAnswer({ question: g.question, ids: g.ids });
                }}>{ACTION[g.cause] ?? '답변 작성'}</button>
                <button className="ghost" onClick={() => patch(g.ids, { status: 'done' })}>처리 완료</button>
              </>
            ) : <button className="ghost" onClick={() => patch(g.ids, { status: 'open' })}>되돌리기</button>}
          </div>
        ))}
      </Loaded>
    </section>
  );
}

function Feedback({ onAnswer }) {
  const load = useLoad('/admin/feedback');
  return (
    <section className="card list">
      <Loaded load={load} empty="최근 30일 동안 '아쉬워요'를 받은 답이 없어요.">
        {(rows) => rows.map((r) => (
          <div key={r.id} className="item">
            <div className="grow">
              <b>{r.question ?? '(질문 없음)'}</b>
              <p className="answer">{r.answer}</p>
              <span>{fmt(r.created_at)}</span>
            </div>
            {r.question && <button className="soft" onClick={() => onAnswer({ question: r.question, ids: [] })}>답변 작성</button>}
          </div>
        ))}
      </Loaded>
    </section>
  );
}

function AnswerModal({ question, ids, onClose, onSaved }) {
  const [q, setQ] = useState(question);
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await run(() => api('POST', '/admin/answers', { question: q, answer: a, ids }), onSaved);
    setBusy(false);
  }
  return (
    <Modal title="답변 작성" onClose={onClose}>
      <form onSubmit={save} className="form">
        <p className="note">저장하면 챗봇이 이 답을 학교 자료처럼 찾아서 근거로 써요.{ids.length > 0 && ` 같은 질문 ${ids.length}건은 처리 완료로 바뀌어요.`}</p>
        <label>질문<input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} required /></label>
        <label>답변<textarea rows={6} value={a} onChange={(e) => setA(e.target.value)} maxLength={2000} required placeholder="학생에게 알려 줄 정확한 내용 (담당 부서, 기간, 링크 등)" /></label>
        <div className="actions"><button type="button" className="ghost" onClick={onClose}>취소</button><button className="primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button></div>
      </form>
    </Modal>
  );
}

export const toBase64 = (file) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = fail;
  r.readAsDataURL(file);
});

function Documents() {
  const load = useLoad('/admin/documents');
  const [form, setForm] = useState({ title: '', kind: '규정', url: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    e.preventDefault();
    if (file.size > 20 * 1024 * 1024) return alert('20MB 이하 파일만 올릴 수 있어요.');
    setBusy(true);
    await run(async () => api('POST', '/admin/documents', {
      ...form, url: form.url || null, filename: file.name, content_base64: await toBase64(file),
    }), (r) => { alert(`문단 ${r.chunks}개로 나눠 저장했어요.`); e.target.reset(); setForm({ title: '', kind: '규정', url: '' }); load.reload(); });
    setBusy(false);
  }
  const remove = (d) => confirm(`'${d.title}'을 지울까요? 챗봇이 더는 이 문서를 근거로 쓰지 않아요.`)
    && run(() => api('DELETE', '/admin/documents/' + d.id), load.reload);

  return (
    <>
      <form className="card form inline" onSubmit={upload}>
        <h2>문서 올리기</h2>
        <label>제목<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required placeholder="예: 2027 학사요람 · 학칙" /></label>
        <label>종류<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          {['학사요람', '규정', '공지', '기타'].map((k) => <option key={k}>{k}</option>)}
        </select></label>
        <label>원문 주소 (선택)<input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.skuniv.ac.kr/…" /></label>
        <label>파일 (PDF·TXT·MD)<input type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files[0])} required /></label>
        <button className="primary" disabled={busy}>{busy ? '나누고 저장하는 중…' : '올리기'}</button>
        <p className="note">글자가 있는 PDF만 돼요 (스캔 이미지는 안 됨). 같은 문서를 새로 올리면 옛 문서는 지워 주세요.</p>
      </form>
      <section className="card">
        <Loaded load={load} empty="올린 문서가 없어요.">
          {(docs) => (
            <table>
              <thead><tr><th>제목</th><th>종류</th><th>문단</th><th>올린 날</th><th /></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</td>
                  <td>{d.kind}</td><td>{d.chunks}</td><td>{fmt(d.created_at)}</td>
                  <td><button className="ghost small" onClick={() => remove(d)}>삭제</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loaded>
      </section>
    </>
  );
}
