// 분실물: 학생이 올린 습득물 전체(보관 장소 포함) 보기, 부적절한 글 지우기
import { useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded, Tabs } from './ui.jsx';

export default function LostItems() {
  const [status, setStatus] = useState('open');
  const load = useLoad('/admin/lost-items' + (status === 'all' ? '' : '?status=' + status));
  const remove = (it) => confirm(`'${it.title}' 글을 지울까요?\n사진과 함께 지워지고 되돌릴 수 없어요.`)
    && run(() => api('DELETE', `/admin/lost-items/${it.id}`), load.reload);

  return (
    <>
      <h1 className="title">분실물</h1>
      <p className="note">학생이 올린 습득물이에요. 보관 장소는 학생 앱에서 확인 질문을 맞힌 학생에게만 보여요.</p>
      <Tabs value={status} onChange={setStatus} tabs={[['open', '보관 중'], ['closed', '전달 완료'], ['all', '전체']]} />
      <section className="card">
        <Loaded load={load} empty="올라온 습득물이 없어요.">
          {(rows) => (
            <table>
              <thead><tr><th>사진</th><th>물건</th><th>종류</th><th>주운 곳 · 날</th><th>보관 장소</th><th>상태</th><th>올린 때</th><th /></tr></thead>
              <tbody>{rows.map((it) => (
                <tr key={it.id}>
                  <td>{it.image_url && <a href={it.image_url} target="_blank" rel="noreferrer"><img src={it.image_url} alt={it.title} width="48" height="48" style={{ objectFit: 'cover', borderRadius: 8 }} /></a>}</td>
                  <td>{it.title}</td><td>{it.category}</td>
                  <td>{it.place} · {it.found_on}</td><td>{it.storage_place}</td>
                  <td>{it.status === 'open' ? '보관 중' : '전달 완료'}</td><td>{fmt(it.created_at)}</td>
                  <td className="nowrap"><button className="ghost small" onClick={() => remove(it)}>삭제</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loaded>
      </section>
    </>
  );
}
