import { BRIDGE_OWNER_MAX } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import {
  componentName,
  describeRuntime,
  fiberFromNode,
  nearestComponent,
  normalizeFile,
  ownerChain,
  parseStackFrames,
  toSourceRef,
  type FiberLike,
} from '../src/react-runtime.js';

function makeFiber(init: Partial<FiberLike> & Pick<FiberLike, 'tag'>): FiberLike {
  return { type: null, ...init };
}

function withDebugSource(fiber: FiberLike, source: unknown): FiberLike {
  (fiber as FiberLike & { _debugSource?: unknown })._debugSource = source;
  return fiber;
}

/** `Error\n    at ...` 형태의 V8 스택. */
function stackOf(...frames: string[]): string {
  return ['Error', ...frames.map((frame) => `    at ${frame}`)].join('\n');
}

const CARD_STACK = stackOf('Card (http://localhost:5173/src/components/Card.tsx?t=1763:12:5)');
const APP_STACK = stackOf('http://localhost:5173/src/App.tsx:20:7');

describe('fiberFromNode', () => {
  it('own key 중 __reactFiber$ 접두 키에서 fiber를 읽는다 (접미사 고정 아님)', () => {
    const fiber = makeFiber({ tag: 5 });
    const el = { '__reactFiber$k3j9x': fiber, '__reactProps$k3j9x': {} };
    expect(fiberFromNode(el)).toBe(fiber);

    const other = makeFiber({ tag: 5 });
    expect(fiberFromNode({ '__reactFiber$other': other })).toBe(other);
  });

  it('fiber 키가 없으면 null', () => {
    expect(fiberFromNode({ '__reactProps$abc': {} })).toBeNull();
    expect(fiberFromNode({})).toBeNull();
  });

  it('객체가 아니면 null', () => {
    expect(fiberFromNode(null)).toBeNull();
    expect(fiberFromNode(undefined)).toBeNull();
    expect(fiberFromNode('div')).toBeNull();
  });
});

describe('nearestComponent', () => {
  it('호스트 fiber에서 return을 타고 올라가 가장 가까운 컴포넌트를 찾는다 (E-6)', () => {
    const root = makeFiber({ tag: 3 });
    const card = makeFiber({ tag: 0, return: root });
    const offscreen = makeFiber({ tag: 22, return: card });
    const host = makeFiber({ tag: 5, return: offscreen });
    expect(nearestComponent(host)).toBe(card);
  });

  it('클래스·forwardRef·memo·simpleMemo를 컴포넌트로 인식한다', () => {
    for (const tag of [1, 11, 14, 15]) {
      const component = makeFiber({ tag });
      const host = makeFiber({ tag: 5, return: component });
      expect(nearestComponent(host)).toBe(component);
    }
  });

  it('HostRoot(3)에서 중단하고 null', () => {
    const root = makeFiber({ tag: 3 });
    const host = makeFiber({ tag: 5, return: root });
    expect(nearestComponent(host)).toBeNull();
    expect(nearestComponent(null)).toBeNull();
  });
});

describe('componentName', () => {
  it('displayName > name 순서다 (FR-3)', () => {
    function Card() {}
    (Card as { displayName?: string }).displayName = 'CardView';
    expect(componentName(makeFiber({ tag: 0, type: Card }))).toBe('CardView');

    function Plain() {}
    expect(componentName(makeFiber({ tag: 0, type: Plain }))).toBe('Plain');
  });

  it('memo는 감싼 타입 이름을 쓴다', () => {
    function Inner() {}
    expect(componentName(makeFiber({ tag: 14, type: { $$typeof: Symbol.for('react.memo'), type: Inner } }))).toBe('Inner');
  });

  it('forwardRef는 감싼 render 함수 이름을 쓴다', () => {
    const render = function CardBody() {};
    expect(componentName(makeFiber({ tag: 11, type: { $$typeof: Symbol.for('react.forward_ref'), render } }))).toBe(
      'CardBody',
    );
  });

  it('이름이 없으면 Anonymous (E-5)', () => {
    // 객체 속성으로 바로 넘기면 JS가 이름을 추론하므로, 이름이 없는 함수를 변수로 만든다.
    const anonymous = (() => () => null)();
    expect(componentName(makeFiber({ tag: 0, type: anonymous }))).toBe('Anonymous');
    expect(componentName(makeFiber({ tag: 5, type: 'div' }))).toBe('Anonymous');
    expect(componentName(null)).toBe('Anonymous');
  });
});

