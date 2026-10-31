// 작은 공용 부품: 아이콘, 탭, 창, 불러오기 상태
import { useEffect, useRef } from 'react';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.6A8.4 8.4 0 1 1 21 11.5z',
  send: 'M3 11v2l13 5V6zM16 6l4-2v16l-4-2M7 12.5V18a2 2 0 0 0 4 0v-4',
  data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  chevron:'m9 18 6-6-6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} className={value === key ? 'on' : ''} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  // 브라우저 dialog: Esc로 닫기, 창 안에서만 Tab 이동, 닫으면 포커스 복귀
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** 불러오는 중 / 오류 / 비어 있음 처리 후 children(data) */
export function Loaded({ load, empty = '아직 없어요.', children }) {
  if (load.error) return <p className="note bad">{load.error} <button className="link" onClick={load.reload}>다시 시도</button></p>;
  if (!load.data) return <p className="note">불러오는 중…</p>;
  if (Array.isArray(load.data) && !load.data.length) return <p className="note">{empty}</p>;
  return children(load.data);
}

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
