import { describe, expect, it } from 'vitest';
import {
  changeKey,
  diffLog,
  markStale,
  mergeLoaded,
  recordChange,
  removeChange,
  originalValue,
  restoreStale,
  sendable,
  settleSent,
  type LocalChange,
} from '../src/change-log.js';

const SOURCE = { file: 'src/App.tsx', line: 12, column: 5, inherited: false };

function change(overrides: Partial<LocalChange> = {}): LocalChange {
  return {
    id: 'id-1',
    source: SOURCE,
    selectorHint: 'h1.title',
    property: 'padding-top',
    before: { authored: '8px', computed: '8px' },
    after: '12px',
    pageUrl: 'http://127.0.0.1:5173/',
    createdAt: '2026-11-16T00:00:00.000Z',
    stale: false,
    ...overrides,
  };
}

describe('changeKey', () => {
  it('소스 위치·선택자 요약·속성이 같으면 같은 키', () => {
    expect(changeKey(change())).toBe(changeKey(change({ id: 'other', after: '20px' })));
    expect(changeKey(change())).not.toBe(changeKey(change({ property: 'padding-left' })));
    expect(changeKey(change())).not.toBe(changeKey(change({ source: { ...SOURCE, line: 13 } })));
    expect(changeKey(change({ source: null }))).not.toBe(changeKey(change()));
  });

  it('요소 자신의 위치면 선택자 요약(class)과 무관하게 위치·속성 1개 키 (E-2·R-1)', () => {
    expect(changeKey(change({ selectorHint: 'li.item' }))).toBe(changeKey(change({ selectorHint: 'li.item.active' })));
  });

  it('조상 위치·위치 없음이면 선택자 요약으로 서로 다른 요소를 구분한다', () => {
    const inherited = { ...SOURCE, inherited: true };
    expect(changeKey(change({ source: inherited, selectorHint: 'span' }))).not.toBe(
      changeKey(change({ source: inherited, selectorHint: 'em' })),
    );
    expect(changeKey(change({ source: null, selectorHint: 'span' }))).not.toBe(changeKey(change({ source: null, selectorHint: 'em' })));
    // 같은 위치라도 요소 자신의 위치(조상)와 그 위치를 물려받은 자손은 다른 요소다.
    expect(changeKey(change({ source: inherited }))).not.toBe(changeKey(change()));
  });
});

describe('R-1 회귀: 같은 소스 위치의 class 차이', () => {
  const VUE = { file: 'src/App.vue', line: 5, column: 7, inherited: false };

  it('li.item=10px, li.item.active=20px 편집은 같은 파일:라인·속성 1건으로 합친다', () => {
    let log = recordChange([], change({ source: VUE, selectorHint: 'li.item', before: { authored: null, computed: '0px' }, after: '10px' }), true);
    log = recordChange(
      log,
      change({ id: 'id-2', source: VUE, selectorHint: 'li.item.active', before: { authored: null, computed: '0px' }, after: '20px' }),
      true,
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ id: 'id-1', before: { authored: null, computed: '0px' }, after: '20px' });
  });

  it('편집 20 → 앱이 class 추가 → 편집 30이면 [10→30] 1건, 되돌리면 내역 0건', () => {
    let log = recordChange([], change({ source: VUE, selectorHint: 'li.item', before: { authored: '10px', computed: '10px' }, after: '20px' }), true);
    log = recordChange(
      log,
      change({ id: 'id-2', source: VUE, selectorHint: 'li.item.active', before: { authored: '20px', computed: '20px' }, after: '30px' }),
      true,
    );
    expect(log.map((c) => `${c.before.authored}→${c.after}`)).toEqual(['10px→30px']);
    expect(removeChange(log, log[0].id)).toEqual([]);
  });
});