describe('parseStackFrames', () => {
  it('괄호형·비괄호형 두 패턴을 모두 읽는다', () => {
    const stack = stackOf(
      'Card (http://localhost:5173/src/components/Card.tsx?t=1763:12:5)',
      'http://localhost:5173/src/App.tsx:20:7',
    );
    expect(parseStackFrames(stack)).toEqual([
      { url: 'http://localhost:5173/src/components/Card.tsx?t=1763', line: 12, column: 5 },
      { url: 'http://localhost:5173/src/App.tsx', line: 20, column: 7 },
    ]);
  });

  it('Error 객체의 stack 문자열도 받는다', () => {
    expect(parseStackFrames({ stack: CARD_STACK })).toHaveLength(1);
  });

  it('프레임이 아니거나 빈 스택은 빈 배열', () => {
    expect(parseStackFrames('Error')).toEqual([]);
    expect(parseStackFrames(null)).toEqual([]);
    expect(parseStackFrames(undefined)).toEqual([]);
  });
});

describe('normalizeFile', () => {
  it('쿼리·해시를 떼고 dev 서버 URL을 프로젝트 상대 경로로 바꾼다 (E-4)', () => {
    expect(normalizeFile('http://localhost:5173/src/components/Card.tsx?t=1763')).toBe('src/components/Card.tsx');
    expect(normalizeFile('http://localhost:5173/src/App.tsx#L3')).toBe('src/App.tsx');
    expect(normalizeFile('http://localhost:5173/src/App.tsx?v=1#L3')).toBe('src/App.tsx');
  });

  it('/@fs/ 경로는 파일 시스템 절대 경로로 남긴다', () => {
    expect(normalizeFile('/@fs/Users/dev/project/src/App.tsx?t=1')).toBe('/Users/dev/project/src/App.tsx');
  });

  it('node_modules이거나 소스 확장자가 아니면 null', () => {
    expect(normalizeFile('http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=1')).toBeNull();
    expect(normalizeFile('http://localhost:5173/src/App.css')).toBeNull();
    expect(normalizeFile('http://localhost:5173/@react-refresh')).toBeNull();
    expect(normalizeFile('')).toBeNull();
  });
});

describe('toSourceRef', () => {
  it('node_modules·react 런타임 프레임을 건너뛰고 첫 프로젝트 프레임을 쓴다 (AC-4)', () => {
    const frames = parseStackFrames(
      stackOf(
        'Object.react_stack_bottom_frame (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=1:17970:16)',
        'Card (http://localhost:5173/src/components/Card.tsx?t=1763:12:5)',
      ),
    );
    expect(toSourceRef(frames)).toEqual({
      file: 'src/components/Card.tsx',
      line: 12,
      column: 5,
      precision: 'line-unverified',
    });
  });

  it('프로젝트 프레임이 없으면 undefined', () => {
    const frames = parseStackFrames(
      stackOf('http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=1:1:1'),
    );
    expect(toSourceRef(frames)).toBeUndefined();
  });
});

describe('ownerChain', () => {
  it('가까운 순으로 담고 HostRoot에서 중단한다 (FR-4)', () => {
    const root = makeFiber({ tag: 3 });
    const app = makeFiber({ tag: 0, type: function App() {}, return: root });
    const layout = makeFiber({ tag: 15, type: function Layout() {}, return: app });
    const card = makeFiber({ tag: 0, type: function Card() {}, return: layout });
    const host = makeFiber({ tag: 5, return: card });

    expect(ownerChain(host)).toEqual(['Card', 'Layout', 'App']);
  });

  it('상한은 기본 BRIDGE_OWNER_MAX이고 지정할 수 있다', () => {
    const root = makeFiber({ tag: 3 });
    let current = root;
    for (let index = 0; index < BRIDGE_OWNER_MAX + 4; index += 1) {
      current = makeFiber({ tag: 0, type: function Owner() {}, return: current });
    }
    expect(ownerChain(current)).toHaveLength(BRIDGE_OWNER_MAX);
    expect(ownerChain(current, 2)).toHaveLength(2);
  });
});

