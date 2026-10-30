// 공지 수집 상태: AI 정리 실패한 공지를 다시 정리
import { useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded, Tabs } from './ui.jsx';

const STATUS = { pending: '정리 대기', ready: '정리 완료', failed: '정리 실패' };

export default function Notices() {
  const [status, setStatus] = useState('failed');
  const load = useLoad('/admin/notices' + (status === 'all' ? '' : '?status=' + status));
  const [busy, setBusy] = useState(null);

  async function retry(id) {
    setBusy(id);
    await run(() => api('POST', `/admin/notices/${id}/retry`),
      (r) => { alert(r.ready ? '다시 정리했어요.' : '이번에도 정리하지 못했어요. 원문을 확인해 주세요.'); load.reload(); });
    setBusy(null);
  }

  return (
    <>
      <h1 className="title">공지 수집</h1>
      <p className="note">학교 게시판 공지를 하루 세 번 모으고 AI가 대상·마감을 정리해요. 실패한 공지는 학생에게 안 보여요.</p>
      <Tabs value={status} onChange={setStatus} tabs={[['failed', '정리 실패'], ['pending', '정리 대기'], ['all', '최근 100건']]} />
      <section className="card">
        <Loaded load={load} empty="해당하는 공지가 없어요.">
          {(rows) => (
            <table>
              <thead><tr><th>제목</th><th>분류</th><th>올라온 때</th><th>상태</th><th /></tr></thead>
              <tbody>{rows.map((n) => (
                <tr key={n.id}>
                  <td>{n.title}{n.board_post_id.startsWith('admin-') && <span className="tag">학생지원팀</span>}</td>
                  <td>{n.category}</td><td>{fmt(n.posted_at)}</td>
                  <td className={n.extraction_status === 'failed' ? 'bad' : ''}>{STATUS[n.extraction_status]}</td>
                  <td>{n.extraction_status !== 'ready' && (
                    <button className="soft small" disabled={busy === n.id} onClick={() => retry(n.id)}>{busy === n.id ? '정리 중…' : '다시 정리'}</button>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loaded>
      </section>
    </>
  );
}
