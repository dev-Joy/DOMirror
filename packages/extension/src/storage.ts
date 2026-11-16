import { DEFAULT_PORT } from '@domirror/shared';
import { isValidPort } from './relay.js';

const PORT_KEY = 'domirror:port';

function changesKey(origin: string): string {
  return `domirror:changes:${origin}`;
}

/**
 * origin별 로컬 변경 목록. 항목 타입(`LocalChange`)은 change-log.ts(배치 F)가 정의하므로
 * 여기서는 호출 측이 지정한다. 저장값이 배열이 아니면 빈 목록으로 본다.
 */
export async function loadEntries<T>(origin: string): Promise<T[]> {
  const key = changesKey(origin);
  const stored = await chrome.storage.local.get(key);
  const value: unknown = stored[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 빈 목록이면 키를 지워 저장소에 잔여물을 남기지 않는다. */
export async function saveEntries<T>(origin: string, entries: readonly T[]): Promise<void> {
  const key = changesKey(origin);
  if (entries.length === 0) {
    await chrome.storage.local.remove(key);
    return;
  }
  await chrome.storage.local.set({ [key]: entries });
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
