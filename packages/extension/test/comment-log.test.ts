import { describe, expect, it } from 'vitest';
import {
  addComment,
  beginCommentSend,
  commentWhere,
  commentsForPage,
  finishCommentSend,
  normalizeLoaded,
  preview,
  toSendable,
  type LocalComment,
} from '../src/comment-log.js';
import type { RuntimeBridgeResult } from '../src/runtime-bridge.js';

const SOURCE = { file: 'src/App.tsx', line: 12, column: 5, inherited: false };
const PAGE = 'http://127.0.0.1:5173/';

function comment(overrides: Partial<LocalComment> = {}): LocalComment {
  return {
    id: 'cmt-1',
    source: SOURCE,
    selectorHint: 'h1.title',
    pageUrl: PAGE,
    body: '패딩이 너무 넓어 보입니다',
    createdAt: '2026-11-17T00:00:00.000Z',
    send: 'pending',
    ...overrides,
  };
}

describe('addComment', () => {
  it('끝에 덧붙인 새 배열을 돌려주고 입력은 바꾸지 않는다', () => {
    const list = [comment()];
    const next = addComment(list, comment({ id: 'cmt-2' }));

    expect(next.map((c) => c.id)).toEqual(['cmt-1', 'cmt-2']);
    expect(list).toHaveLength(1);
    expect(next).not.toBe(list);
  });
});

describe('toSendable', () => {
  it('로컬 필드(send·error)를 뺀다', () => {
    const sendable = toSendable(comment({ send: 'failed', error: '서버에 연결할 수 없습니다' }));

    expect(sendable).not.toHaveProperty('send');
    expect(sendable).not.toHaveProperty('error');
    expect(sendable).toEqual({
      id: 'cmt-1',
      source: SOURCE,
      selectorHint: 'h1.title',
      pageUrl: PAGE,
      body: '패딩이 너무 넓어 보입니다',
      createdAt: '2026-11-17T00:00:00.000Z',
    });
  });
});

describe('beginCommentSend', () => {
  it('pending·failed만 sending으로 바꾸고 payload에 담는다', () => {
    const list = [
      comment({ id: 'pending' }),
      comment({ id: 'failed', send: 'failed', error: '이전 실패' }),
      comment({ id: 'sent', send: 'sent' }),
      comment({ id: 'sending', send: 'sending' }),
    ];

    const { list: next, payload } = beginCommentSend(list, ['pending', 'failed', 'sent', 'sending', 'missing']);

    expect(payload.map((c) => c.id)).toEqual(['pending', 'failed']);
    expect(payload[1]).not.toHaveProperty('error');
    expect(next.map((c) => [c.id, c.send])).toEqual([
      ['pending', 'sending'],
      ['failed', 'sending'],
      ['sent', 'sent'],
      ['sending', 'sending'],
    ]);
    expect(next.find((c) => c.id === 'failed')).not.toHaveProperty('error');
    // 입력은 그대로 둔다.
    expect(list[0]!.send).toBe('pending');
    expect(list[1]!.error).toBe('이전 실패');
  });

  it('보낼 대상이 없으면 payload가 비고 목록을 바꾸지 않는다', () => {
    const list = [comment({ send: 'sent' })];

    const { list: next, payload } = beginCommentSend(list, ['cmt-1']);

    expect(payload).toEqual([]);
    expect(next).toEqual(list);
  });
});

describe('finishCommentSend', () => {
  it('성공하면 sent로 바꾸고 오류를 지운다', () => {
    const list = [comment({ send: 'sending' })];

    const next = finishCommentSend(list, ['cmt-1'], { ok: true, accepted: 1 });

    expect(next).toEqual([{ ...comment(), send: 'sent' }]);
    expect(next[0]).not.toHaveProperty('error');
  });

  it('실패하면 failed로 바꾸고 사유를 남긴다', () => {
    const list = [comment({ send: 'sending' })];

    const next = finishCommentSend(list, ['cmt-1'], { ok: false, error: '서버 오류 HTTP 500' });

    expect(next[0]!.send).toBe('failed');
    expect(next[0]!.error).toBe('서버 오류 HTTP 500');
  });

  it('대상이 아닌 항목은 그대로 둔다', () => {
    const other = comment({ id: 'cmt-2', send: 'sent' });

    const next = finishCommentSend([other], ['cmt-1'], { ok: true, accepted: 1 });

    expect(next).toEqual([other]);
  });
});

