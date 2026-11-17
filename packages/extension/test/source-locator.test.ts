import { DOMIRROR_ATTR, DOMIRROR_COMPONENT_ATTR, DOMIRROR_DS_ATTR, DOMIRROR_PROTECTED_ATTR } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import {
  countSameSource,
  locate,
  locateComponent,
  sameSourceSelector,
  selectorHint,
  type LocatableElement,
} from '../src/source-locator.js';

/** `closest('[data-domirror]')`만 흉내 내는 가짜 요소. */
class FakeElement implements LocatableElement {
  constructor(
    readonly tagName: string,
    private readonly attrs: Record<string, string>,
    readonly parentElement: FakeElement | null = null,
  ) {}

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  closest(selectors: string): FakeElement | null {
    expect(selectors).toBe(`[${DOMIRROR_ATTR}]`);
    if (this.getAttribute(DOMIRROR_ATTR) !== null) return this;
    return this.parentElement?.closest(selectors) ?? null;
  }
}

describe('locate', () => {
  it('요소 자신의 위치를 쓰면 inherited=false', () => {
    const el = new FakeElement('DIV', { [DOMIRROR_ATTR]: 'src/App.tsx:12:5' });
    expect(locate(el)).toEqual({
      location: { file: 'src/App.tsx', line: 12, column: 5 },
      inherited: false,
      protected: false,
    });
  });

  it('속성 없는 요소는 가장 가까운 조상 위치를 쓴다 (E-1·E-3)', () => {
    const root = new FakeElement('MAIN', { [DOMIRROR_ATTR]: 'src/App.tsx:7:5' });
    const section = new FakeElement('SECTION', { [DOMIRROR_ATTR]: 'src/components/Card.tsx:16:5' }, root);
    const span = new FakeElement('SPAN', { class: 'card-label' }, section);
    expect(locate(span)).toEqual({
      location: { file: 'src/components/Card.tsx', line: 16, column: 5 },
      inherited: true,
      protected: false,
    });
  });

  it('값이 깨진 요소는 건너뛰고 더 위 조상을 찾는다', () => {
    const root = new FakeElement('MAIN', { [DOMIRROR_ATTR]: 'src/App.tsx:7:5' });
    const broken = new FakeElement('DIV', { [DOMIRROR_ATTR]: 'garbage' }, root);
    expect(locate(broken)).toEqual({
      location: { file: 'src/App.tsx', line: 7, column: 5 },
      inherited: true,
      protected: false,
    });
  });

  it('조상에도 위치가 없으면 null (전송 제외)', () => {
    const body = new FakeElement('BODY', {});
    const div = new FakeElement('DIV', { [DOMIRROR_ATTR]: 'x:0:1' }, body);
    expect(locate(div)).toBeNull();
  });

  it('자신이 보호 속성을 가지면 protected=true (AC-4)', () => {
    const el = new FakeElement('DIV', {
      [DOMIRROR_ATTR]: 'src/App.tsx:12:5',
      [DOMIRROR_PROTECTED_ATTR]: '',
    });
    expect(locate(el)).toEqual({
      location: { file: 'src/App.tsx', line: 12, column: 5 },
      inherited: false,
      protected: true,
    });
  });

  it('조상에게 위치와 보호 속성을 함께 물려받으면 protected=true (AC-4·E-1)', () => {
    const root = new FakeElement('MAIN', {
      [DOMIRROR_ATTR]: 'src/App.tsx:7:5',
      [DOMIRROR_PROTECTED_ATTR]: '',
    });
    const span = new FakeElement('SPAN', { class: 'card-label' }, root);
    expect(locate(span)).toEqual({
      location: { file: 'src/App.tsx', line: 7, column: 5 },
      inherited: true,
      protected: true,
    });
  });

  it('보호 속성이 없으면 protected=false (AC-4)', () => {
    const el = new FakeElement('DIV', { [DOMIRROR_ATTR]: 'src/App.tsx:12:5' });
    expect(locate(el)).toEqual({
      location: { file: 'src/App.tsx', line: 12, column: 5 },
      inherited: false,
      protected: false,
    });
  });

  it('자신에 보호 속성만 있고 위치는 조상이 주면 protected=false (AC-4·E-1)', () => {
    const root = new FakeElement('MAIN', { [DOMIRROR_ATTR]: 'src/App.tsx:7:5' });
    const div = new FakeElement('DIV', { [DOMIRROR_PROTECTED_ATTR]: '' }, root);
    expect(locate(div)).toEqual({
      location: { file: 'src/App.tsx', line: 7, column: 5 },
      inherited: true,
      protected: false,
    });
  });
});

