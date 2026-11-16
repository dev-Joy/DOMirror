import { describe, expect, it } from 'vitest';
import { pickAuthored, specificity, splitSelectorList, type Declaration } from '../src/css-read.js';

describe('splitSelectorList', () => {
  it('최상위 쉼표로만 나눈다', () => {
    expect(splitSelectorList('h1, .a:is(.b, .c) > p ,[data-x="1,2"]')).toEqual(['h1', '.a:is(.b, .c) > p', '[data-x="1,2"]']);
  });
});

describe('specificity', () => {
  it.each([
    ['h1', [0, 0, 1]],
    ['.card .title', [0, 2, 0]],
    ['#main > ul li.active', [1, 1, 2]],
    ['a[href]:hover', [0, 2, 1]],
    ['p::before', [0, 0, 2]],
    ['p:before', [0, 0, 2]],
    ['*', [0, 0, 0]],
    [':where(#a, .b) p', [0, 0, 1]],
    [':is(#a, .b) p', [1, 0, 1]],
    ['li:not(.x):nth-child(2)', [0, 2, 1]],
  ] as const)('%s → %j', (selector, expected) => {
    expect(specificity(selector)).toEqual(expected);
  });
});

function decl(value: string, overrides: Partial<Declaration> = {}): Declaration {
  return { value, important: false, inline: false, specificity: [0, 1, 0], order: 0, ...overrides };
}

describe('pickAuthored', () => {
  it('선언이 없으면 null', () => {
    expect(pickAuthored([])).toBeNull();
  });

  it('명시도가 높은 규칙, 같으면 나중 규칙', () => {
    expect(pickAuthored([decl('1px', { specificity: [1, 0, 0] }), decl('2px', { order: 5 })])).toBe('1px');
    expect(pickAuthored([decl('1px', { order: 1 }), decl('2px', { order: 2 })])).toBe('2px');
  });

  it('인라인은 일반 규칙보다, !important 규칙은 일반 인라인보다 우선한다', () => {
    expect(pickAuthored([decl('1px', { specificity: [9, 9, 9] }), decl('2px', { inline: true, specificity: [0, 0, 0] })])).toBe('2px');
    expect(pickAuthored([decl('1px', { important: true }), decl('2px', { inline: true })])).toBe('1px');
    expect(pickAuthored([decl('1px', { important: true }), decl('2px', { inline: true, important: true })])).toBe('2px');
  });
});
