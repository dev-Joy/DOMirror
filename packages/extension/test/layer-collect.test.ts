import { describe, expect, it } from 'vitest';
import type { DevtoolsHook } from '../src/devtools-hook.js';
import {
  collectDomFallbackLayers,
  collectFiberLayers,
  type CollectDocumentLike,
  type MeasurableElement,
} from '../src/layer-collect.js';
import type { FiberLike } from '../src/react-runtime.js';

interface FakeElement extends MeasurableElement {
  parentElement: FakeElement | null;
  children: FakeElement[];
  rect: { left: number; top: number; width: number; height: number };
  style?: { display?: string; visibility?: string };
  [key: string]: unknown;
}

function makeEl(
  tagName: string,
  options: {
    id?: string;
    className?: string;
    rect?: { left: number; top: number; width: number; height: number };
    style?: { display?: string; visibility?: string };
    children?: FakeElement[];
  } = {},
): FakeElement {
  const children = options.children ?? [];
  const rect = options.rect ?? { left: 0, top: 0, width: 200, height: 100 };
  const el: FakeElement = {
    tagName,
    id: options.id,
    className: options.className,
    isConnected: true,
    parentElement: null,
    children,
    rect,
    style: options.style,
    getBoundingClientRect: () => el.rect,
  };
  for (const child of children) child.parentElement = el;
  return el;
}

function makeDoc(bodyChildren: FakeElement[]): { doc: CollectDocumentLike; html: FakeElement; body: FakeElement } {
  const head = makeEl('HEAD');
  const body = makeEl('BODY', { children: bodyChildren, rect: { left: 0, top: 0, width: 1280, height: 720 } });
  const html = makeEl('HTML', { children: [head, body], rect: { left: 0, top: 0, width: 1280, height: 720 } });
  return { doc: { documentElement: html, body }, html, body };
}

function linkChildren(parent: FiberLike, children: FiberLike[]): void {
  if (children.length === 0) return;
  parent.child = children[0];
  for (let i = 0; i < children.length; i += 1) {
    children[i].return = parent;
    if (i + 1 < children.length) children[i].sibling = children[i + 1];
  }
}

const VIEWPORT = { width: 1280, height: 720 };

describe('collectFiberLayers', () => {
  it('DevTools hook 경로로 React 컴포넌트 계층과 _debugSource/_debugStack 파일 힌트를 수집한다', () => {
    const buttonEl = makeEl('BUTTON', { rect: { left: 40, top: 60, width: 120, height: 36 } });
    const cardEl = makeEl('SECTION', { rect: { left: 20, top: 20, width: 400, height: 300 }, children: [buttonEl] });
    const { doc } = makeDoc([cardEl]);

    function App() {}
    function Card() {}
    const AnonymousFn = (() => () => {})();

    const hostBtn: FiberLike = { tag: 5, type: 'button', stateNode: buttonEl };
    const anonFiber: FiberLike = {
      tag: 0,
      type: AnonymousFn,
      _debugStack: 'Error\n    at Button (http://localhost:5173/src/components/Button.tsx:12:4)',
    };
    linkChildren(anonFiber, [hostBtn]);

    const hostCard: FiberLike = { tag: 5, type: 'section', stateNode: cardEl };
    linkChildren(hostCard, [anonFiber]);

    const cardFiber: FiberLike & { _debugSource?: { fileName: string } } = {
      tag: 0,
      type: Card,
      _debugSource: { fileName: '/Users/dev/project/src/Card.tsx' },
    };
    linkChildren(cardFiber, [hostCard]);

    const appFiber: FiberLike = { tag: 0, type: App };
    linkChildren(appFiber, [cardFiber]);

    const hostRoot: FiberLike = { tag: 3, type: null };
    hostRoot.stateNode = { current: hostRoot };
    linkChildren(hostRoot, [appFiber]);

    const hook: DevtoolsHook = {
      renderers: new Map([[1, {}]]),
      getFiberRoots: () => [{ current: hostRoot }],
    };

    const snapshot = collectFiberLayers(doc, { hook, viewport: VIEWPORT });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.mode).toBe('react-fiber');
    expect(snapshot?.truncated).toBe(false);
    expect(snapshot?.layers.map((l) => [l.name, l.depth, l.domPath, l.file])).toEqual([
      ['App', 0, [1, 0], undefined],
      ['Card', 1, [1, 0], '/Users/dev/project/src/Card.tsx'],
      ['Anonymous', 2, [1, 0, 0], 'src/components/Button.tsx'],
    ]);
  });

  it('DevTools hook 없이 DOM __reactFiber$ Zero-config 경로로 루트를 찾아 수집한다', () => {
    const mainEl = makeEl('MAIN', { rect: { left: 10, top: 10, width: 600, height: 400 } });
    const { doc } = makeDoc([mainEl]);

    function Dashboard() {}
    const hostMain: FiberLike = { tag: 5, type: 'main', stateNode: mainEl };
    const dashboardFiber: FiberLike = { tag: 0, type: Dashboard };
    const hostRoot: FiberLike = { tag: 3, type: null };
    hostRoot.stateNode = { current: hostRoot };
    linkChildren(dashboardFiber, [hostMain]);
    linkChildren(hostRoot, [dashboardFiber]);

    mainEl['__reactFiber$xyz'] = hostMain;

    const snapshot = collectFiberLayers(doc, { hook: null, viewport: VIEWPORT });
    expect(snapshot?.mode).toBe('react-fiber');
    expect(snapshot?.layers).toHaveLength(1);
    expect(snapshot?.layers[0].name).toBe('Dashboard');
    expect(snapshot?.layers[0].domPath).toEqual([1, 0]);
  });

  it('순환 Fiber 참조와 visitLimit 도달을 안전하게 방어하고 truncated=true를 표시한다', () => {
    const divEl = makeEl('DIV', { rect: { left: 0, top: 0, width: 300, height: 200 } });
    const { doc } = makeDoc([divEl]);

    function CompA() {}
    function CompB() {}
    const hostDiv: FiberLike = { tag: 5, type: 'div', stateNode: divEl };
    const fiberA: FiberLike = { tag: 0, type: CompA };
    const fiberB: FiberLike = { tag: 0, type: CompB };
    const hostRoot: FiberLike = { tag: 3, type: null };
    hostRoot.stateNode = { current: hostRoot };

    linkChildren(fiberB, [hostDiv]);
    linkChildren(fiberA, [fiberB]);
    linkChildren(hostRoot, [fiberA]);
    // 순환 참조 주입
    hostDiv.child = fiberA;

    const hook: DevtoolsHook = {
      renderers: new Map([[1, {}]]),
      getFiberRoots: () => [{ current: hostRoot }],
    };

    const normal = collectFiberLayers(doc, { hook, viewport: VIEWPORT });
    expect(normal?.layers.map((l) => l.name)).toEqual(['CompA', 'CompB']);

    const limited = collectFiberLayers(doc, { hook, viewport: VIEWPORT, visitLimit: 2 });
    expect(limited?.truncated).toBe(true);
  });

  it('React 루트가 없거나 가시 컴포넌트가 0건이면 null을 반환한다', () => {
    const { doc } = makeDoc([makeEl('DIV')]);
    expect(collectFiberLayers(doc, { hook: null, viewport: VIEWPORT })).toBeNull();

    const hiddenEl = makeEl('DIV', { rect: { left: 0, top: 0, width: 0, height: 0 } });
    const { doc: doc2 } = makeDoc([hiddenEl]);
    function HiddenComp() {}
    const host: FiberLike = { tag: 5, type: 'div', stateNode: hiddenEl };
    const comp: FiberLike = { tag: 0, type: HiddenComp };
    const root: FiberLike = { tag: 3, type: null };
    root.stateNode = { current: root };
    linkChildren(comp, [host]);
    linkChildren(root, [comp]);
    hiddenEl['__reactFiber$1'] = host;

    expect(collectFiberLayers(doc2, { hook: null, viewport: VIEWPORT })).toBeNull();
  });
});

