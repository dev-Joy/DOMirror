import { describe, expect, it } from 'vitest';
import { formatSourceLocation, parseSourceLocation } from '../src/index.js';

describe('formatSourceLocation / parseSourceLocation', () => {
  it('왕복 변환이 같은 값을 돌려준다', () => {
    const loc = { file: 'src/App.tsx', line: 12, column: 5 };
    expect(formatSourceLocation(loc)).toBe('src/App.tsx:12:5');
    expect(parseSourceLocation(formatSourceLocation(loc))).toEqual(loc);
  });

  it('경로에 콜론이 있어도 오른쪽 2개만 분리한다', () => {
    expect(parseSourceLocation('C:/a/b.tsx:3:4')).toEqual({ file: 'C:/a/b.tsx', line: 3, column: 4 });
  });

  it.each([
    '',
    'src/App.tsx',
    'src/App.tsx:12',
    ':12:5',
    'src/App.tsx:0:5',
    'src/App.tsx:12:0',
    'src/App.tsx:-1:5',
    'src/App.tsx:1.5:2',
    'src/App.tsx:a:b',
    'src/App.tsx:12:',
  ])('잘못된 값 %j 은 null', (value) => {
    expect(parseSourceLocation(value)).toBeNull();
  });
});
