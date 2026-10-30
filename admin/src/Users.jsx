// 계정 관리: 가입한 계정 목록·검색, 계정 삭제 (학생 앱 탈퇴와 같음)
import { useState } from 'react';

import { api, run, useLoad } from './api.js';
import { fmt, Loaded } from './ui.jsx';

const STATUS = { enrolled: '재학', leave: '휴학', returned: '복학' };

export default function Users() {
  const load = useLoad('/admin/users');
  const [q, setQ] = useState('');
  const remove = (u) => confirm(`${u.email} 계정을 지울까요?\n시간표·성적·대화 등 이 학생의 데이터가 모두 함께 지워지고 되돌릴 수 없어요.`)
    && run(() => api('DELETE', `/admin/users/${u.id}`), load.reload);

  return (
    <>
      <h1 className="title">계정 관리</h1>
      <section className="card">
        <Loaded load={load} empty="가입한 계정이 없어요.">
          {(rows) => {
            const shown = rows.filter((u) => [u.email, u.department].join(' ').toLowerCase().includes(q.trim().toLowerCase()));
            return (
              <>
                <div className="row-head">
                  <input type="search" placeholder="메일·학과 검색" aria-label="계정 검색" value={q} onChange={(e) => setQ(e.target.value)} />
                  <span>{shown.length} / {rows.length}명</span>
                </div>
                <table>
                  <thead><tr><th>메일</th><th>학과</th><th>학년</th><th>학적</th><th>가입</th><th>마지막 로그인</th><th /></tr></thead>
                  <tbody>{shown.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}{u.admin && <span className="tag">관리자</span>}</td>
                      <td>{u.department ?? <span className="note">처음 설정 전</span>}</td>
                      <td>{u.grade && u.grade + '학년'}</td>
                      <td>{STATUS[u.status]}</td>
                      <td>{fmt(u.created_at)}</td>
                      <td>{fmt(u.last_sign_in_at)}</td>
                      <td className="nowrap">{!u.admin && <button className="ghost small" onClick={() => remove(u)}>삭제</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </>
            );
          }}
        </Loaded>
      </section>
    </>
  );
}
