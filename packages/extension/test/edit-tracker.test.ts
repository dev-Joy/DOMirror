import { describe, expect, it } from 'vitest';
import { originalValue, type LocalChange } from '../src/change-log.js';
import { EditTracker } from '../src/edit-tracker.js';
import { FakeElement } from './fake-element.js';

const P = 'padding-top';
const SOURCE = { file: 'src/App.vue', line: 5, column: 7, inherited: false };
const rebase = { newId: () => 'id-new', now: 'T' };

let seq = 0;

/** 편집 1건. before는 readBefore를 흉내 낸다: 인라인 값이 있으면 그것, 없으면 규칙값(rule). */
function ch(el: FakeElement, rule: string, after: string, overrides: Partial<LocalChange> = {}): LocalChange {
  const inline = el.style.getPropertyValue(P);
  return {
    id: `e${++seq}`,
    source: SOURCE,
    selectorHint: 'li.item',
    property: P,
    before: inline ? { authored: inline, computed: inline } : { authored: null, computed: rule },
    after,
    pageUrl: 'http://127.0.0.1:5173/',
    createdAt: `C${seq}`,
    stale: false,
    ...overrides,
  };
}

/** 화면에 보이는 값: 인라인이 있으면 그것, 없으면 규칙값. */
const visible = (el: FakeElement, rule: string): string => el.style.getPropertyValue(P) || rule;
const labels = (log: readonly LocalChange[]): string[] => log.map((c) => `${originalValue(c)}→${c.after}`);

type DuringSend = (tracker: EditTracker, log: LocalChange[], el: FakeElement) => LocalChange[];

/** 0→10 편집 → 전송 시작 → (전송 중 조작) → 전송 성공. */
function concurrentPath(during: DuringSend) {
  const tracker = new EditTracker();
  const el = new FakeElement();
  let log = tracker.edit([], el, ch(el, '0px', '10px'));
  const sent = tracker.beginSend(log);
  log = during(tracker, log, el);
  const during0 = log;
  const result = tracker.endSend(log, sent, rebase);
  return { tracker, el, during: during0, ...result };
}

/** 순차 기준: 전송 완료 후 원래 값(0)으로 재편집. */
function sequentialPath() {
  const tracker = new EditTracker();
  const el = new FakeElement();
  let log = tracker.edit([], el, ch(el, '0px', '10px'));
  const sent = tracker.beginSend(log);
  log = tracker.endSend(log, sent, rebase).log;
  expect(log).toEqual([]);
  log = tracker.edit(log, el, ch(el, '0px', '0px', { id: 'id-new', createdAt: 'T' }));
  return { tracker, el, log };
}

function expectSameAsSequential(during: DuringSend): { log: LocalChange[] } {
  const c = concurrentPath(during);
  expect(labels(c.log)).toEqual(['10px→0px']);
  expect(c.log[0].id).toBe('id-new');
  expect(c.compensated).toBe(1);
  expect(visible(c.el, '0px')).toBe('0px');

  const s = sequentialPath();
  expect(c.log).toEqual(s.log);
  expect(visible(c.el, '0px')).toBe(visible(s.el, '0px'));

  // 그 항목을 되돌리면 페이지는 보낸 값(10, 인라인 important), 내역 0건.
  const cAfter = c.tracker.revert(c.log, 'id-new');
  const sAfter = s.tracker.revert(s.log, 'id-new');
  expect(cAfter).toEqual([]);
  expect(sAfter).toEqual([]);
  expect(c.el.decls.get(P)).toEqual({ value: '10px', priority: 'important' });
  expect(c.el.decls.get(P)).toEqual(s.el.decls.get(P));
  return c;
}

