// 공지 수집 상태: 학교 게시판에서 모은 공지 중 확인이 필요한 것을 먼저 보여 줌
import { useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded, Tabs } from './ui.jsx';

const STATUS = { pending: '처리 중', ready: '정리 완료', failed: '확인 필요' };
const HELP = {
  failed: 'AI가 내용을 못 읽은 공지예요. 학생에게 안 보여요. 다음 수집 때 자동으로 다시 시도하고, 급하면 다시 정리를 눌러 주세요.',
  pending: '새로 모은 공지예요. AI가 대상·마감을 정리하면 대상 학생에게 보여요. 한 번에 20건씩 정리해서 많으면 다음 수집 때로 넘어가요.',
  all: '학교 게시판에서 모은 최근 100건이에요. 정리 완료된 공지는 판정이 끝나면 대상 학생의 앱 공지 목록에 들어가요.',
};

export default function Notices() {
  const [status, setStatus] = useState('failed');
  const load = useLoad('/admin/notices' + (status === 'all' ? '' : '?status=' + status));
  const stats = useLoad('/admin/notices/stats');
  const [busy, setBusy] = useState(null);
  const s = stats.data;

  async function retry(id) {
    setBusy(id);
    await run(() => api('POST', `/admin/notices/${id}/retry`),
      (r) => {
        alert(r.ready ? '다시 정리했어요. 다음 정기 작업 때 대상 학생에게 보여요.' : '이번에도 정리하지 못했어요. 원문을 확인해 주세요.');
        load.reload();
        stats.reload();
      });
    setBusy(null);
  }

  return (
    <>
      <h1 className="title">공지 수집</h1>
      <p className="note intro">학교 게시판 공지를 9·13·18시에 모으고 AI가 대상·마감을 정리해요.{s?.last_collected_at && ` 마지막 새 공지: ${fmt(s.last_collected_at)}`}</p>
      {stats.error && <p className="note bad intro">{stats.error}</p>}
      <div className="stats">
        <div className="card"><span>오늘 모은 공지</span><strong>{s?.today ?? '-'}</strong></div>
        <div className="card"><span>오늘 정리 완료</span><strong>{s?.today_ready ?? '-'}</strong></div>
        <div className="card"><span>확인 필요</span><strong className={s?.failed ? 'bad' : ''}>{s?.failed ?? '-'}</strong></div>
      </div>
      <Tabs value={status} onChange={setStatus} tabs={[
        ['failed', `확인 필요 ${s?.failed ?? ''}`], ['pending', `처리 중 ${s?.pending ?? ''}`], ['all', '전체']]} />
      <section className="card">
        <p className="note intro">{HELP[status]}</p>
        <Loaded load={load} empty={status === 'failed' ? '확인할 공지가 없어요.' : '해당하는 공지가 없어요.'}>
          {(rows) => (
            <table>
              <thead><tr><th>제목</th><th>분류</th><th>올라온 때</th><th>상태</th><th /></tr></thead>
              <tbody>{rows.map((n) => (
                <tr key={n.id}>
                  <td>{n.title}</td>
                  <td>{n.category}</td><td>{fmt(n.posted_at)}</td>
                  <td className={n.extraction_status === 'failed' ? 'bad' : ''}>{STATUS[n.extraction_status]}</td>
                  <td className="nowrap">
                    <a href={n.url} target="_blank" rel="noreferrer">원문</a>{' '}
                    {n.extraction_status !== 'ready' && (
                      <button className="soft small" disabled={busy === n.id} onClick={() => retry(n.id)}>{busy === n.id ? '정리 중…' : '다시 정리'}</button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loaded>
      </section>
    </>
  );
}
