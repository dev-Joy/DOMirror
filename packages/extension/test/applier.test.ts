import { describe, expect, it } from 'vitest';
import { AppliedStyles, applyStyle, restoreStyle } from '../src/applier.js';
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
