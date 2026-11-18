import { describe, expect, it } from 'vitest';
import { aggregateStatus, measureReleased, summarize, type ReadComputed } from '../src/verify.js';
import { FakeElement } from './fake-element.js';

/** 규칙값을 흉내 낸다: 인라인이 있으면 인라인, 없으면 규칙값(DOM에 붙은 요소의 computed). */
function sheetReader(rules: Record<string, string>): ReadComputed {
  return (el, property) => el.style.getPropertyValue(property) || rules[property] || '';
}

/** 인라인 선언이 없던 상태. */
const NONE = { value: '', priority: '' };

describe('measureReleased', () => {
  it('V-1. 해제 후 computed가 보낸 값과 같으면 match', () => {
    const el = new FakeElement();
    const result = measureReleased(el, 'padding-top', '10px', NONE, {}, sheetReader({ 'padding-top': '10px' }));
    expect(result).toEqual({ actual: '10px', expected: '10px', status: 'match' });
    expect(el.decls.size).toBe(0);
  });

  it('V-2. 해제 후 computed가 보낸 값과 다르면 mismatch (소스 미반영)', () => {
    const el = new FakeElement();
    const result = measureReleased(el, 'padding-top', '12px', NONE, {}, sheetReader({ 'padding-top': '10px' }));
    expect(result).toEqual({ actual: '10px', expected: '12px', status: 'mismatch' });
    expect(el.decls.size).toBe(0);
  });

  it('V-3. 보낸 값이나 확인 값이 비어 있으면 unverifiable(empty)', () => {
    const el = new FakeElement({ 'padding-top': '4px' });
    expect(measureReleased(el, 'padding-top', '', { value: '4px', priority: '' }, {}, sheetReader({}))).toEqual({
      actual: '',
      expected: '',
      status: 'unverifiable',
      reason: 'empty',
    });
    // 보낸 값이 빈 문자열이어도 해제는 한다.
    expect(el.decls.get('padding-top')).toEqual({ value: '4px', priority: '' });

    // 해제 후 계산값이 없는 shorthand 등(규칙·인라인 모두 빈 값)
    const shorthand = new FakeElement();
    const empty = measureReleased(shorthand, 'border', '1px solid red', NONE, {}, sheetReader({}));
    expect(empty.status).toBe('unverifiable');
    expect(empty.reason).toBe('empty');
    expect(empty.actual).toBe('');
  });

  it('V-4. 원래 style 속성이 없던 요소는 측정 뒤 빈 style 속성을 남기지 않는다 (NFR-1)', () => {
    const el = new FakeElement();
    measureReleased(el, 'padding-top', '10px', NONE, { removeEmptyStyleAttribute: true }, sheetReader({ 'padding-top': '10px' }));
    expect(el.decls.size).toBe(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('V-6. 측정 뒤 transition 인라인을 측정 전 상태로 되돌린다 (R-2)', () => {
    const plain = new FakeElement();
    measureReleased(plain, 'padding-top', '10px', NONE, {}, sheetReader({ 'padding-top': '10px' }));
    expect(plain.decls.has('transition')).toBe(false);

    // 원래 longhand 인라인이 있던 요소는 값이 보존된다(shorthand가 덮어써 지우지 않는다).
    const longhand = new FakeElement({ 'transition-duration': '1s' });
    measureReleased(longhand, 'padding-top', '10px', NONE, {}, sheetReader({ 'padding-top': '10px' }));
    expect(longhand.decls.has('transition')).toBe(false);
    expect(longhand.decls.get('transition-duration')).toEqual({ value: '1s', priority: '' });

    // 원래 shorthand 인라인이 있던 요소는 그 값으로 돌아간다.
    const shorthand = new FakeElement({ transition: 'all 1s' });
    measureReleased(shorthand, 'padding-top', '10px', NONE, {}, sheetReader({ 'padding-top': '10px' }));
    expect(shorthand.decls.get('transition')).toEqual({ value: 'all 1s', priority: '' });
  });
});

describe('aggregateStatus / summarize', () => {
  const match = { actual: '1px', expected: '1px', status: 'match' } as const;
  const mismatch = { actual: '1px', expected: '2px', status: 'mismatch' } as const;
  const unknown = { actual: '', expected: '', status: 'unverifiable', reason: 'detached' } as const;

  it('V-5. 불일치가 하나라도 있으면 불일치, 아니면 확인 불가, 나머지는 일치 (FR-5)', () => {
    expect(aggregateStatus([match, mismatch])).toBe('mismatch');
    expect(aggregateStatus([mismatch, unknown])).toBe('mismatch');
    expect(aggregateStatus([match, unknown])).toBe('unverifiable');
    expect(aggregateStatus([match, match])).toBe('match');
  });

  it('V-7. 상태별 건수를 센다', () => {
    expect(summarize([match, match, mismatch, unknown])).toEqual({ match: 2, mismatch: 1, unverifiable: 1 });
    expect(summarize([])).toEqual({ match: 0, mismatch: 0, unverifiable: 0 });
  });
});
