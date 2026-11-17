import type { ScreenCommentInput } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import { CommentStore, MAX_COMMENTS } from '../src/comment-store.js';

function comment(id: string, body = '여기 여백이 이상해요'): ScreenCommentInput {
  return {
    id,
    source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
    selectorHint: 'div.card',
    pageUrl: 'http://localhost:5173/',
    body,
    createdAt: '2026-11-16T00:00:00.000Z',
  };
}

describe('CommentStore', () => {
  it('upsert는 open으로 저장하고 id를 순서대로 반환한다', () => {
    const store = new CommentStore();
    expect(store.upsert([comment('a'), comment('b')])).toEqual(['a', 'b']);
    expect(store.count()).toBe(2);
    expect(store.listOpen().map((c) => c.status)).toEqual(['open', 'open']);
  });

  it('같은 id는 덮어쓰고 status를 유지한다', () => {
    const store = new CommentStore();
    store.upsert([comment('a', '처음')]);
    store.upsert([comment('a', '고침')]);
    expect(store.count()).toBe(1);
    expect(store.listOpen()).toHaveLength(1);
    expect(store.listOpen()[0]?.body).toBe('고침');
    expect(store.listOpen()[0]?.status).toBe('open');
  });

  it('MAX_COMMENTS 경계에서 가장 오래된 항목부터 밀어낸다', () => {
    const store = new CommentStore();
    store.upsert(Array.from({ length: MAX_COMMENTS }, (_, i) => comment(`c${i}`)));
    expect(store.count()).toBe(MAX_COMMENTS);
    expect(store.listOpen()).toHaveLength(MAX_COMMENTS);

    store.upsert([comment('new')]);
    expect(store.count()).toBe(MAX_COMMENTS);
    expect(store.listOpen().some((c) => c.id === 'c0')).toBe(false);
    expect(store.listOpen().some((c) => c.id === 'new')).toBe(true);
  });

  it('한 배치가 한도를 넘으면 마지막 MAX_COMMENTS건만 남는다', () => {
    const store = new CommentStore();
    const batch = Array.from({ length: MAX_COMMENTS + 1 }, (_, i) => comment(`c${i}`));
    store.upsert(batch);
    expect(store.count()).toBe(MAX_COMMENTS);
    expect(store.listOpen().some((c) => c.id === 'c0')).toBe(false);
    expect(store.listOpen()[0]?.id).toBe('c1');
  });

  it('markResolved는 resolved·notFound를 나누고 대기 목록에서 뺀다', () => {
    const store = new CommentStore();
    store.upsert([comment('a'), comment('b')]);
    expect(store.markResolved(['a', 'x'])).toEqual({ resolved: ['a'], notFound: ['x'] });
    expect(store.listOpen().map((c) => c.id)).toEqual(['b']);
    expect(store.markResolved(['a', 'a'])).toEqual({ resolved: ['a'], notFound: [] });
  });

  it('resolved 항목에 같은 id를 재전송해도 status를 유지한다', () => {
    const store = new CommentStore();
    store.upsert([comment('a', '처음')]);
    store.markResolved(['a']);
    // upsert는 body를 갱신하지만 resolved 항목은 listOpen에 노출되지 않아
    // body 변경 자체는 관측할 수 없다(`listAll`은 YAGNI로 도입하지 않음).
    store.upsert([comment('a', '고침')]);
    expect(store.listOpen()).toHaveLength(0);
    expect(store.count()).toBe(1);
    expect(store.markResolved(['a'])).toEqual({ resolved: ['a'], notFound: [] });
  });
});
