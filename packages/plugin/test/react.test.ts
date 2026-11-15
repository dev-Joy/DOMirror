import { describe, expect, it } from 'vitest';
import { reactInjector } from '../src/injectors/react.js';

const root = '/proj';
const id = '/proj/src/App.tsx';

function run(code: string, fileId = id): string | null {
  return reactInjector.transform(code, fileId, { root })?.code ?? null;
}

/** 소스에서 needle이 시작하는 위치를 1부터 시작하는 line:column으로 계산한다. */
function locationOf(code: string, needle: string): string {
  const offset = code.indexOf(needle);
  const before = code.slice(0, offset).split('\n');
  return `${before.length}:${(before.at(-1) ?? '').length + 1}`;
}

describe('reactInjector', () => {
  it('쿼리 없는 .jsx/.tsx만 대상으로 한다', () => {
    expect(reactInjector.test('/proj/src/App.tsx')).toBe(true);
    expect(reactInjector.test('/proj/src/App.jsx')).toBe(true);
    expect(reactInjector.test('/proj/src/App.ts')).toBe(false);
    expect(reactInjector.test('/proj/src/App.tsx?raw')).toBe(false);
  });

  it('호스트 요소에만 주입하고 컴포넌트·Fragment는 제외한다', () => {
    const code = 'export const A = () => (\n  <>\n    <div className="a">\n      <Card />\n      <span>x</span>\n    </div>\n  </>\n);\n';
    const out = run(code);
    expect(out).not.toBeNull();
    expect(out).toContain('<div data-domirror="src/App.tsx:3:5" className="a">');
    expect(out).toContain('<span data-domirror="src/App.tsx:5:7">');
    expect(out).toContain('<Card />');
    expect(out).toContain('<>');
    expect(out?.match(/data-domirror/g)).toHaveLength(2);
  });

  it('한글·이모지 주석 뒤 요소의 위치가 UTF-16 기준으로 정확하다', () => {
    const code = '// 한글 주석 😀 위치 검증\nconst x = 1; /* 다국어 */ export const A = () => <h1>제목</h1>;\n';
    expect(run(code)).toContain(`<h1 data-domirror="src/App.tsx:${locationOf(code, '<h1')}">제목</h1>`);
  });

  it('기존 data-domirror 속성이 있으면 보존한다', () => {
    const code = 'export const A = () => <div data-domirror="keep:1:1" />;\n';
    expect(run(code)).toBeNull();
  });

  it('문자열 리터럴 속 "<div"는 바꾸지 않는다', () => {
    const code = 'export const s = "<div class=x>";\nexport const A = () => <p>{s}</p>;\n';
    const out = run(code);
    expect(out).toContain('"<div class=x>"');
    expect(out?.match(/data-domirror/g)).toHaveLength(1);
  });

  it('self-closing 태그에도 주입한다', () => {
    const code = 'export const A = () => <img src="a.png" />;\n';
    expect(run(code)).toContain('<img data-domirror="src/App.tsx:1:24" src="a.png" />');
  });

  it('구문 오류 입력은 null', () => {
    expect(run('export const A = () => <div>;\n')).toBeNull();
  });

  it('소스맵을 함께 반환한다', () => {
    const result = reactInjector.transform('export const A = () => <div />;\n', id, { root });
    expect(result?.map).toMatchObject({ sources: [id] });
  });
});