describe('describeRuntime', () => {
  function tree() {
    const root = makeFiber({ tag: 3 });
    const app = makeFiber({ tag: 0, type: function App() {}, return: root, _debugStack: stackOf('main (http://localhost:5173/src/main.tsx:9:3)') });
    const card = makeFiber({
      tag: 0,
      type: function Card() {},
      return: app,
      _debugStack: APP_STACK,
    });
    const host = makeFiber({ tag: 5, type: 'div', return: card, _debugStack: CARD_STACK });
    return { root, app, card, host };
  }

  it('definition은 호스트 fiber, callSite는 최근접 composite fiber 위치다 (FR-3·FR-4)', () => {
    const { host, card } = tree();

    expect(describeRuntime(host)).toEqual({
      info: {
        name: 'Card',
        via: 'fiber',
        definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' },
        callSite: { file: 'src/App.tsx', line: 20, column: 7, precision: 'line-unverified' },
        owners: ['Card', 'App'],
      },
      hostSource: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' },
    });

    // definition은 호스트 fiber, callSite는 composite fiber에서 온다.
    expect(describeRuntime(host).info?.definition?.line).toBe(12);
    expect(card._debugStack).toBe(APP_STACK);
  });

  it('via는 호출자가 지정한다', () => {
    const { host } = tree();
    expect(describeRuntime(host, 'devtools').info?.via).toBe('devtools');
  });

  it('React 19처럼 _debugSource가 없으면 항상 line-unverified (AC-4)', () => {
    const { host } = tree();
    expect(describeRuntime(host).info?.definition?.precision).toBe('line-unverified');
    expect(describeRuntime(host).info?.callSite?.precision).toBe('line-unverified');
  });

  it('_debugSource가 있으면 exact·파일·라인·컬럼을 신뢰한다 (AC-4)', () => {
    const { host } = tree();
    withDebugSource(host, {
      fileName: 'http://localhost:5173/src/components/Card.tsx?t=1',
      lineNumber: 12,
      columnNumber: 5,
    });
    expect(describeRuntime(host).info?.definition).toEqual({
      file: 'src/components/Card.tsx',
      line: 12,
      column: 5,
      precision: 'exact',
    });
  });

  it('스택 첫 프레임이 JSX 런타임이면 위치를 생략한다(owner stack 열화 방어)', () => {
    const { host, card } = tree();
    card._debugStack = stackOf('react_jsx_dev_runtime (http://localhost:5173/node_modules/.vite/deps/react-jsx-dev-runtime.js:1:1)');
    const described = describeRuntime(host);

    expect(described.info?.name).toBe('Card');
    // 열화된 것은 card fiber의 스택뿐이므로 callSite만 생략되고 definition(host)은 남는다.
    expect(described.info?.callSite).toBeUndefined();
    expect(described.info?.definition?.line).toBe(12);
    expect(described.info?.owners).toEqual(['Card', 'App']);
  });

  it('실측 스택(React 19.3.1 + Vite 8)에서도 첫 프로젝트 프레임을 쓴다 (PoC)', () => {
    // docs/intent/planned/INT-011-react-runtime-locate-prompt-fix/poc.md 실측값.
    const realHostStack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://127.0.0.1:5199/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=eff4ee53:196:25)',
      '    at Card (http://127.0.0.1:5199/src/components/Card.tsx:10:25)',
      '    at Object.react_stack_bottom_frame (http://127.0.0.1:5199/node_modules/.vite/deps/react-dom_client.js?v=7a67b7af:14139:12)',
    ].join('\n');
    const realCardStack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://127.0.0.1:5199/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=eff4ee53:196:25)',
      '    at App (http://127.0.0.1:5199/src/App.tsx:47:20)',
      '    at Object.react_stack_bottom_frame (http://127.0.0.1:5199/node_modules/.vite/deps/react-dom_client.js?v=7a67b7af:14139:12)',
    ].join('\n');
    const root = makeFiber({ tag: 3 });
    const app = makeFiber({ tag: 0, type: function App() {}, return: root });
    const card = makeFiber({ tag: 0, type: function Card() {}, return: app, _debugStack: realCardStack });
    const host = makeFiber({ tag: 5, type: 'section', return: card, _debugStack: realHostStack });

    const described = describeRuntime(host);
    expect(described.info?.definition).toEqual({
      file: 'src/components/Card.tsx',
      line: 10,
      column: 25,
      precision: 'line-unverified',
    });
    expect(described.info?.callSite).toEqual({ file: 'src/App.tsx', line: 47, column: 20, precision: 'line-unverified' });
    expect(described.info?.owners).toEqual(['Card', 'App']);
  });

  it('컴포넌트 fiber가 없으면 info는 null이고 hostSource만 남는다 (E-1)', () => {
    const root = makeFiber({ tag: 3 });
    const host = makeFiber({ tag: 5, type: 'span', return: root, _debugStack: CARD_STACK });
    expect(describeRuntime(host)).toEqual({
      info: null,
      hostSource: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' },
    });
  });

  it('fiber가 없으면 info만 null이다', () => {
    expect(describeRuntime(null)).toEqual({ info: null });
  });
});