describe('recordChange', () => {
  it('연속 편집은 최초 before·id·createdAt과 최종 after 1건으로 합친다 (FR-7·AC-6)', () => {
    let log = recordChange([], change(), true);
    log = recordChange(
      log,
      change({ id: 'id-2', before: { authored: '12px', computed: '12px' }, after: '16px', createdAt: '2026-11-16T00:00:05.000Z' }),
      true,
    );
    expect(log).toEqual([change({ after: '16px' })]);
  });

  it('active=false(그 key에 원래 값과 다른 요소가 없음)이면 그 key 항목을 제거한다', () => {
    let log = recordChange([], change(), true);
    log = recordChange(log, change({ id: 'id-2', before: { authored: '12px', computed: '12px' }, after: ' 8px ' }), false);
    expect(log).toEqual([]);
  });

  it('after가 최초 before와 같아도 active=true면 항목을 유지한다 (D-2)', () => {
    let log = recordChange([], change({ before: { authored: null, computed: '16px' }, after: '20px' }), true);
    log = recordChange(log, change({ id: 'id-2', before: { authored: null, computed: '8px' }, after: '16px' }), true);
    expect(log).toEqual([change({ before: { authored: null, computed: '16px' }, after: '16px' })]);
  });

  it('다른 속성·요소는 별도 항목으로 쌓인다', () => {
    let log = recordChange([], change(), true);
    log = recordChange(log, change({ id: 'id-2', property: 'color', before: { authored: null, computed: 'rgb(0, 0, 0)' }, after: 'red' }), true);
    expect(log.map((c) => c.id)).toEqual(['id-1', 'id-2']);
  });

  it('복원된(stale) 항목을 다시 편집하면 원래 before를 유지하고 stale을 해제한다 (E-6)', () => {
    const log = recordChange([change({ stale: true })], change({ id: 'id-2', before: { authored: null, computed: '8px' }, after: '20px' }), true);
    expect(log).toEqual([change({ after: '20px', stale: false })]);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const log = Object.freeze([change()]) as readonly LocalChange[];
    expect(() => recordChange(log, change({ id: 'id-2', after: '30px' }), true)).not.toThrow();
    expect(log[0].after).toBe('12px');
  });
});

describe('originalValue', () => {
  it('작성 원문이 없으면 계산값을 원래 값으로 본다(trim)', () => {
    expect(originalValue({ before: { authored: null, computed: '0px' } })).toBe('0px');
    expect(originalValue({ before: { authored: ' 8px ', computed: '9px' } })).toBe('8px');
  });
});

describe('removeChange', () => {
  it('지정한 항목만 제거한다 (FR-8)', () => {
    const log = [change(), change({ id: 'id-2', property: 'color' })];
    expect(removeChange(log, 'id-1').map((c) => c.id)).toEqual(['id-2']);
    expect(removeChange(log, 'none')).toHaveLength(2);
  });
});

describe('sendable', () => {
  it('source가 null인 항목은 전송에서 제외하고 stale 필드를 뺀다 (E-1)', () => {
    const log = [change(), change({ id: 'id-2', source: null, selectorHint: 'body' }), change({ id: 'id-3', property: 'color', stale: true })];
    const out = sendable(log);
    expect(out.map((c) => c.id)).toEqual(['id-1', 'id-3']);
    for (const c of out) expect(c).not.toHaveProperty('stale');
    expect(out[0]).toEqual({
      id: 'id-1',
      source: SOURCE,
      selectorHint: 'h1.title',
      property: 'padding-top',
      before: { authored: '8px', computed: '8px' },
      after: '12px',
      pageUrl: 'http://127.0.0.1:5173/',
      createdAt: '2026-11-16T00:00:00.000Z',
    });
  });
});

describe('settleSent', () => {
  const rebase = { newId: () => 'id-new', now: '2026-11-16T00:01:00.000Z' };

  it('전송 성공분만 제거하고 위치 없는 항목은 남긴다 (E-4)', () => {
    const log = [change(), change({ id: 'id-2', source: null }), change({ id: 'id-3', property: 'color' })];
    const sent = sendable(log);
    const result = settleSent(log, sent, () => false, rebase);
    expect(result.log.map((c) => c.id)).toEqual(['id-2']);
    expect(result.compensated).toBe(0);
  });

  it('R-2 회귀: 전송 중 재편집된 항목은 보낸 값을 before로 하는 새 항목으로 남긴다(순차 경로와 같음)', () => {
    // 10→20 전송 시작 → 응답 전 30으로 재편집 → 전송 성공
    const log = [change({ before: { authored: '10px', computed: '10px' }, after: '20px' })];
    const sent = sendable(log);
    const edited = recordChange(log, change({ id: 'id-9', before: { authored: '20px', computed: '20px' }, after: '30px' }), true);
    const concurrent = settleSent(edited, sent, () => true, rebase).log;
    expect(concurrent).toEqual([
      change({ id: 'id-new', before: { authored: '20px', computed: '20px' }, after: '30px', createdAt: '2026-11-16T00:01:00.000Z' }),
    ]);
    // 순차 경로: 전송 완료 후 재편집하면 before = 보낸 값 20
    const sequential = recordChange(
      settleSent(log, sent, () => false, rebase).log,
      change({ id: 'id-new', before: { authored: '20px', computed: '20px' }, after: '30px', createdAt: '2026-11-16T00:01:00.000Z' }),
      true,
    );
    expect(concurrent).toEqual(sequential);
    // 되돌리면 내역 0건(페이지는 applier.settle로 20 복귀 — applier 테스트)
    expect(removeChange(concurrent, 'id-new')).toEqual([]);
  });

  it('전송 실패 시(호출하지 않으면) 목록은 그대로다', () => {
    const log = [change()];
    expect(settleSent(log, [], () => true, rebase).log).toEqual(log);
  });

  it('D-1: 로그에서 사라진 보낸 항목은 isActive면 "보낸 값 → 원래 값" 보정 항목, 아니면 아무것도 남지 않는다', () => {
    const log = [change({ before: { authored: null, computed: '0px' }, after: '10px' })];
    const sent = sendable(log);
    const active = settleSent([], sent, () => true, rebase);
    expect(active.compensated).toBe(1);
    expect(active.log).toEqual([
      change({ id: 'id-new', before: { authored: '10px', computed: '10px' }, after: '0px', createdAt: '2026-11-16T00:01:00.000Z' }),
    ]);
    const inactive = settleSent([], sent, () => false, rebase);
    expect(inactive).toEqual({ log: [], compensated: 0 });
  });

  it('같은 key의 전송 중 신규 항목은 id·createdAt을 유지하고 before만 보낸 값으로 바뀐다', () => {
    const log = [change({ before: { authored: '10px', computed: '10px' }, after: '20px' })];
    const sent = sendable(log);
    // 전송 중 되돌림(id-1 제거) → 다른 값으로 새로 편집(id-7)
    const fresh = change({ id: 'id-7', before: { authored: '10px', computed: '10px' }, after: '30px', createdAt: '2026-11-16T00:00:30.000Z', stale: true });
    const result = settleSent([fresh], sent, () => true, rebase);
    expect(result.compensated).toBe(0);
    expect(result.log).toEqual([{ ...fresh, before: { authored: '20px', computed: '20px' }, stale: false }]);
  });

  it('E-4: isActive가 false여도 after가 보낸 값과 다른 항목은 남긴다', () => {
    const log = [change({ before: { authored: '10px', computed: '10px' }, after: '20px' })];
    const sent = sendable(log);
    const edited = [{ ...log[0], after: '30px' }];
    const result = settleSent(edited, sent, () => false, rebase);
    expect(result.log).toEqual([
      change({ id: 'id-new', before: { authored: '20px', computed: '20px' }, after: '30px', createdAt: '2026-11-16T00:01:00.000Z' }),
    ]);
  });
});