describe('normalizeLoaded', () => {
  it('형식이 맞지 않는 값은 버린다', () => {
    const entries = [
      null,
      42,
      'text',
      {},
      { ...comment(), send: 'unknown' },
      { ...comment(), source: { file: 'src/App.tsx', line: 12 } },
      { ...comment(), id: 7 },
      comment(),
    ];

    const next = normalizeLoaded(entries);

    expect(next).toHaveLength(1);
    expect(next[0]!.id).toBe('cmt-1');
  });

  it('pending·sending은 failed로, sent는 유지한다(E-5·E-6)', () => {
    const entries = [
      comment({ id: 'pending', send: 'pending' }),
      comment({ id: 'sending', send: 'sending' }),
      comment({ id: 'sent', send: 'sent' }),
    ];

    const next = normalizeLoaded(entries);

    expect(next.map((c) => [c.id, c.send])).toEqual([
      ['pending', 'failed'],
      ['sending', 'failed'],
      ['sent', 'sent'],
    ]);
  });

  it('failed는 사유를 유지하고 sent의 오류는 지운다', () => {
    const entries = [
      comment({ id: 'failed', send: 'failed', error: '타임아웃' }),
      comment({ id: 'sent', send: 'sent', error: '지워질 오류' }),
    ];

    const next = normalizeLoaded(entries);

    expect(next[0]!.error).toBe('타임아웃');
    expect(next[1]!.error).toBeUndefined();
  });

  it('component는 형식이 맞으면 유지하고, 틀리면 필드만 버린다 (E-10)', () => {
    const runtime = {
      name: 'Card',
      definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const },
      callSite: { file: 'src/App.tsx', line: 20, column: 7, precision: 'line-unverified' as const },
      owners: ['Card', 'App'],
      via: 'fiber' as const,
    };
    const next = normalizeLoaded([
      comment({ id: 'keep', component: runtime }),
      comment({ id: 'broken', component: { name: '', via: 'fiber' } as unknown as LocalComment['component'] }),
      comment({ id: 'legacy' }),
    ]);

    expect(next.find((c) => c.id === 'keep')?.component).toEqual(runtime);
    const broken = next.find((c) => c.id === 'broken');
    expect(broken).toBeDefined();
    expect(broken).not.toHaveProperty('component');
    expect(next.find((c) => c.id === 'legacy')).not.toHaveProperty('component');
  });
});

describe('commentsForPage', () => {
  it('pageUrl이 같은 코멘트만 남긴다(E-9)', () => {
    const list = [
      comment({ id: 'a' }),
      comment({ id: 'b', pageUrl: 'http://127.0.0.1:5173/about' }),
    ];

    expect(commentsForPage(list, PAGE).map((c) => c.id)).toEqual(['a']);
    expect(commentsForPage(list, '/nowhere')).toEqual([]);
  });
});

describe('commentWhere', () => {
  it('소스 위치를 사람이 읽는 형식으로 돌려주고 상속은 표시한다(E-3)', () => {
    expect(commentWhere(comment())).toBe('src/App.tsx:12:5');
    expect(commentWhere(comment({ source: { ...SOURCE, inherited: true } }))).toBe('src/App.tsx:12:5 (상속)');
  });

  it('런타임 위치의 라인을 신뢰할 수 없으면 라인 미확인을 덧붙인다 (FR-5)', () => {
    const runtime = { name: 'Card', definition: { file: 'src/components/Card.tsx', precision: 'line-unverified' as const }, via: 'fiber' as const };
    expect(commentWhere(comment({ component: runtime }))).toBe('src/App.tsx:12:5 (라인 미확인)');
  });
});

describe('preview', () => {
  it('60자 이하는 그대로, 넘으면 60자 + 말줄임표', () => {
    expect(preview('가'.repeat(60))).toBe('가'.repeat(60));
    expect(preview('가'.repeat(61))).toBe(`${'가'.repeat(60)}…`);
    expect(preview('  앞뒤 공백  ')).toBe('앞뒤 공백');
  });

  it('max를 넘겨 지정할 수 있다', () => {
    expect(preview('abcdef', 3)).toBe('abc…');
    expect(preview('abc', 3)).toBe('abc');
  });
});

describe('코멘트 페이로드 — props·인스턴스 수 제외 (INT-012 FR-9·AC-8·D-S5)', () => {
  it('브리지 응답에 props·instanceCount가 있어도 content.ts 코멘트 조립 방식으로는 component만 실린다', () => {
    const info = {
      name: 'Card',
      definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const },
      via: 'fiber' as const,
    };
    const runtime: RuntimeBridgeResult = {
      info,
      props: '{ title: "카드", apiToken: ••• }',
      instanceCount: { count: 4, capped: false },
    };
    // content.ts #submitCommentOnce의 조립(`const component = runtime?.info; ...(component ? { component } : {})`)을 그대로 재현한다.
    const component = runtime.info;
    const local = comment(component ? { component } : {});
    const { payload } = beginCommentSend([local], [local.id]);

    expect(payload).toHaveLength(1);
    expect(payload[0].component).toEqual(info);
    expect(payload[0]).not.toHaveProperty('props');
    expect(payload[0]).not.toHaveProperty('instanceCount');
    const json = JSON.stringify(payload);
    expect(json).not.toContain('props');
    expect(json).not.toContain('instanceCount');
    expect(json).not.toContain('•••');
  });
});
