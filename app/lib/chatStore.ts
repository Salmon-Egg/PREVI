// ▶ FE 30번·31번에 해당하는 부분: 지금 보고 있는 대화(대화 번호·메시지·답 기다리는 중)를 화면 밖에 보관
// 답을 기다리다 채팅 화면을 나가도 요청은 계속되고, 돌아오면 받은 답이 그대로 보임.
// 홈 대화창(ChatSheet)과 채팅 화면(chat/index)이 같은 대화를 봄. 로그인한 사람이 바뀌면 비움
import { useSyncExternalStore } from 'react';

import { showAlert } from '../components/ui';
import { api, ApiError } from './api';
import { getToken } from './session';
import type { ChatReply, Message } from './types';

export type ChatContext = { kind: string; id: number } | null;
type ChatState = { owner: string | null; convId: number | null; messages: Message[]; waiting: boolean };

const empty = (): ChatState => ({ owner: getToken(), convId: null, messages: [], waiting: false });
let state = empty();
const listeners = new Set<() => void>();

function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** 다른 사람으로 로그인했으면 이전 대화를 보이지 않게 */
function snapshot() {
  if (state.owner !== getToken()) state = empty();
  return state;
}

export function useChat() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
  );
}

/** 새 대화로 시작 (다른 화면에서 질문을 들고 왔을 때) */
export function newChat() {
  set(empty());
}

/** 대화 기록(H-3)·'답변 도착' 푸시에서 연 이전 대화 불러오기 */
export async function loadChat(id: number) {
  set({ ...empty(), convId: id });
  try {
    const c = await api.get<{ messages: Message[] }>(`/conversations/${id}`);
    if (state.convId === id) set({ messages: c.messages });
  } catch (e) {
    showAlert('이전 대화를 불러오지 못했어요', (e as ApiError).message);
  }
}

/** 질문 보내기. 화면이 사라져도 끝까지 받아서 보관함 */
export async function sendChat(question: string, ctx: ChatContext = null) {
  if (!question.trim() || state.waiting) return;
  const owner = state.owner;
  set({
    waiting: true,
    messages: [...state.messages, { id: -Date.now(), role: 'user', text: question, cards: [], sources: [], actions: [], created_at: new Date().toISOString() }],
  });
  try {
    const res = await api.post<ChatReply>('/chat', { conversation_id: state.convId, text: question, context: ctx });
    if (state.owner === owner) set({ convId: res.conversation_id, messages: [...state.messages, res.message] });
  } catch (e) {
    showAlert('답변을 받지 못했어요', (e as ApiError).message);
  } finally {
    if (state.owner === owner) set({ waiting: false });
  }
}
