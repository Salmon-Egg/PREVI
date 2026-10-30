// 관리자 웹: 로그인 → 관리자 확인(서버 ADMIN_EMAILS) → 왼쪽 메뉴 + 화면. 주소는 #/home 처럼 해시로.
import { useEffect, useState } from 'react';

import { api, supabase, useLoad } from './api.js';
import Broadcast from './Broadcast.jsx';
import Chatbot from './Chatbot.jsx';
import LostItems from './LostItems.jsx';
import Notices from './Notices.jsx';
import SchoolData from './SchoolData.jsx';
import { Icon, Loaded } from './ui.jsx';
import Users from './Users.jsx';

const MENU = [
  ['home', '처리할 일', 'home'],
  ['chatbot', 'AI 챗봇', 'chat'],
  ['broadcast', '공지 발송', 'send'],
  ['data', '학교 자료', 'data'],
  ['notices', '공지 수집', 'inbox'],
  ['lost', '분실물', 'search'],
  ['users', '계정 관리', 'users'],
];
const PAGES = { chatbot: Chatbot, broadcast: Broadcast, data: SchoolData, notices: Notices, lost: LostItems, users: Users };

function useHash() {
  const read = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  const [page, setPage] = useState(read);
  useEffect(() => {
    const on = () => setPage(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return page;
}
export const go = (page) => { location.hash = '/' + page; };

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = 확인 중
  const [denied, setDenied] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    // 관리자 여부는 서버만 앎: 403이면 바로 로그아웃
    api('GET', '/admin/summary').catch((e) => {
      if (e.status === 401 || e.status === 403) {
        setDenied(e.message);
        supabase.auth.signOut();
      }
    });
  }, [session]);

  if (session === undefined) return null;
  if (!session) return <Login denied={denied} onTry={() => setDenied('')} />;
  return <Shell email={session.user.email} />;
}

function Login({ denied, onTry }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    onTry();
    const loginEmail = email.trim() === 'test_admin' ? 'test_admin@example.com' : email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) return setError('관리자 이메일 또는 시연용 아이디를 입력해 주세요.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);
    setError(error ? (error.status === 400 ? '메일 또는 비밀번호가 맞지 않아요.' : '로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요.') : '');
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>PREVI <span className="badge">관리자</span></h1>
        <p className="sub">학생지원팀 관리자 메일로 로그인해 주세요.</p>
        <label>이메일 또는 아이디<input type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {(error || denied) && <p className="note bad" role="alert">{error || denied}</p>}
        <button className="primary" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </main>
  );
}

function Shell({ email }) {
  const page = useHash();
  const Page = PAGES[page] ?? Home;
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">PREVI <span className="badge">관리자</span></div>
        {MENU.map(([key, label, icon]) => (
          <a key={key} href={'#/' + key} className={page === key ? 'on' : ''} aria-current={page === key ? 'page' : undefined}>
            <Icon name={icon} size={20} />{label}
          </a>
        ))}
        <div className="who">
          <span>{email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}><Icon name="logout" size={16} /> 로그아웃</button>
        </div>
      </nav>
      <main className="content"><Page /></main>
    </div>
  );
}

// AD-1 처리할 일 현황 (시안 1)
function Home() {
  const load = useLoad('/admin/summary');
  const today = new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
  return (
    <Loaded load={load}>
      {(s) => {
        const todo = [
          ['chatbot', s.unanswered_open, 'AI가 답하지 못한 질문', '문서 추가나 답변 작성이 필요해요', '처리 대기'],
          ['chatbot?feedback', s.feedback_down_week, "학생이 '아쉬워요'를 누른 답", '이번 주', '이번 주'],
          ['notices', s.notice_failed, '공지 AI 정리 실패', '다시 정리를 눌러 주세요', '긴급'],
          ['notices', s.push_failed_week, '푸시 알림 실패', '학생 폰 알림 설정·토큰 확인 (7일)', '7일'],
        ].filter((t) => t[1] > 0);
        const total = todo.reduce((n, t) => n + t[1], 0);
        return (
          <>
            <header className="hero">
              <p>{today} · 학생지원팀</p>
              <h1>{total ? `처리할 일이 ${total}건 있어요` : '지금 처리할 일이 없어요'}</h1>
            </header>
            <section className="quick card">
              {MENU.slice(1).map(([key, label, icon]) => (
                <a key={key} href={'#/' + key}>
                  <span className="qi"><Icon name={icon} />{key === 'chatbot' && s.unanswered_open > 0 && <b>{s.unanswered_open}</b>}</span>
                  {label}
                </a>
              ))}
            </section>
            <section className="stats">
              <div className="card"><span>가입 학생</span><strong>{s.students}<small>명</small></strong></div>
              <div className="card"><span>이번 주 질문</span><strong>{s.questions_week}<small>건</small></strong></div>
              <div className="card"><span>답변 성공률 · 7일</span><strong className="green">{s.answer_rate ?? '—'}<small>{s.answer_rate != null && '%'}</small></strong></div>
            </section>
            <section className="card">
              <div className="row-head"><h2>처리가 필요해요</h2><span>{todo.length}종류</span></div>
              {todo.length ? todo.map(([to, n, title, sub, tag]) => (
                <a key={title} className="todo" href={'#/' + to}>
                  <em className={tag === '긴급' ? 'bad' : ''}>{tag}</em>
                  <div><b>{title} {n}건</b><span>{sub}</span></div>
                  <Icon name="chevron" size={18} />
                </a>
              )) : <p className="note">모두 처리했어요.</p>}
            </section>
          </>
        );
      }}
    </Loaded>
  );
}