describe('EditTracker: D-1 전송 응답 전 조작은 전송 후 같은 조작과 같은 결과', () => {
  it('1. 응답 전 되돌리기 → "보낸 값 → 원래 값" 보정 항목', () => {
    expectSameAsSequential((tracker, log) => tracker.revert(log, log[0].id));
  });

  it('2. 응답 전 전체 되돌리기', () => {
    expectSameAsSequential((tracker, log) => tracker.revertAll(log));
  });

  it('3. 응답 전 원래 값으로 재편집 (전송 중 내역은 0건)', () => {
    const reedit: DuringSend = (tracker, log, el) => tracker.edit(log, el, ch(el, '0px', '0px'));
    expect(concurrentPath(reedit).during).toEqual([]);
    expectSameAsSequential(reedit);
  });

  it('4. R-2: 10→20 전송 중 30으로 재편집 → [20→30], 되돌리면 20', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    let log = tracker.edit([], el, ch(el, '10px', '20px'));
    const sent = tracker.beginSend(log);
    log = tracker.edit(log, el, ch(el, '10px', '30px'));
    const result = tracker.endSend(log, sent, rebase);
    expect(labels(result.log)).toEqual(['20px→30px']);
    expect(result.log[0].id).toBe('id-new');
    expect(result.compensated).toBe(0);
    expect(tracker.revert(result.log, 'id-new')).toEqual([]);
    expect(el.decls.get(P)).toEqual({ value: '20px', priority: 'important' });
  });

  it('5. 그대로 보낸 항목은 내역에서 빠지고 페이지 표시는 유지된다', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    const log = tracker.edit([], el, ch(el, '10px', '20px'));
    const result = tracker.endSend(log, tracker.beginSend(log), rebase);
    expect(result).toEqual({ log: [], compensated: 0 });
    expect(visible(el, '10px')).toBe('20px');
  });

  it('6. 전송 중 되돌린 뒤 보낸 값으로 다시 편집하면 내역 0건', () => {
    const c = concurrentPath((tracker, log, el) => tracker.edit(tracker.revert(log, log[0].id), el, ch(el, '0px', '10px')));
    expect(c.log).toEqual([]);
    expect(c.compensated).toBe(0);
    expect(visible(c.el, '0px')).toBe('10px');
  });

  it('7. 전송 중 되돌린 뒤 다른 값(20) 편집 → [10→20], 전송 중 항목 id 유지, 되돌리면 10', () => {
    let freshId = '';
    const c = concurrentPath((tracker, log, el) => {
      const next = tracker.edit(tracker.revert(log, log[0].id), el, ch(el, '0px', '20px'));
      freshId = next[0].id;
      return next;
    });
    expect(labels(c.log)).toEqual(['10px→20px']);
    expect(c.log[0].id).toBe(freshId);
    expect(c.compensated).toBe(0);
    expect(c.tracker.revert(c.log, freshId)).toEqual([]);
    expect(c.el.decls.get(P)).toEqual({ value: '10px', priority: 'important' });
  });
});

describe('EditTracker: D-2 같은 소스, 요소마다 다른 원래 값', () => {
  function setup() {
    const tracker = new EditTracker();
    const a = new FakeElement(); // .active 규칙 16px
    const b = new FakeElement(); // 규칙 8px
    let log = tracker.edit([], a, ch(a, '16px', '20px'));
    log = tracker.edit(log, b, ch(b, '8px', '16px'));
    return { tracker, a, b, log };
  }

  it('8. 입력이 버려지지 않고, 모든 요소가 각자 원래 값일 때만 항목이 사라진다', () => {
    const s = setup();
    const { tracker, a, b } = s;
    let log = s.log;
    expect(labels(log)).toEqual(['16px→16px']);
    expect(visible(a, '16px')).toBe('20px');
    expect(visible(b, '8px')).toBe('16px');

    log = tracker.edit(log, a, ch(a, '16px', '16px'));
    expect(log).toHaveLength(1);
    expect(a.decls.size).toBe(0);
    expect(visible(b, '8px')).toBe('16px');

    log = tracker.edit(log, b, ch(b, '8px', '8px'));
    expect(log).toEqual([]);
    expect(b.decls.size).toBe(0);
  });

  it('9. 되돌리면 각 요소가 자기 원래 값으로 돌아간다', () => {
    const { tracker, a, b, log } = setup();
    expect(tracker.revert(log, log[0].id)).toEqual([]);
    expect(a.decls.size).toBe(0);
    expect(b.decls.size).toBe(0);
    expect(a.hasAttribute('style')).toBe(false);
    expect(b.hasAttribute('style')).toBe(false);
  });
});

describe('EditTracker: 결합·E-4', () => {
  it('10. D-1+D-2: a(16)·b(8)를 20으로 편집 → 전송 중 되돌리기 → [20→16] 보정 1건, 되돌리면 둘 다 20', () => {
    const tracker = new EditTracker();
    const a = new FakeElement();
    const b = new FakeElement();
    let log = tracker.edit([], a, ch(a, '16px', '20px'));
    log = tracker.edit(log, b, ch(b, '8px', '20px'));
    const sent = tracker.beginSend(log);
    log = tracker.revert(log, log[0].id);
    expect(visible(a, '16px')).toBe('16px');
    expect(visible(b, '8px')).toBe('8px');
    const result = tracker.endSend(log, sent, rebase);
    expect(labels(result.log)).toEqual(['20px→16px']);
    expect(result.compensated).toBe(1);
    expect(tracker.revert(result.log, 'id-new')).toEqual([]);
    expect(a.decls.get(P)).toEqual({ value: '20px', priority: 'important' });
    expect(b.decls.get(P)).toEqual({ value: '20px', priority: 'important' });
  });

  it('11. E-4: 전송 중 재편집한 요소가 분리된 뒤 전송이 끝나도 보내지 않은 값의 항목은 남는다', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    let log = tracker.edit([], el, ch(el, '0px', '10px'));
    const sent = tracker.beginSend(log);
    log = tracker.edit(log, el, ch(el, '0px', '30px'));
    el.isConnected = false; // HMR로 교체
    const result = tracker.endSend(log, sent, rebase);
    expect(labels(result.log)).toEqual(['10px→30px']);
    expect(result.log[0].id).toBe('id-new');
    expect(result.compensated).toBe(0);
  });
});
