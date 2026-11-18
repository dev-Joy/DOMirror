import { describe, expect, it } from 'vitest';
import { originalValue, restoreStale, type LocalChange } from '../src/change-log.js';
import { EditTracker } from '../src/edit-tracker.js';
import type { ReadComputed } from '../src/verify.js';
import { FakeElement } from './fake-element.js';

const P = 'padding-top';
const SOURCE = { file: 'src/App.vue', line: 5, column: 7, inherited: false };

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

type Op = (tracker: EditTracker, log: LocalChange[], el: FakeElement) => LocalChange[];
/** D-1·D-A·F-1·R-2를 만들던 응답 전 조작. */
const OPS: [string, Op][] = [
  ['되돌리기', (t, log) => t.revert(log, log[0].id)],
  ['전체 되돌리기', (t, log) => t.revertAll(log)],
  ['원래 값 재편집', (t, log, el) => t.edit(log, el, ch(el, '0px', '0px'))],
  ['다른 값 재편집', (t, log, el) => t.edit(log, el, ch(el, '0px', '30px'))],
];

describe('EditTracker: 전송 중 잠금', () => {
  it('L1. 보낼 항목이 있을 때만 잠그고 finishSend로 푼다', () => {
    const tracker = new EditTracker();
    expect(tracker.beginSend([])).toEqual([]);
    expect(tracker.sending).toBe(false);
    const el = new FakeElement();
    const noSource = tracker.edit([], el, ch(el, '0px', '10px', { source: null, selectorHint: 'div' }));
    expect(tracker.beginSend(noSource)).toEqual([]);
    expect(tracker.sending).toBe(false);
    const el2 = new FakeElement();
    const log = tracker.edit(noSource, el2, ch(el2, '0px', '20px'));
    expect(tracker.beginSend(log).map((c) => c.id)).toEqual([log[1].id]);
    expect(tracker.sending).toBe(true);
    tracker.finishSend();
    expect(tracker.sending).toBe(false);
  });

  for (const [name, op] of OPS) {
    it(`L2. 잠금 중 ${name}는 거부된다: 같은 배열, 페이지 그대로`, () => {
      const tracker = new EditTracker();
      const el = new FakeElement();
      const log = tracker.edit([], el, ch(el, '0px', '10px'));
      tracker.beginSend(log);
      expect(op(tracker, log, el)).toBe(log);
      expect(el.decls.get(P)).toEqual({ value: '10px', priority: 'important' });
    });
  }

  it('L3. 실패·타임아웃: 정산 없이 finishSend만 하면 내역·페이지가 그대로이고, 풀린 뒤 되돌릴 수 있다 (E-4·AC-11)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    const log = tracker.edit([], el, ch(el, '0px', '10px'));
    tracker.beginSend(log);
    tracker.finishSend();
    expect(labels(log)).toEqual(['0px→10px']);
    expect(visible(el, '0px')).toBe('10px');
    expect(tracker.revert(log, log[0].id)).toEqual([]);
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('L4. 성공: 보낸 항목은 빠지고 페이지는 보낸 값. 이후 편집은 보낸 값이 이전값, 되돌리면 보낸 값 (FR-9)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    let log = tracker.edit([], el, ch(el, '10px', '20px'));
    const sent = tracker.beginSend(log);
    log = tracker.endSend(log, sent);
    tracker.finishSend();
    expect(log).toEqual([]);
    expect(visible(el, '10px')).toBe('20px');
    log = tracker.edit(log, el, ch(el, '10px', '30px'));
    expect(labels(log)).toEqual(['20px→30px']);
    expect(tracker.revert(log, log[0].id)).toEqual([]);
    expect(el.decls.get(P)).toEqual({ value: '20px', priority: 'important' });
    tracker.restoreAll(); // 끄면 처음 상태(NFR-3)
    expect(el.decls.size).toBe(0);
  });

  it('L5. 잠금 중 HMR 분리는 stale로 표시되고, 성공하면 그 항목도 빠진다 (E-6·R-4)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    let log = tracker.edit([], el, ch(el, '0px', '10px'));
    const sent = tracker.beginSend(log);
    el.isConnected = false;
    log = tracker.pruneDetached(log);
    expect(log.map((c) => c.stale)).toEqual([true]);
    expect(tracker.endSend(log, sent)).toEqual([]);
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

describe('EditTracker: D-1·D-A·F-1 경로는 잠금으로 생기지 않는다', () => {
  type Kind = 'tracked' | 'restored' | 'detached';

  /** 0→10 항목 준비. el2는 지금 화면에 있는 같은 소스 요소(tracked면 편집한 요소 자신, 아니면 원래 값 0을 보이는 새 요소). */
  function prepare(kind: Kind) {
    const tracker = new EditTracker();
    if (kind === 'restored') {
      return { tracker, log: restoreStale([ch(new FakeElement(), '0px', '10px')]), el2: new FakeElement() };
    }
    const el = new FakeElement();
    let log = tracker.edit([], el, ch(el, '0px', '10px'));
    if (kind === 'tracked') return { tracker, log, el2: el };
    el.isConnected = false;
    log = tracker.pruneDetached(log);
    return { tracker, log, el2: new FakeElement() };
  }

  for (const kind of ['tracked', 'restored', 'detached'] as const) {
    for (const [name, op] of OPS) {
      it(`${kind}: 응답 전 ${name} 거부 → 성공 뒤 내역 0건, 보정 항목 없음`, () => {
        const { tracker, log, el2 } = prepare(kind);
        const page = new Map(el2.decls);
        const sent = tracker.beginSend(log);
        expect(op(tracker, log, el2)).toBe(log);
        expect(el2.decls).toEqual(page);
        expect(tracker.endSend(log, sent)).toEqual([]);
        tracker.finishSend();
      });
    }
  }

  for (const kind of ['restored', 'detached'] as const) {
    it(`${kind}: 보낸 뒤 같은 소스 요소를 15px → 0px로 편집하면 내역 0건(순차 경로, F-1)`, () => {
      const { tracker, log: l0, el2 } = prepare(kind);
      let log = tracker.endSend(l0, tracker.beginSend(l0));
      tracker.finishSend();
      log = tracker.edit(log, el2, ch(el2, '0px', '15px'));
      expect(labels(log)).toEqual(['0px→15px']);
      log = tracker.edit(log, el2, ch(el2, '0px', '0px'));
      expect(log).toEqual([]);
      expect(el2.decls.size).toBe(0);
    });
  }
});

describe('EditTracker: 전송 기록·반영 확인', () => {
  /** 인라인 값이 있으면 그것, 없으면 규칙값(computed). */
  const reader = (rule: string): ReadComputed => (el) => el.style.getPropertyValue(P) || rule;

  it('T-1. 전송 중 verifySent는 null이고 기록·페이지가 그대로다 (E-1·AC-6)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    const log = tracker.edit([], el, ch(el, '0px', '10px'));
    tracker.beginSend(log);
    expect(tracker.verifySent(reader('0px'))).toBeNull();
    expect(tracker.sentCount).toBe(0);
    expect(el.decls.get(P)).toEqual({ value: '10px', priority: 'important' });
  });

  it('T-2. endSend 뒤 sentCount 1, 인라인은 보낸 값 그대로, 내역은 0건이다 (FR-1·AC-1)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    const log = tracker.edit([], el, ch(el, '10px', '20px'));
    const sent = tracker.beginSend(log);
    expect(tracker.endSend(log, sent)).toEqual([]);
    tracker.finishSend();
    expect(tracker.sentCount).toBe(1);
    expect(el.decls.get(P)).toEqual({ value: '20px', priority: 'important' });
  });

  it('T-3. verifySent가 전송 이전 값으로 원복하고 기록을 비우며, 이후 restoreAll과 충돌하지 않는다 (AC-2·AC-6)', () => {
    const tracker = new EditTracker();
    const el = new FakeElement();
    const log = tracker.edit([], el, ch(el, '0px', '10px'));
    tracker.endSend(log, tracker.beginSend(log));
    tracker.finishSend();

    // 소스를 반영했다고 가정: 해제하면 규칙값 10px이 읽힌다.
    const items = tracker.verifySent(reader('10px'));
    expect(items?.map((i) => i.status)).toEqual(['match']);
    expect(tracker.sentCount).toBe(0);
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);

    tracker.restoreAll();
    expect(el.decls.size).toBe(0);
    expect(tracker.verifySent(reader('10px'))).toEqual([]);
  });
});