describe('markStale (E-6·R-4)', () => {
  it('분리된 요소의 key 항목만 stale로 바꾸고, 바뀐 것이 없으면 같은 배열을 돌려준다', () => {
    const log = [change(), change({ id: 'id-2', property: 'color' })];
    const next = markStale(log, new Set([changeKey(log[0])]));
    expect(next.map((c) => c.stale)).toEqual([true, false]);
    expect(next[1]).toBe(log[1]);
    expect(markStale(log, new Set())).toBe(log);
    expect(markStale(next, new Set([changeKey(log[0])]))).toBe(next);
  });
});

describe('mergeLoaded', () => {
  it('복원 항목 앞, 불러오기 전 편집 뒤. 같은 key는 복원 항목의 id·before에 현재 after를 얹는다', () => {
    const restored = [change({ id: 'old', stale: true, before: { authored: '8px', computed: '8px' }, after: '12px' }), change({ id: 'other', property: 'color', stale: true })];
    const current = [change({ id: 'cur', before: { authored: null, computed: '8px' }, after: '20px' }), change({ id: 'new', property: 'width' })];
    const { log, dirty, removed } = mergeLoaded(restored, current);
    expect(log.map((c) => [c.id, c.after, c.stale])).toEqual([
      ['old', '20px', false],
      ['other', '12px', true],
      ['new', '12px', false],
    ]);
    expect(log[0].before).toEqual({ authored: '8px', computed: '8px' });
    expect([...dirty].sort()).toEqual(['new', 'old']);
    expect([...removed]).toEqual(['cur']);
  });

  it('같은 id는 현재 항목이 우선하고 지우지 않는다', () => {
    const { log, removed } = mergeLoaded([change({ stale: true })], [change({ after: '30px' })]);
    expect(log).toEqual([change({ after: '30px' })]);
    expect(removed.size).toBe(0);
  });
});

describe('diffLog', () => {
  it('새로 생기거나 바뀐 id와 사라진 id를 구한다', () => {
    const a = change();
    const b = change({ id: 'id-2' });
    const { dirty, removed } = diffLog([a, b], [a, { ...b, after: '1px' }, change({ id: 'id-3' })]);
    expect([...dirty]).toEqual(['id-2', 'id-3']);
    expect([...removed]).toEqual([]);
    expect([...diffLog([a, b], [b]).removed]).toEqual(['id-1']);
  });
});

describe('restoreStale', () => {
  it('저장소 항목을 stale로 표시하고 형태가 깨진 값은 버린다 (E-6)', () => {
    const restored = restoreStale([change(), { id: 1 }, null, 'x', change({ id: 'id-2', source: null })]);
    expect(restored).toEqual([change({ stale: true }), change({ id: 'id-2', source: null, stale: true })]);
  });
});
