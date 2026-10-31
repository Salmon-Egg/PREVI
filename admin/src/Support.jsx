// 고객센터: 학생 문의 보기·답변. 저장하면 학생 앱 고객센터에 보이고 알림이 감 (누가 보냈는지는 안 보임)
import { useState } from 'react';

import { api, useLoad } from './api.js';
import { fmt, Loaded, Modal, Tabs } from './ui.jsx';

export default function Support() {
  const [status, setStatus] = useState('open');
  const [answering, setAnswering] = useState(null);
  const load = useLoad('/admin/support?status=' + status);

  return (
    <>
      <h1 className="title">고객센터</h1>
      <p className="note">학생이 앱에서 보낸 문의예요. 누가 보냈는지는 보이지 않아요.</p>
      <Tabs value={status} onChange={setStatus} tabs={[['open', '답변 대기'], ['done', '답변 완료']]} />
      <section className="card">
        <Loaded load={load} empty={status === 'open' ? '답변할 문의가 없어요.' : '답변한 문의가 없어요.'}>
          {(rows) => (
            <table>
              <thead><tr><th>종류</th><th>제목</th><th>내용</th>{status === 'done' && <th>답변</th>}<th>받은 때</th><th /></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{t.category}</td><td>{t.title}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{t.body}</td>
                  {status === 'done' && <td style={{ whiteSpace: 'pre-wrap' }}>{t.answer}</td>}
                  <td className="nowrap">{fmt(t.created_at)}</td>
                  <td className="nowrap"><button className="ghost small" onClick={() => setAnswering(t)}>{t.answer === null ? '답변' : '수정'}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loaded>
      </section>
      {answering && <AnswerModal ticket={answering} onClose={() => setAnswering(null)} onSaved={() => { setAnswering(null); load.reload(); }} />}
    </>
  );
}

function AnswerModal({ ticket, onClose, onSaved }) {
  const [answer, setAnswer] = useState(ticket.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('PUT', `/admin/support/${ticket.id}`, { answer });
      onSaved();
    } catch (err) {
      setError(err.message); // 쓴 답변을 지우지 않고 창에 남김
      setBusy(false);
    }
  }
  return (
    <Modal title="문의 답변" onClose={onClose}>
      <form onSubmit={save} className="form">
        <p className="note"><b>{ticket.title}</b><br /><span style={{ whiteSpace: 'pre-wrap' }}>{ticket.body}</span></p>
        <label>답변<textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={2000} required /></label>
        {error && <p className="note bad" role="alert">{error}</p>}
        <div className="actions"><button type="button" className="ghost" onClick={onClose}>취소</button><button className="primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button></div>
      </form>
    </Modal>
  );
}
