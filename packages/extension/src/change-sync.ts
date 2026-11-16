import type { LocalChange } from './change-log.js';

// 변경 내역 저장 동기화(E-4·E-6). 같은 origin의 여러 탭·세션이 한 저장소 키를 함께 쓰므로
// 목록 전체를 덮어쓰지 않고, 저장 직전에 다시 읽어 이 세션이 만들거나 바꾼 항목만 반영하고 이 세션이 지운 항목만 뺀다.

/** 저장소 접근(테스트에서 메모리 구현으로 대체). */
export interface EntryStore {
  load(): Promise<unknown[]>;
  save(entries: readonly unknown[]): Promise<void>;
}

export interface LogDiff {
  dirty: ReadonlySet<string>;
  removed: ReadonlySet<string>;
}

function idOf(value: unknown): string | null {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined;
  return typeof id === 'string' ? id : null;
}

/**
 * 저장소 값과 이 세션 목록을 합친다. 다른 세션의 항목은 그대로 두고(유실 0),
 * `removed` id는 빼고, `dirty` id는 이 세션 값으로 바꾸거나 뒤에 붙인다.
 */
export function mergeForSave(stored: readonly unknown[], log: readonly LocalChange[], diff: LogDiff): unknown[] {
  const mine = new Map(log.filter((c) => diff.dirty.has(c.id)).map((c) => [c.id, c]));
  const out: unknown[] = [];
  const written = new Set<string>();
  for (const entry of stored) {
    const id = idOf(entry);
    if (id !== null && diff.removed.has(id)) continue;
    const own = id === null ? undefined : mine.get(id);
    if (own && id !== null) {
      out.push(own);
      written.add(id);
    } else {
      out.push(entry);
    }
  }
  for (const [id, c] of mine) if (!written.has(id)) out.push(c);
  return out;
}

/** 저장을 순서대로 실행한다. 실패한 저장의 변경분은 다음 저장에 다시 포함한다. */
export class ChangeSync {
  readonly #store: EntryStore;
  readonly #getLog: () => readonly LocalChange[];
  readonly #dirty = new Set<string>();
  readonly #removed = new Set<string>();
  #queue: Promise<void> = Promise.resolve();

  constructor(store: EntryStore, getLog: () => readonly LocalChange[]) {
    this.#store = store;
    this.#getLog = getLog;
  }

  /** 변경분을 기록하고 저장을 예약한다. 반환 Promise는 이 저장의 완료·실패를 알린다. */
  save(diff: LogDiff): Promise<void> {
    for (const id of diff.dirty) this.#dirty.add(id);
    for (const id of diff.removed) {
      this.#dirty.delete(id);
      this.#removed.add(id);
    }
    const run = async (): Promise<void> => {
      if (this.#dirty.size === 0 && this.#removed.size === 0) return;
      const pending: LogDiff = { dirty: new Set(this.#dirty), removed: new Set(this.#removed) };
      this.#dirty.clear();
      this.#removed.clear();
      try {
        const stored = await this.#store.load();
        await this.#store.save(mergeForSave(stored, this.#getLog(), pending));
      } catch (error) {
        for (const id of pending.dirty) if (!this.#removed.has(id)) this.#dirty.add(id);
        for (const id of pending.removed) this.#removed.add(id);
        throw error;
      }
    };
    const result = this.#queue.then(run);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}