describe('collectDomFallbackLayers', () => {
  it('태그·id·앞 2개 클래스 라벨을 만들고 제외 태그와 display:none 서브트리를 건너뛴다', () => {
    const hiddenChild = makeEl('P', { rect: { left: 10, top: 10, width: 100, height: 20 } });
    const displayNone = makeEl('DIV', {
      style: { display: 'none' },
      children: [hiddenChild],
    });
    const visibleInHidden = makeEl('SPAN', {
      className: 'badge primary extra',
      rect: { left: 30, top: 30, width: 80, height: 24 },
      style: { visibility: 'visible' },
    });
    const visibilityHidden = makeEl('SECTION', {
      style: { visibility: 'hidden' },
      children: [visibleInHidden],
    });
    const header = makeEl('HEADER', {
      id: 'abcdefghijklmnopqrstuvwxyz1234',
      className: 'top-bar sticky shadow',
      rect: { left: 0, top: 0, width: 1280, height: 64 },
    });
    const script = makeEl('SCRIPT');
    const panel = makeEl('DOMIRROR-PANEL');

    const { doc } = makeDoc([header, displayNone, visibilityHidden, script, panel]);

    const snapshot = collectDomFallbackLayers(doc, {
      viewport: VIEWPORT,
      getStyle: (el) => (el as FakeElement).style ?? null,
    });

    expect(snapshot.mode).toBe('dom-fallback');
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.layers.map((l) => [l.name, l.depth, l.domPath])).toEqual([
      ['header#abcdefghijklmnopqrstuvwx.top-bar.sticky', 0, [1, 0]],
      ['span.badge.primary', 1, [1, 2, 0]],
    ]);
  });

  it('maxLayers 상한 초과 시 상위 항목만 유지하고 truncated=true를 반환한다', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeEl('DIV', {
        id: `box-${i}`,
        rect: { left: 0, top: i * 40, width: (i + 1) * 50, height: 30 },
      }),
    );
    const { doc } = makeDoc(items);

    const snapshot = collectDomFallbackLayers(doc, {
      viewport: VIEWPORT,
      maxLayers: 2,
    });

    expect(snapshot.truncated).toBe(true);
    expect(snapshot.layers).toHaveLength(2);
    expect(snapshot.layers.map((l) => l.name)).toEqual(['div#box-4', 'div#box-3']);
  });
});
