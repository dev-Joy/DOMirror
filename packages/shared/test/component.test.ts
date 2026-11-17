import { describe, expect, it } from 'vitest';
import {
  DOMIRROR_COMPONENT_ATTR,
  DOMIRROR_DS_ATTR,
  formatComponentInfo,
  parseComponentInfo,
} from '../src/index.js';

describe('formatComponentInfo / parseComponentInfo', () => {
  it('이름과 위치를 "|"로 이어 붙인다', () => {
    expect(formatComponentInfo({ name: 'Card', source: 'src/App.tsx' })).toBe('Card|src/App.tsx');
  });

  it('왕복 변환이 같은 값을 돌려준다', () => {
    const info = { name: 'Card', source: 'src/App.tsx' };
    expect(parseComponentInfo(formatComponentInfo(info))).toEqual(info);
  });

  it('"이름|위치"를 분리한다', () => {
    expect(parseComponentInfo('Card|src/App.tsx')).toEqual({ name: 'Card', source: 'src/App.tsx' });
  });

  it('두 번째 "|"부터는 위치에 그대로 남는다', () => {
    expect(parseComponentInfo('Card|src/a|b.tsx')).toEqual({ name: 'Card', source: 'src/a|b.tsx' });
  });

  it.each(['|x', 'x|', '', 'nopipe'])('잘못된 값 %j 은 null', (value) => {
    expect(parseComponentInfo(value)).toBeNull();
  });
});

describe('컴포넌트 관련 상수', () => {
  it('속성 이름이 문서와 일치한다', () => {
    expect(DOMIRROR_COMPONENT_ATTR).toBe('data-domirror-component');
    expect(DOMIRROR_DS_ATTR).toBe('data-domirror-ds');
  });
});
