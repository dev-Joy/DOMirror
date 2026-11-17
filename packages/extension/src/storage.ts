import { DEFAULT_PORT } from '@domirror/shared';
import { isValidPort } from './relay.js';

const PORT_KEY = 'domirror:port';

function changesKey(origin: string): string {
  return `domirror:changes:${origin}`;
}

function commentsKey(origin: string): string {
  return `domirror:comments:${origin}`;
}

/** 저장값이 배열이 아니면 빈 목록으로 본다. */
async function loadList<T>(key: string): Promise<T[]> {
  const stored = await chrome.storage.local.get(key);
  const value: unknown = stored[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 빈 목록이면 키를 지워 저장소에 잔여물을 남기지 않는다. */
async function saveList<T>(key: string, entries: readonly T[]): Promise<void> {
  if (entries.length === 0) {
    await chrome.storage.local.remove(key);
    return;
  }
  await chrome.storage.local.set({ [key]: entries });
}

/**
 * origin별 로컬 변경 목록. 항목 타입(`LocalChange`)은 change-log.ts(배치 F)가 정의하므로
 * 여기서는 호출 측이 지정한다. 저장값이 배열이 아니면 빈 목록으로 본다.
 */
export async function loadEntries<T>(origin: string): Promise<T[]> {
  return loadList<T>(changesKey(origin));
}

/** 빈 목록이면 키를 지워 저장소에 잔여물을 남기지 않는다. */
export async function saveEntries<T>(origin: string, entries: readonly T[]): Promise<void> {
  return saveList(changesKey(origin), entries);
}

/** origin별 화면 코멘트 목록(Q1=A). 여러 탭 병합 없이 목록 전체를 덮어쓴다. */
export async function loadComments<T>(origin: string): Promise<T[]> {
  return loadList<T>(commentsKey(origin));
}

/** 빈 목록이면 키를 지운다. */
export async function saveComments<T>(origin: string, comments: readonly T[]): Promise<void> {
  return saveList(commentsKey(origin), comments);
}

export async function loadPort(): Promise<number> {
  const stored = await chrome.storage.local.get(PORT_KEY);
  const value: unknown = stored[PORT_KEY];
  return isValidPort(value) ? value : DEFAULT_PORT;
}

export async function savePort(port: number): Promise<void> {
  if (!isValidPort(port)) throw new RangeError(`잘못된 포트: ${port}`);
  await chrome.storage.local.set({ [PORT_KEY]: port });
}