/** `closest('[data-domirror-component]')` 체인을 흉내 내는 가짜 요소(AC-6). */
class FakeComponentElement implements LocatableElement {
  constructor(
    readonly tagName: string,
    private readonly attrs: Record<string, string>,
    readonly parentElement: FakeComponentElement | null = null,
  ) {}

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  closest(selectors: string): FakeComponentElement | null {
    expect(selectors).toBe(`[${DOMIRROR_COMPONENT_ATTR}]`);
    if (this.getAttribute(DOMIRROR_COMPONENT_ATTR) !== null) return this;
    return this.parentElement?.closest(selectors) ?? null;
  }
}

describe('locateComponent', () => {
  it('요소 자신의 컴포넌트 정보를 이름·정의 파일로 나눈다', () => {
    const el = new FakeComponentElement('BUTTON', { [DOMIRROR_COMPONENT_ATTR]: 'Button|src/ds/Button.tsx' });
    expect(locateComponent(el)).toEqual({ name: 'Button', source: 'src/ds/Button.tsx', designSystem: false });
  });

  it('data-domirror-ds가 있으면 designSystem=true', () => {
    const el = new FakeComponentElement('BUTTON', {
      [DOMIRROR_COMPONENT_ATTR]: 'Button|src/ds/Button.tsx',
      [DOMIRROR_DS_ATTR]: '',
    });
    expect(locateComponent(el)).toEqual({ name: 'Button', source: 'src/ds/Button.tsx', designSystem: true });
  });

  it('값이 깨진 요소는 건너뛰고 더 위 조상을 찾는다', () => {
    const root = new FakeComponentElement('MAIN', {
      [DOMIRROR_COMPONENT_ATTR]: 'Card|src/components/Card.tsx',
    });
    const broken = new FakeComponentElement('DIV', { [DOMIRROR_COMPONENT_ATTR]: 'garbage' }, root);
    expect(locateComponent(broken)).toEqual({
      name: 'Card',
      source: 'src/components/Card.tsx',
      designSystem: false,
    });
  });

  it('자신과 조상에 컴포넌트 속성이 없으면 null (E-9)', () => {
    const body = new FakeComponentElement('BODY', {});
    const div = new FakeComponentElement('DIV', { class: 'plain' }, body);
    expect(locateComponent(div)).toBeNull();
  });
});

describe('sameSourceSelector / countSameSource', () => {
  it('속성 값 일치 선택자를 만든다', () => {
    expect(sameSourceSelector('src/App.tsx:14:11')).toBe(`[${DOMIRROR_ATTR}="src/App.tsx:14:11"]`);
  });

  it('따옴표·역슬래시·개행을 이스케이프한다', () => {
    expect(sameSourceSelector('C:\\a"b\nc.tsx:1:1')).toBe(`[${DOMIRROR_ATTR}="C:\\\\a\\"b\\a c.tsx:1:1"]`);
  });

  it('루트의 querySelectorAll 결과 개수를 센다 (E-2)', () => {
    let used = '';
    const root = {
      querySelectorAll(selector: string) {
        used = selector;
        return { length: 4 } as unknown as NodeListOf<Element>;
      },
    } as Pick<ParentNode, 'querySelectorAll'>;
    expect(countSameSource('src/App.tsx:14:11', root)).toBe(4);
    expect(used).toBe(sameSourceSelector('src/App.tsx:14:11'));
  });
});

describe('selectorHint', () => {
  it('태그·id·클래스를 합친다', () => {
    expect(selectorHint(new FakeElement('DIV', { id: 'main', class: ' card  active ' }))).toBe('div#main.card.active');
  });

  it('클래스·id가 없으면 태그만', () => {
    expect(selectorHint(new FakeElement('LI', { class: '   ' }))).toBe('li');
  });

  it('클래스는 3개까지만 쓰고 생략을 표시한다', () => {
    expect(selectorHint(new FakeElement('P', { class: 'a b c d' }))).toBe('p.a.b.c…');
  });
});
