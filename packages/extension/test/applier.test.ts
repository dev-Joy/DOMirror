import { describe, expect, it } from 'vitest';
import { AppliedStyles, applyStyle, restoreStyle } from '../src/applier.js';
import type { ReadComputed } from '../src/verify.js';
import { FakeElement } from './fake-element.js';

describe('applyStyle / restoreStyle', () => {
  it('!important로 적용하고 이전 인라인 값·우선순위로 원복한다', () => {
    const el = new FakeElement({ 'padding-top': '4px' });
    const prev = applyStyle(el, 'padding-top', '10px');
    expect(prev).toEqual({ value: '4px', priority: '' });
    expect(el.decls.get('padding-top')).toEqual({ value: '10px', priority: 'important' });
    restoreStyle(el, 'padding-top', prev);
    expect(el.decls.get('padding-top')).toEqual({ value: '4px', priority: '' });
  });

  it('인라인 선언이 없던 속성은 제거하고, 요청 시 빈 style 속성도 지운다', () => {
    const el = new FakeElement();
    const prev = applyStyle(el, 'color', 'red');
    restoreStyle(el, 'color', prev, { removeEmptyStyleAttribute: true });
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });
});

describe('AppliedStyles', () => {
  it('같은 key의 여러 요소를 항목 시작 전 값으로 함께 되돌린다 (E-2·FR-8)', () => {
    const a = new FakeElement();
    const b = new FakeElement({ 'padding-top': '2px' });
    const applied = new AppliedStyles();
    applied.apply('k', a, 'padding-top', '10px', '');
    applied.apply('k', a, 'padding-top', '12px', '');
    applied.apply('k', b, 'padding-top', '12px', '2px');
    applied.revert('k');
    expect(a.decls.size).toBe(0);
    expect(a.hasAttribute('style')).toBe(false);
    expect(b.decls.get('padding-top')).toEqual({ value: '2px', priority: '' });
  });

  it('전송으로 추적을 끝낸(forget) 항목도 restoreAll에서는 최초 상태로 되돌린다 (NFR-3)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k1', el, 'padding-top', '10px', '0px');
    applied.apply('k2', el, 'color', 'red', 'black');
    applied.forget('k1');
    applied.revert('k1');
    expect(el.decls.get('padding-top')?.value).toBe('10px');
    applied.restoreAll();
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('R-1 회귀: 같은 소스 key의 1건 되돌리기가 class가 다른 요소까지 모두 원복한다', () => {
    const item = new FakeElement();
    const active = new FakeElement();
    const applied = new AppliedStyles();
    const key = 'src/App.vue:5:7|padding-top';
    applied.apply(key, item, 'padding-top', '10px', '0px');
    applied.apply(key, active, 'padding-top', '20px', '0px');
    applied.revert(key);
    expect(item.decls.size).toBe(0);
    expect(active.decls.size).toBe(0);
  });

  it('R-4 회귀: 분리된 요소의 key를 돌려주고 원복 대상에서 뺀다. 다시 감지하지 않는다', () => {
    const kept = new FakeElement();
    const replaced = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k1', kept, 'padding-top', '10px', '0px');
    applied.apply('k2', replaced, 'color', 'red', 'black');
    expect([...applied.pruneDetached()]).toEqual([]);
    replaced.isConnected = false; // HMR로 교체
    expect([...applied.pruneDetached()]).toEqual(['k2']);
    expect([...applied.pruneDetached()]).toEqual([]);
    // 교체된 새 요소를 다시 편집하면 그 요소만 추적한다.
    const fresh = new FakeElement();
    applied.apply('k2', fresh, 'color', 'blue', 'black');
    applied.revert('k2');
    expect(fresh.decls.size).toBe(0);
    expect(replaced.decls.get('color')?.value).toBe('red');
  });

  it('전송 후(forget) 새 항목은 그 시점 값을 기준으로 되돌린다', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'width', '100px', 'auto');
    applied.forget('k');
    applied.apply('k', el, 'width', '200px', '100px');
    applied.revert('k');
    expect(el.decls.get('width')).toEqual({ value: '100px', priority: 'important' });
  });

  it('처음부터 원래 값으로 적용하면 인라인 흔적 없이 false를 돌려준다(style 속성도 없음)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    expect(applied.apply('k', el, 'padding-top', ' 0px ', '0px')).toBe(false);
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
    // 추적하지 않으므로 되돌려도 아무것도 하지 않는다.
    applied.revert('k');
    expect(el.decls.size).toBe(0);
  });

  it('D-2: 요소마다 자기 원래 값과 비교하고, 모든 요소가 원래 값일 때만 false', () => {
    const active = new FakeElement();
    const item = new FakeElement();
    const applied = new AppliedStyles();
    expect(applied.apply('k', active, 'padding-top', '20px', '16px')).toBe(true);
    expect(applied.apply('k', item, 'padding-top', '16px', '8px')).toBe(true);
    expect(item.decls.get('padding-top')).toEqual({ value: '16px', priority: 'important' });
    // 두 번째 이후 편집의 original 인자(현재 인라인)는 무시한다.
    expect(applied.apply('k', active, 'padding-top', '16px', '20px')).toBe(true);
    expect(active.decls.size).toBe(0);
    expect(applied.apply('k', item, 'padding-top', '8px', '16px')).toBe(false);
    expect(item.decls.size).toBe(0);
    expect(item.hasAttribute('style')).toBe(false);
  });

  it('pruneDetached로 요소가 0개가 된 record는 삭제되어, 되돌려도 분리된 요소를 건드리지 않는다', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '0px');
    el.isConnected = false;
    expect([...applied.pruneDetached()]).toEqual(['k']);
    applied.revert('k');
    expect(el.decls.get('padding-top')?.value).toBe('10px');
  });

  it('forget은 추적만 끝내고 인라인 값은 그대로 둔다. 추적하지 않는 key는 무시한다 (FR-9)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '0px');
    applied.forget('k');
    applied.forget('none');
    expect(el.decls.get('padding-top')).toEqual({ value: '10px', priority: 'important' });
    applied.revert('k');
    expect(el.decls.get('padding-top')).toEqual({ value: '10px', priority: 'important' });
  });
});

