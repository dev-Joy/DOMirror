import { describe, expect, it } from 'vitest';
import {
  changeKey,
  recordChange,
  removeChange,
  removeSent,
  restoreStale,
  sendable,
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
});

describe('recordChange', () => {
  it('연속 편집은 최초 before·id·createdAt과 최종 after 1건으로 합친다 (FR-7·AC-6)', () => {
    let log = recordChange([], change());
    log = recordChange(
      log,
      change({ id: 'id-2', before: { authored: '12px', computed: '12px' }, after: '16px', createdAt: '2026-11-16T00:00:05.000Z' }),
    );
    expect(log).toEqual([change({ after: '16px' })]);
  });

  it('원래 값으로 돌아오면 항목을 제거한다', () => {
    let log = recordChange([], change());
    log = recordChange(log, change({ id: 'id-2', before: { authored: '12px', computed: '12px' }, after: ' 8px ' }));
    expect(log).toEqual([]);
  });

  it('작성 원문이 없으면 계산값을 원래 값으로 본다', () => {
    const before = { authored: null, computed: '0px' };
    expect(recordChange([], change({ before, after: '0px' }))).toEqual([]);
    const log = recordChange([], change({ before, after: '4px' }));
    expect(recordChange(log, change({ id: 'id-2', before: { authored: '4px', computed: '4px' }, after: '0px' }))).toEqual([]);
  });

  it('다른 속성·요소는 별도 항목으로 쌓인다', () => {
    let log = recordChange([], change());
    log = recordChange(log, change({ id: 'id-2', property: 'color', before: { authored: null, computed: 'rgb(0, 0, 0)' }, after: 'red' }));
    expect(log.map((c) => c.id)).toEqual(['id-1', 'id-2']);
  });

  it('복원된(stale) 항목을 다시 편집하면 원래 before를 유지하고 stale을 해제한다 (E-6)', () => {
    const log = recordChange([change({ stale: true })], change({ id: 'id-2', before: { authored: null, computed: '8px' }, after: '20px' }));
    expect(log).toEqual([change({ after: '20px', stale: false })]);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const log = Object.freeze([change()]) as readonly LocalChange[];
    expect(() => recordChange(log, change({ id: 'id-2', after: '30px' }))).not.toThrow();
    expect(log[0].after).toBe('12px');
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

describe('removeSent', () => {
  it('전송 성공분만 제거하고 위치 없는 항목은 남긴다 (E-4)', () => {
    const log = [change(), change({ id: 'id-2', source: null }), change({ id: 'id-3', property: 'color' })];
    const sent = sendable(log);
    expect(removeSent(log, sent).map((c) => c.id)).toEqual(['id-2']);
  });

  it('전송 중 다시 편집되어 after가 달라진 항목은 남긴다', () => {
    const log = [change()];
    const sent = sendable(log);
    const edited = recordChange(log, change({ id: 'id-9', after: '40px' }));
    expect(removeSent(edited, sent)).toEqual([change({ after: '40px' })]);
  });

  it('전송 실패 시(호출하지 않으면) 목록은 그대로다', () => {
    const log = [change()];
    expect(removeSent(log, [])).toEqual(log);
  });
});

describe('restoreStale', () => {
  it('저장소 항목을 stale로 표시하고 형태가 깨진 값은 버린다 (E-6)', () => {
    const restored = restoreStale([change(), { id: 1 }, null, 'x', change({ id: 'id-2', source: null })]);
    expect(restored).toEqual([change({ stale: true }), change({ id: 'id-2', source: null, stale: true })]);
  });
});
