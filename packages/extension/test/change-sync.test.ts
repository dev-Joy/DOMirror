import { describe, expect, it } from 'vitest';
import { diffLog, mergeLoaded, recordChange, restoreStale, type LocalChange } from '../src/change-log.js';
import { ChangeSync, mergeForSave, type EntryStore } from '../src/change-sync.js';

function change(id: string, overrides: Partial<LocalChange> = {}): LocalChange {
  return {
    id,
    source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
    selectorHint: 'h1.title',
    property: 'padding-top',
    before: { authored: '8px', computed: '8px' },
    after: '12px',
    pageUrl: 'http://localhost:5173/',
    createdAt: '2026-11-16T00:00:00.000Z',
    stale: false,
    ...overrides,
  };
}

/** chrome.storage.local의 한 origin 키를 흉내 내는 공유 메모리 저장소. */
class MemoryStore implements EntryStore {
  value: unknown[] = [];
  failing = false;
  async load(): Promise<unknown[]> {
    return structuredClone(this.value);
  }
  async save(entries: readonly unknown[]): Promise<void> {
    if (this.failing) throw new Error('저장 실패');
    this.value = structuredClone([...entries]);
  }
}

/** content.ts EditSession의 저장 경로만 떼어 낸 탭 1개. */
class Tab {
  log: LocalChange[] = [];
  readonly sync: ChangeSync;
  constructor(store: EntryStore) {
    this.sync = new ChangeSync(store, () => this.log);
  }
  set(next: LocalChange[], diff = diffLog(this.log, next)): Promise<void> {
    this.log = next;
    return this.sync.save(diff);
  }
  edit(c: LocalChange): Promise<void> {
    return this.set(recordChange(this.log, c));
  }
  /** 불러오기 완료(활성화 직후 비동기). */
  loaded(entries: unknown[]): Promise<void> {
    const { log, dirty, removed } = mergeLoaded(restoreStale(entries), this.log);
    return this.set(log, { dirty, removed });
  }
}

const ids = (entries: unknown[]): string[] => entries.map((e) => (e as LocalChange).id).sort();

describe('mergeForSave', () => {
  it('다른 세션 항목은 유지하고, dirty는 교체·추가, removed만 지운다', () => {
    const stored = [change('a'), change('b'), change('gone')];
    const log = [change('b', { after: '99px' }), change('c')];
    const out = mergeForSave(stored, log, { dirty: new Set(['b', 'c']), removed: new Set(['gone']) });
    expect(out).toEqual([change('a'), change('b', { after: '99px' }), change('c')]);
  });
});

describe('R-3 회귀: 같은 origin 탭 2개', () => {
  it('A 전송 실패(저장 [a]) → B 편집 → A 새로고침해도 a·b 모두 남는다(유실 0)', async () => {
    const store = new MemoryStore();
    const a = new Tab(store);
    const b = new Tab(store);
    await a.loaded(await store.load());
    await b.loaded(await store.load());
    await a.edit(change('a'));
    await b.edit(change('b', { property: 'color', after: 'red' }));
    expect(ids(store.value)).toEqual(['a', 'b']);
    // A 새로고침 = 새 세션이 불러오기
    const reloaded = new Tab(store);
    await reloaded.loaded(await store.load());
    expect(reloaded.log.map((c) => [c.id, c.stale])).toEqual([
      ['a', true],
      ['b', true],
    ]);
  });

  it('한 탭의 되돌리기·전송은 자기 항목만 지우고, 불러온 다른 탭 항목을 되살리지 않는다', async () => {
    const store = new MemoryStore();
    store.value = [change('x', { property: 'color' })];
    const a = new Tab(store);
    const b = new Tab(store);
    await a.loaded(await store.load());
    await b.loaded(await store.load());
    await b.set([]); // B가 x를 전송·제거
    await a.edit(change('a'));
    expect(ids(store.value)).toEqual(['a']);
  });

  it('활성화 직후 불러오기 완료 전 편집해도 기존 내역을 덮어쓰지 않고, 완료 후 합친 결과를 저장한다', async () => {
    const store = new MemoryStore();
    store.value = [change('old', { after: '16px' }), change('other', { property: 'color', after: 'red' })];
    const tab = new Tab(store);
    const pending = store.load(); // 불러오기 시작(아직 반영 전)
    await tab.edit(change('cur', { before: { authored: null, computed: '8px' }, after: '20px' })); // 같은 key 편집
    expect(ids(store.value)).toEqual(['cur', 'old', 'other']);
    await tab.loaded(await pending);
    expect(ids(store.value)).toEqual(['old', 'other']);
    expect(store.value.find((e) => (e as LocalChange).id === 'old')).toMatchObject({ after: '20px', before: { authored: '8px' } });
  });

  it('저장 실패분은 다음 저장에 다시 포함된다', async () => {
    const store = new MemoryStore();
    const tab = new Tab(store);
    store.failing = true;
    await expect(tab.edit(change('a'))).rejects.toThrow('저장 실패');
    store.failing = false;
    await tab.edit(change('b', { property: 'color', after: 'red' }));
    expect(ids(store.value)).toEqual(['a', 'b']);
  });
});