const SRC = { file: 'src/App.vue', line: 5, column: 7, inherited: false };
const INFO = { selectorHint: 'li.item', source: SRC };
/** 인라인 값만 보는 reader(규칙값 없음). */
const inlineReader: ReadComputed = (el, property) => el.style.getPropertyValue(property);

describe('AppliedStyles: 전송 기록·반영 확인', () => {
  it('A-1. markSent는 인라인을 보낸 값 그대로 두고 sentCount만 늘린다 (FR-1·AC-1)', () => {
    const el = new FakeElement({ 'padding-top': '4px' });
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '4px');
    applied.markSent('k', '10px', INFO);
    expect(el.decls.get('padding-top')).toEqual({ value: '10px', priority: 'important' });
    expect(applied.sentCount).toBe(1);
    // 전송 기록으로 옮겼으므로 되돌리기는 더 이상 추적하지 않는다(페이지 표시 유지).
    applied.revert('k');
    expect(el.decls.get('padding-top')).toEqual({ value: '10px', priority: 'important' });
  });

  it('A-2. releaseSent가 전송 이전 인라인 값으로 원복하고 기록을 비운다 (FR-3·AC-2)', () => {
    const plain = new FakeElement();
    const styled = new FakeElement({ 'padding-top': '4px' });
    styled.decls.set('padding-top', { value: '4px', priority: 'important' });
    const applied = new AppliedStyles();
    applied.apply('k1', plain, 'padding-top', '10px', '0px');
    applied.apply('k2', styled, 'padding-top', '12px', '4px');
    applied.markSent('k1', '10px', INFO);
    applied.markSent('k2', '12px', INFO);
    expect(applied.sentCount).toBe(2);

    const items = applied.releaseSent(inlineReader);
    expect(items.map((i) => i.key)).toEqual(['k1', 'k2']);
    // 원래 선언이 없던 요소는 제거하고 빈 style 속성도 지운다.
    expect(plain.decls.size).toBe(0);
    expect(plain.hasAttribute('style')).toBe(false);
    // 원래 인라인이 있던 요소는 value·priority를 복원한다.
    expect(styled.decls.get('padding-top')).toEqual({ value: '4px', priority: 'important' });
    expect(applied.sentCount).toBe(0);
  });

  it('A-3. 반영 확인은 미전송 편집 항목을 건드리지 않고, 그 되돌리기도 그대로 동작한다 (FR-3·AC-3)', () => {
    const sent = new FakeElement();
    const pending = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k1', sent, 'padding-top', '10px', '0px');
    applied.apply('k2', pending, 'color', 'red', 'black');
    applied.markSent('k1', '10px', INFO);
    applied.releaseSent(inlineReader);
    expect(sent.decls.size).toBe(0);
    expect(pending.decls.get('color')).toEqual({ value: 'red', priority: 'important' });
    applied.revert('k2');
    expect(pending.decls.size).toBe(0);
  });

  it('A-4. 전송 뒤 같은 key를 다시 편집하면 해제하지 않고, 이어서 되돌리면 최초 값으로 간다 (D-S2·AC-4)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '0px');
    applied.markSent('k', '10px', INFO);
    applied.apply('k', el, 'padding-top', '30px', '10px');

    const items = applied.releaseSent(inlineReader);
    expect(items[0].elements).toEqual([{ actual: '', expected: '', status: 'unverifiable', reason: 'pending-edit' }]);
    expect(items[0].status).toBe('unverifiable');
    // 미전송 편집값은 그대로 두고, 이후 되돌리면 전송 이전 값(인라인 없음)으로 간다.
    expect(el.decls.get('padding-top')).toEqual({ value: '30px', priority: 'important' });
    applied.revert('k');
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('A-5. releaseSent 뒤 restoreAll은 최초 상태를 유지하고, 끄기는 전송 기록도 비운다 (FR-6·AC-6)', () => {
    const el = new FakeElement({ 'padding-top': '4px' });
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '4px');
    applied.markSent('k', '10px', INFO);
    applied.releaseSent(inlineReader);
    expect(el.decls.get('padding-top')).toEqual({ value: '4px', priority: '' });
    applied.restoreAll();
    expect(el.decls.get('padding-top')).toEqual({ value: '4px', priority: '' });
    expect(applied.sentCount).toBe(0);
    expect(applied.releaseSent(inlineReader)).toEqual([]);

    // 해제 전에 끄면 기록이 비고, 원래 인라인 값으로 원복한다.
    applied.apply('k', el, 'padding-top', '10px', '4px');
    applied.markSent('k', '10px', INFO);
    applied.restoreAll();
    expect(applied.sentCount).toBe(0);
    expect(el.decls.get('padding-top')).toEqual({ value: '4px', priority: '' });
  });

  it('A-6. 분리된 요소는 detached(확인 불가)로 보고하고 아무것도 쓰지 않는다 (E-5·AC-5)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '0px');
    applied.markSent('k', '10px', INFO);
    el.isConnected = false;
    const before = new Map(el.decls);

    const items = applied.releaseSent(inlineReader);
    expect(items[0].elements).toEqual([{ actual: '', expected: '', status: 'unverifiable', reason: 'detached' }]);
    expect(items[0].status).toBe('unverifiable');
    expect(el.decls).toEqual(before);
  });

  it('A-7. 같은 key를 다시 보내도 요소별 이전값은 최초값을 유지하고 보낸 값만 갱신한다 (D-S3·E-4)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'padding-top', '10px', '0px');
    applied.markSent('k', '10px', INFO);
    applied.apply('k', el, 'padding-top', '20px', '10px');
    applied.markSent('k', '20px', { selectorHint: 'li.item.active', source: SRC });

    expect(applied.sentCount).toBe(1);
    const items = applied.releaseSent(inlineReader);
    expect(items[0].after).toBe('20px');
    expect(items[0].info.selectorHint).toBe('li.item.active');
    expect(el.decls.size).toBe(0);
  });

  it('A-8. 우리가 적용한 적 없는 key의 markSent는 무시한다', () => {
    const applied = new AppliedStyles();
    applied.markSent('none', '10px', INFO);
    expect(applied.sentCount).toBe(0);
    expect(applied.releaseSent(inlineReader)).toEqual([]);
  });
});

