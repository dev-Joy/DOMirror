import { describe, expect, it } from 'vitest';
import { isSensitiveKey, PROPS_MASK, PROPS_SUMMARY_MAX, summarizeProps } from '../src/props-summary.js';

const ELEMENT = Symbol.for('react.transitional.element');
const LEGACY_ELEMENT = Symbol.for('react.element');

function Card(): null {
  return null;
}

describe('summarizeProps — 요약 규칙 (AC-1)', () => {
  it('props가 null이 아닌 객체가 아니면 undefined', () => {
    expect(summarizeProps(null)).toBeUndefined();
    expect(summarizeProps(undefined)).toBeUndefined();
    expect(summarizeProps('x')).toBeUndefined();
  });

  it('빈 객체는 {}', () => {
    expect(summarizeProps({})).toBe('{}');
  });

  it('문자열은 80자까지, 초과 시 80자 + …', () => {
    const s80 = 'a'.repeat(80);
    expect(summarizeProps({ s: s80 })).toBe(`{ s: "${s80}" }`);
    expect(summarizeProps({ s: 'a'.repeat(81) })).toBe(`{ s: "${s80}…" }`);
  });

  it('원시값은 그대로', () => {
    expect(summarizeProps({ a: 1, b: true, c: null, d: undefined })).toBe('{ a: 1, b: true, c: null, d: undefined }');
  });

  it('bigint·symbol은 문자열화', () => {
    expect(summarizeProps({ n: 12n, s: Symbol('x') })).toBe('{ n: 12n, s: Symbol(x) }');
  });

  it('함수는 ƒ name, 이름 없으면 ƒ anonymous', () => {
    function onClick(): void {}
    expect(summarizeProps({ onClick })).toBe('{ onClick: ƒ onClick }');
    expect(summarizeProps({ list: [() => 1] })).toBe('{ list: [ƒ anonymous] }');
  });

  it('React 요소는 태그·표시 이름·Anonymous (두 심볼 모두)', () => {
    const anonymous = (() => () => null)();
    expect(summarizeProps({ children: { $$typeof: ELEMENT, type: 'p', props: {} } })).toBe('{ children: <p> }');
    expect(summarizeProps({ children: { $$typeof: LEGACY_ELEMENT, type: Card, props: {} } })).toBe(
      '{ children: <Card> }',
    );
    expect(summarizeProps({ children: { $$typeof: ELEMENT, type: anonymous, props: {} } })).toBe(
      '{ children: <Anonymous> }',
    );
  });

  it('DOM 노드는 [Node tag]', () => {
    expect(summarizeProps({ el: { nodeType: 1, nodeName: 'DIV' } })).toBe('{ el: [Node div] }');
  });

  it('배열은 앞 5개 + …(+n), 빈 배열은 []', () => {
    expect(summarizeProps({ a: [1, 2, 3, 4, 5, 6, 7] })).toBe('{ a: [1, 2, 3, 4, 5, …(+2)] }');
    expect(summarizeProps({ a: [] })).toBe('{ a: [] }');
  });

  it('객체는 레벨당 키 20개 + …(+n)', () => {
    const props: Record<string, number> = {};
    for (let i = 1; i <= 23; i += 1) props[`k${i}`] = i;
    const expected = Array.from({ length: 20 }, (_, i) => `k${i + 1}: ${i + 1}`).join(', ');
    expect(summarizeProps(props)).toBe(`{ ${expected}, …(+3) }`);
  });

  it('깊이 2까지 펼치고 더 깊은 객체·배열은 접는다', () => {
    expect(summarizeProps({ a: { b: { c: 1 }, d: [1] } })).toBe('{ a: { b: {…}, d: […] } }');
  });

  it('순환 참조는 [Circular], 형제 중복 참조는 순환이 아니다', () => {
    const props: Record<string, unknown> = {};
    props.self = props;
    expect(summarizeProps(props)).toBe('{ self: [Circular] }');

    const shared = { x: 1 };
    expect(summarizeProps({ a: shared, b: shared })).toBe('{ a: { x: 1 }, b: { x: 1 } }');
  });

  it('getter 예외는 그 값만 [Error]이고 나머지는 계속 요약한다', () => {
    const props = {
      get bad(): unknown {
        throw new Error('boom');
      },
      ok: 1,
    };
    expect(summarizeProps(props)).toBe('{ bad: [Error], ok: 1 }');
  });

  it('ownKeys가 예외를 던지는 Proxy는 그 객체 전체 [Error]', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('boom');
        },
      },
    );
    expect(summarizeProps(hostile)).toBe('[Error]');
    expect(summarizeProps({ nested: hostile, ok: 1 })).toBe('{ nested: [Error], ok: 1 }');
  });

  it('전체 길이는 최대 1024자, 초과 시 1023자 + …', () => {
    const props: Record<string, string> = {};
    for (let i = 0; i < 20; i += 1) props[`k${i}`] = 'x'.repeat(80);
    const text = summarizeProps(props);
    expect(text).toHaveLength(PROPS_SUMMARY_MAX);
    expect(text?.endsWith('…')).toBe(true);
  });

  it('식별자가 아닌 키는 JSON 문자열로 표기한다', () => {
    expect(summarizeProps({ 'data-x': 1 })).toBe('{ "data-x": 1 }');
  });

  it('결과에 개행 실문자가 없다', () => {
    const text = summarizeProps({ s: 'a\nb\r\nc\u2028d', sym: Symbol('x\ny') });
    expect(text).not.toMatch(/[\r\n\u2028\u2029]/);
  });
});

describe('summarizeProps — 민감 키 마스킹 (AC-2)', () => {
  const SECRET = 'super-secret-value';

  it('token·Password·API_SECRET·apiKey·authHeader는 깊이 1·2에서 •••', () => {
    const keys = ['token', 'Password', 'API_SECRET', 'apiKey', 'authHeader'];
    for (const key of keys) {
      expect(isSensitiveKey(key)).toBe(true);
      expect(summarizeProps({ [key]: SECRET })).toBe(`{ ${key}: ${PROPS_MASK} }`);
      expect(summarizeProps({ nested: { [key]: SECRET } })).toBe(`{ nested: { ${key}: ${PROPS_MASK} } }`);
    }
  });

  it('원값이 출력에 없다', () => {
    const text = summarizeProps({ apiToken: SECRET, nested: { password: SECRET }, title: 'ok' });
    expect(text).not.toContain(SECRET);
    expect(text).toContain('title: "ok"');
  });

  it('민감 키 getter는 호출하지 않는다', () => {
    let called = 0;
    const props = {
      get apiToken(): string {
        called += 1;
        return SECRET;
      },
    };
    expect(summarizeProps(props)).toBe(`{ apiToken: ${PROPS_MASK} }`);
    expect(called).toBe(0);
  });

  it('민감 키의 객체 값은 펼치지 않는다', () => {
    expect(summarizeProps({ auth: { user: 'u', pass: SECRET } })).toBe(`{ auth: ${PROPS_MASK} }`);
  });

  it('keyboard처럼 key를 포함한 무해한 키도 마스킹된다(과마스킹 허용, E-10)', () => {
    expect(summarizeProps({ keyboard: 'qwerty' })).toBe(`{ keyboard: ${PROPS_MASK} }`);
  });

  it('깊이 3 이상으로 접힌 값 안의 민감값은 출력되지 않는다', () => {
    const text = summarizeProps({ a: { b: { secretValue: SECRET, plain: SECRET } } });
    expect(text).toBe('{ a: { b: {…} } }');
    expect(text).not.toContain(SECRET);
  });
});
