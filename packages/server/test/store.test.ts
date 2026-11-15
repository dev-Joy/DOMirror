import type { StyleChangeInput } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import { ChangeStore } from '../src/store.js';

function change(id: string, after = '16px'): StyleChangeInput {
  return {
    id,
    source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
    selectorHint: 'div.card',
    property: 'padding',
    before: { authored: '8px', computed: '8px' },
    after,
    pageUrl: 'http://localhost:5173/',
    createdAt: '2026-11-16T00:00:00.000Z',
  };
}

describe('ChangeStore', () => {
  it('upsert는 pending으로 저장하고 id를 순서대로 반환한다', () => {
    const store = new ChangeStore();
    expect(store.upsert([change('a'), change('b')])).toEqual(['a', 'b']);
    expect(store.pendingCount()).toBe(2);
    expect(store.listPending().map((c) => c.status)).toEqual(['pending', 'pending']);
  });

  it('같은 id는 덮어쓴다', () => {
    const store = new ChangeStore();
    store.upsert([change('a', '16px')]);
    store.upsert([change('a', '24px')]);
    expect(store.listPending()).toHaveLength(1);
    expect(store.listPending()[0]?.after).toBe('24px');
  });

  it('applied 이후 같은 id를 다시 받으면 pending으로 되돌린다', () => {
    const store = new ChangeStore();
    store.upsert([change('a')]);
    store.markApplied(['a']);
    store.upsert([change('a', '24px')]);
    expect(store.listPending().map((c) => c.id)).toEqual(['a']);
  });

  it('markApplied는 applied·notFound를 나누고 대기 목록에서 뺀다', () => {
    const store = new ChangeStore();
    store.upsert([change('a'), change('b')]);
    expect(store.markApplied(['a', 'x'])).toEqual({ applied: ['a'], notFound: ['x'] });
    expect(store.listPending().map((c) => c.id)).toEqual(['b']);
    expect(store.pendingCount()).toBe(1);
  });

  it('markApplied는 멱등이며 중복 id를 한 번만 보고한다', () => {
    const store = new ChangeStore();
    store.upsert([change('a')]);
    store.markApplied(['a']);
    expect(store.markApplied(['a', 'a'])).toEqual({ applied: ['a'], notFound: [] });
    expect(store.pendingCount()).toBe(0);
  });
});
