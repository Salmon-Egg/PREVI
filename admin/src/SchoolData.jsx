// AD-5 학교 자료: 학사일정·과목은 추가/수정/삭제, 졸업 기준은 보기만 (틀리면 학생 졸업 계산이 다 틀어짐)
import { useRef, useState } from 'react';

import { api, run, useLoad } from './api.js';
import { toBase64 } from './Chatbot.jsx';
import { Loaded, Modal, Tabs } from './ui.jsx';

// [칸, 이름, 입력 종류, 화면 → 서버 값, 서버 값 → 화면]
const nums = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean).map(Number);
const SPECS = {
  calendar: {
    label: '학사일정', blank: { title: '', start_date: '', end_date: '', target_grades: [], source_url: '' },
    fields: [
      ['title', '제목', 'text'], ['start_date', '시작일', 'date'], ['end_date', '종료일', 'date'],
      ['target_grades', '대상 학년 (쉼표, 비우면 전체)', 'text', nums, (v) => v.join(',')],
      ['source_url', '근거 주소', 'url'],
    ],
    show: (r) => [r.title, `${r.start_date} ~ ${r.end_date}`, r.target_grades.length ? r.target_grades.join('·') + '학년' : '전체'],
    head: ['제목', '기간', '대상'],
  },
  courses: {
    label: '과목', blank: { name: '', credits: 3, area: '', times: [] },
    fields: [
      ['name', '과목명', 'text'], ['credits', '학점', 'number', Number], ['area', '이수 구분', 'text'],
      ['times', '수업 시간 (JSON, 시간표와 같은 모양)', 'json', (s) => JSON.parse(s || '[]'), (v) => JSON.stringify(v)],
    ],
    show: (r) => [r.name, r.credits, r.area],
    head: ['과목명', '학점', '이수 구분'],
  },
};

export default function SchoolData() {
  const [tab, setTab] = useState('calendar');
  return (
    <>
      <h1 className="title">학교 자료</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['calendar', '학사일정'], ['courses', '과목'], ['graduation', '졸업 기준']]} />
      {tab === 'graduation' ? <Graduation /> : <Editable key={tab} kind={tab} />}
    </>
  );
}

/** 학교 강의시간표 HWP를 올리면 서버가 표를 읽어 시간표 검색 과목을 채움 */
function CourseFile({ onDone }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  function upload(e) {
    const file = e.target.files[0];
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return alert('20MB 이하 파일만 올릴 수 있어요.');
    setBusy(true);
    run(async () => {
      try {
        const r = await api('POST', '/admin/courses/import', { filename: file.name, content_base64: await toBase64(file) });
        const names = r.skipped.slice(0, 20).join(', ') + (r.skipped.length > 20 ? ' 등' : '');
        alert(`새 과목 ${r.added}개를 넣었어요. 이미 있던 과목 ${r.duplicates}개는 그대로 뒀어요.`
          + (r.skipped.length ? `\n\n수업 시간·학점을 읽을 수 없어 건너뛴 과목 ${r.skipped.length}개:\n${names}` : ''));
      } finally {
        setBusy(false);
      }
    }, onDone);
  }
  return (
    <>
      <input ref={input} type="file" accept=".hwp" hidden aria-label="강의시간표 파일" onChange={upload} />
      <button className="soft" disabled={busy} onClick={() => input.current.click()}>{busy ? '읽는 중…' : '강의시간표 올리기 (HWP)'}</button>
    </>
  );
}

function Editable({ kind }) {
  const spec = SPECS[kind];
  const [q, setQ] = useState('');
  const load = useLoad(`/admin/data/${kind}?q=${encodeURIComponent(q)}`);
  const [editing, setEditing] = useState(null); // 행 또는 blank
  const remove = (r) => confirm('지울까요? 학생 앱에서도 바로 사라져요.') && run(() => api('DELETE', `/admin/data/${kind}/${r.id}`), load.reload);
  return (
    <section className="card">
      <div className="row-head">
        <input type="search" placeholder="검색" aria-label={spec.label + ' 검색'} value={q} onChange={(e) => setQ(e.target.value)} />
        {kind === 'courses' && <CourseFile onDone={load.reload} />}
        <button className="primary" onClick={() => setEditing(spec.blank)}>{spec.label} 추가</button>
      </div>
      <Loaded load={load}>
        {(rows) => (
          <table>
            <thead><tr>{spec.head.map((h) => <th key={h}>{h}</th>)}<th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                {spec.show(r).map((v, i) => <td key={i}>{v}</td>)}
                <td className="nowrap"><button className="soft small" onClick={() => setEditing(r)}>수정</button> <button className="ghost small" onClick={() => remove(r)}>삭제</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Loaded>
      {editing && <EditModal kind={kind} row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load.reload(); }} />}
    </section>
  );
}

function EditModal({ kind, row, onClose, onSaved }) {
  const { label, fields } = SPECS[kind];
  const [v, setV] = useState(Object.fromEntries(fields.map(([k, , , , out]) => [k, out ? out(row[k]) : row[k]])));
  async function save(e) {
    e.preventDefault();
    let body;
    try {
      body = Object.fromEntries(fields.map(([k, , , into]) => [k, into ? into(v[k]) : v[k]]));
    } catch {
      return alert('수업 시간 JSON 형식을 확인해 주세요.');
    }
    await run(() => (row.id ? api('PUT', `/admin/data/${kind}/${row.id}`, body) : api('POST', `/admin/data/${kind}`, body)), onSaved);
  }
  return (
    <Modal title={`${label} ${row.id ? '수정' : '추가'}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {fields.map(([k, name, type]) => (
          <label key={k}>{name}
            {type === 'json'
              ? <textarea rows={4} className="mono" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              : <input type={type} step={type === 'number' ? '0.5' : undefined} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  required={k !== 'target_grades'} />}
          </label>
        ))}
        <div className="actions"><button type="button" className="ghost" onClick={onClose}>취소</button><button className="primary">저장</button></div>
      </form>
    </Modal>
  );
}

function Graduation() {
  const load = useLoad('/admin/graduation');
  const [open, setOpen] = useState(null);
  return (
    <section className="card">
      <p className="note">졸업 기준은 공식 요람을 확인해 BE가 넣어요. 여기서는 보기만 해요.</p>
      <Loaded load={load}>
        {(rows) => (
          <table>
            <thead><tr><th>학과</th><th>입학년도</th><th>총 학점</th><th>필수 과목</th><th>인증</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.department}</td><td>{r.admission_year}</td><td>{r.total_credits}</td>
                <td>{r.required_courses.length}개</td>
                <td>
                  <button className="link" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{r.certifications.length}개 · {open === r.id ? '접기' : '자세히'}</button>
                  {open === r.id && <pre>{JSON.stringify({ 영역: r.areas, 필수: r.required_courses, 인증: r.certifications }, null, 2)}</pre>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Loaded>
    </section>
  );
}
