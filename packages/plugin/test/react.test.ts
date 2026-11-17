import { describe, expect, it } from 'vitest';
import { reactInjector } from '../src/injectors/react.js';

const root = '/proj';
const id = '/proj/src/App.tsx';

type DesignSystemMatcher = NonNullable<Parameters<typeof reactInjector.transform>[2]['isDesignSystem']>;
type ProtectedMatcher = NonNullable<Parameters<typeof reactInjector.transform>[2]['isProtected']>;

function run(
  code: string,
  fileId = id,
  isDesignSystem?: DesignSystemMatcher,
  isProtected?: ProtectedMatcher,
): string | null {
  return reactInjector.transform(code, fileId, { root, isDesignSystem, isProtected })?.code ?? null;
}

/** 소스에서 needle이 시작하는 위치를 1부터 시작하는 line:column으로 계산한다. */
function locationOf(code: string, needle: string): string {
  const offset = code.indexOf(needle);
  const before = code.slice(0, offset).split('\n');
  return `${before.length}:${(before.at(-1) ?? '').length + 1}`;
}

/** `specifier`만 디자인 시스템으로 판정하는 함수 (FR-1 (b)). */
const dsSpecifiers =
  (...specifiers: string[]): DesignSystemMatcher =>
  ({ specifier }) =>
    specifier !== undefined && specifiers.includes(specifier);

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
    expect(out).toContain('<div data-domirror="src/App.tsx:3:5" data-domirror-component="A|src/App.tsx" className="a">');
    expect(out).toContain('<span data-domirror="src/App.tsx:5:7" data-domirror-component="A|src/App.tsx">');
    expect(out).toContain('<Card />');
    expect(out).toContain('<>');
    expect(out?.match(/data-domirror="/g)).toHaveLength(2);
  });

  it('한글·이모지 주석 뒤 요소의 위치가 UTF-16 기준으로 정확하다', () => {
    const code = '// 한글 주석 😀 위치 검증\nconst x = 1; /* 다국어 */ export const A = () => <h1>제목</h1>;\n';
    expect(run(code)).toContain(
      `<h1 data-domirror="src/App.tsx:${locationOf(code, '<h1')}" data-domirror-component="A|src/App.tsx">제목</h1>`,
    );
  });

  it('기존 data-domirror 속성이 있으면 보존한다', () => {
    const code = 'export const A = () => <div data-domirror="keep:1:1" />;\n';
    expect(run(code)).toBeNull();
  });

  it('문자열 리터럴 속 "<div"는 바꾸지 않는다', () => {
    const code = 'export const s = "<div class=x>";\nexport const A = () => <p>{s}</p>;\n';
    const out = run(code);
    expect(out).toContain('"<div class=x>"');
    expect(out?.match(/data-domirror="/g)).toHaveLength(1);
  });

  it('self-closing 태그에도 주입한다', () => {
    const code = 'export const A = () => <img src="a.png" />;\n';
    expect(run(code)).toContain(
      '<img data-domirror="src/App.tsx:1:24" data-domirror-component="A|src/App.tsx" src="a.png" />',
    );
  });

  it('구문 오류 입력은 null', () => {
    expect(run('export const A = () => <div>;\n')).toBeNull();
  });

  it('소스맵을 함께 반환한다', () => {
    const result = reactInjector.transform('export const A = () => <div />;\n', id, { root });
    expect(result?.map).toMatchObject({ sources: [id] });
  });

  describe('정의 측 컴포넌트 이름 (FR-3)', () => {
    it('function 선언 이름을 쓴다', () => {
      const code = 'export function Card() {\n  return <div />;\n}\n';
      expect(run(code, '/proj/src/components/Card.tsx')).toContain(
        'data-domirror-component="Card|src/components/Card.tsx"',
      );
    });

    it('const 선언 + 화살표 함수 이름을 쓴다', () => {
      const code = 'const Card = () => <div />;\n';
      expect(run(code, '/proj/src/components/Card.tsx')).toContain(
        'data-domirror-component="Card|src/components/Card.tsx"',
      );
    });

    it('호출식으로 감싼 선언은 선언자 이름을 쓴다', () => {
      const code = 'const Card = memo(() => <div />);\n';
      expect(run(code, '/proj/src/components/Card.tsx')).toContain(
        'data-domirror-component="Card|src/components/Card.tsx"',
      );
    });

    it('대문자 이름이 없으면 파일 basename을 쓴다', () => {
      const code = 'export default () => <div />;\n';
      expect(run(code)).toContain('data-domirror-component="App|src/App.tsx"');
    });

    it('중첩 함수 안 요소는 안쪽 컴포넌트 이름을 쓴다', () => {
      const code = 'export function Outer() {\n  function Inner() {\n    return <b>x</b>;\n  }\n  return <Inner />;\n}\n';
      expect(run(code)).toContain('data-domirror-component="Inner|src/App.tsx"');
    });

    it('소문자 함수는 건너뛰고 바깥 컴포넌트 이름을 쓴다', () => {
      const code = 'export function Card() {\n  const helper = () => <i>x</i>;\n  return <div>{helper()}</div>;\n}\n';
      const out = run(code);
      expect(out).toContain('data-domirror-component="Card|src/App.tsx"');
      expect(out).not.toContain('helper|');
    });

    it('클래스 컴포넌트 이름을 쓴다', () => {
      const code = 'class Foo extends React.Component {\n  render() {\n    return <p>x</p>;\n  }\n}\n';
      expect(run(code)).toContain('data-domirror-component="Foo|src/App.tsx"');
    });

    it('정의 파일이 디자인 시스템이면 data-domirror-ds를 넣는다', () => {
      const code = 'export const Card = () => <div />;\n';
      const out = run(code, id, ({ file }) => file === 'src/App.tsx');
      expect(out).toContain('data-domirror-component="Card|src/App.tsx" data-domirror-ds');
    });

    it('기존 data-domirror-component 속성은 중복 삽입하지 않는다', () => {
      const code = 'export const A = () => <div data-domirror-component="Keep|x" />;\n';
      const out = run(code);
      expect(out).toContain('data-domirror-component="Keep|x"');
      expect(out?.match(/data-domirror-component=/g)).toHaveLength(1);
    });
  });

  describe('사용처 측 주입 (FR-5)', () => {
    it('정적 import가 디자인 시스템이면 태그 이름과 specifier를 넣는다', () => {
      const code = "import { Button } from '@acme/ui';\nexport const A = () => <Button />;\n";
      const out = run(code, id, dsSpecifiers('@acme/ui'));
      expect(out).toContain('<Button data-domirror-component="Button|@acme/ui" data-domirror-ds />');
    });

    it('디자인 시스템이 아닌 import·import 없는 태그에는 넣지 않는다', () => {
      const imported = "import { Button } from 'other-ui';\nexport const A = () => <Button />;\n";
      expect(run(imported, id, dsSpecifiers('@acme/ui'))).toBeNull();
      expect(run('export const A = () => <Button />;\n', id, dsSpecifiers('@acme/ui'))).toBeNull();
    });

    it('네임스페이스 import는 루트 로컬 이름으로 찾고 점 표기를 유지한다', () => {
      const code = "import * as UI from '@acme/uikit';\nexport const A = () => <UI.Button />;\n";
      const out = run(code, id, dsSpecifiers('@acme/uikit'));
      expect(out).toContain('<UI.Button data-domirror-component="UI.Button|@acme/uikit" data-domirror-ds />');
    });
  });

  describe('보호 영역 주입 (FR-3·E-7)', () => {
    it('보호 파일의 정의 측 요소에 위치→component→ds→protected 순서로 넣는다 (AC-2)', () => {
      const code = 'export const A = () => <div className="a" />;\n';
      const out = run(
        code,
        id,
        ({ file }) => file === 'src/App.tsx',
        () => true,
      );
      expect(out).toContain(
        `<div data-domirror="src/App.tsx:${locationOf(code, '<div')}" data-domirror-component="A|src/App.tsx" data-domirror-ds data-domirror-protected className="a" />`,
      );
    });

    it('비보호 파일의 정의 측 요소에는 넣지 않는다', () => {
      const code = 'export const A = () => <div />;\n';
      const out = run(code, id, undefined, () => false);
      expect(out).not.toBeNull();
      expect(out).not.toContain('data-domirror-protected');
    });

    it('사용처 측 컴포넌트 태그에는 보호 속성을 넣지 않는다 (AC-3)', () => {
      const code = "import { Button } from '@acme/ui';\nexport const A = () => <Button />;\n";
      const out = run(code, id, dsSpecifiers('@acme/ui'), () => true);
      expect(out).toContain('<Button data-domirror-component="Button|@acme/ui" data-domirror-ds />');
      expect(out).not.toContain('data-domirror-protected');
    });

    it('data-domirror-component만 있는 요소에도 보호 속성을 1회 넣는다 (가드 밖 판정)', () => {
      const code = 'export const A = () => <div data-domirror-component="Keep|x" />;\n';
      const out = run(code, id, undefined, () => true);
      expect(out).toContain('data-domirror-component="Keep|x"');
      expect(out?.match(/data-domirror-protected/g)).toHaveLength(1);
    });

    it('이미 data-domirror-protected가 있으면 중복 주입하지 않는다 (E-7)', () => {
      const code = 'export const A = () => <div data-domirror-protected />;\n';
      const out = run(code, id, undefined, () => true);
      expect(out).not.toBeNull();
      expect(out?.match(/data-domirror-protected/g)).toHaveLength(1);
    });
  });

  it('기존 위치 값은 사용처 측 주입 뒤에도 바뀌지 않는다 (NFR-5)', () => {
    const code = [
      "import { Button } from '@acme/ui';",
      'export const A = () => (',
      '  <div>',
      '    <Button />',
      '    <span>x</span>',
      '  </div>',
      ');',
      '',
    ].join('\n');
    const out = run(code, id, dsSpecifiers('@acme/ui'));
    expect(out).toContain(`<div data-domirror="src/App.tsx:${locationOf(code, '<div')}"`);
    expect(out).toContain(`<span data-domirror="src/App.tsx:${locationOf(code, '<span')}"`);
  });
});
