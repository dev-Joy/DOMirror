import { describe, expect, it } from 'vitest';
import { AppliedStyles, applyStyle, restoreStyle, type InlineStyle, type StyledElement } from '../src/applier.js';

/** 인라인 style 선언과 style 속성 유무만 흉내 내는 가짜 요소. */
class FakeElement implements StyledElement {
  readonly decls = new Map<string, { value: string; priority: string }>();
  readonly style: InlineStyle;
  hasStyle: boolean;

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.decls.set(k, { value: v, priority: '' });
    this.hasStyle = this.decls.size > 0;
    const decls = this.decls;
    const setHasStyle = (): void => {
      this.hasStyle = true;
    };
    this.style = {
      get length() {
        return decls.size;
      },
      getPropertyValue: (p) => decls.get(p)?.value ?? '',
      getPropertyPriority: (p) => decls.get(p)?.priority ?? '',
      setProperty: (p, value, priority = '') => {
        decls.set(p, { value, priority });
        setHasStyle();
      },
      removeProperty: (p) => {
        const old = decls.get(p)?.value ?? '';
        decls.delete(p);
        return old;
      },
    };
  }

  hasAttribute(name: string): boolean {
    return name === 'style' && this.hasStyle;
  }

  removeAttribute(name: string): void {
    if (name === 'style') this.hasStyle = false;
  }
}

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
    applied.apply('k', a, 'padding-top', '10px');
    applied.apply('k', a, 'padding-top', '12px');
    applied.apply('k', b, 'padding-top', '12px');
    applied.revert('k');
    expect(a.decls.size).toBe(0);
    expect(a.hasAttribute('style')).toBe(false);
    expect(b.decls.get('padding-top')).toEqual({ value: '2px', priority: '' });
  });

  it('forget한 항목도 restoreAll에서는 최초 상태로 되돌린다 (NFR-3)', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k1', el, 'padding-top', '10px');
    applied.apply('k2', el, 'color', 'red');
    applied.forget('k1');
    applied.revert('k1');
    expect(el.decls.get('padding-top')?.value).toBe('10px');
    applied.restoreAll();
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('전송 후 새 항목은 그 시점 값을 기준으로 되돌린다', () => {
    const el = new FakeElement();
    const applied = new AppliedStyles();
    applied.apply('k', el, 'width', '100px');
    applied.forget('k');
    applied.apply('k', el, 'width', '200px');
    applied.revert('k');
    expect(el.decls.get('width')).toEqual({ value: '100px', priority: 'important' });
  });
});
