import { describe, expect, it } from 'vitest';
import { EDITABLE_PROPERTIES, containerOf } from '../src/properties.js';

const LAYOUT_NAMES = [
  'display',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-content',
  'grid-template-columns',
  'grid-template-rows',
  'row-gap',
  'column-gap',
];

const layout = EDITABLE_PROPERTIES.filter((p) => p.group === 'layout');

describe('containerOf', () => {
  it('flex·inline-flex는 flex, grid·inline-grid는 grid로 판정한다', () => {
    expect(containerOf('flex')).toBe('flex');
    expect(containerOf('inline-flex')).toBe('flex');
    expect(containerOf('grid')).toBe('grid');
    expect(containerOf('inline-grid')).toBe('grid');
  });

  it('그 밖의 display나 값 없음은 null을 돌려준다', () => {
    expect(containerOf('block')).toBeNull();
    expect(containerOf('')).toBeNull();
    expect(containerOf(undefined)).toBeNull();
  });
});

describe('레이아웃 속성 목록', () => {
  it('layout 그룹 항목이 정해진 순서로 배열 끝 10개에 놓인다', () => {
    expect(layout.map((p) => p.name)).toEqual(LAYOUT_NAMES);
    expect(EDITABLE_PROPERTIES.slice(-10).map((p) => p.name)).toEqual(LAYOUT_NAMES);
  });

  it('display는 항상 보이고 나머지는 해당 컨테이너에서만 보인다', () => {
    const containers = Object.fromEntries(layout.map((p) => [p.name, p.containers]));
    expect(containers['display']).toBeUndefined();
    expect(containers).toEqual({
      display: undefined,
      'flex-direction': ['flex'],
      'flex-wrap': ['flex'],
      'justify-content': ['flex', 'grid'],
      'align-items': ['flex', 'grid'],
      'align-content': ['flex', 'grid'],
      'grid-template-columns': ['grid'],
      'grid-template-rows': ['grid'],
      'row-gap': ['flex', 'grid'],
      'column-gap': ['flex', 'grid'],
    });
  });

  it('신규 항목에 단축 속성(gap·flex-flow·grid-template·place-*)은 없다', () => {
    for (const { name } of layout) {
      expect(['gap', 'flex-flow', 'grid-template']).not.toContain(name);
      expect(name.startsWith('place-')).toBe(false);
    }
  });
});
