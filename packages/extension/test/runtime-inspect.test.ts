import { describe, expect, it } from 'vitest';
import type { FiberLike } from '../src/react-runtime.js';
import { inspectFiber } from '../src/runtime-inspect.js';

function Card(): null {
  return null;
}
function App(): null {
  return null;
}

const SECRET = 'demo-secret-token';

/** HostRoot → App → [Card(커밋), Card] , 첫 Card 아래 호스트 div. */
function makeTree(cardProps: unknown) {
  const hostRoot: FiberLike = { tag: 3, type: null };
  hostRoot.stateNode = { current: hostRoot };
  const app: FiberLike = { tag: 0, type: App, return: hostRoot };
  const card: FiberLike = { tag: 0, type: Card, return: app, memoizedProps: cardProps };
  const other: FiberLike = { tag: 0, type: Card, return: app, memoizedProps: { title: 'other' } };
  const host: FiberLike = { tag: 5, type: 'div', return: card, stateNode: {} };
  hostRoot.child = app;
  app.child = card;
  card.sibling = other;
  card.child = host;
  return { hostRoot, card, host };
}

describe('inspectFiber (AC-4·AC-8)', () => {
  it('함수·노드·React 요소·민감 키가 있어도 응답은 구조화 복제 가능하고 props는 마스킹된 문자열이다', () => {
    const props = {
      title: '카드',
      onClick: () => {},
      anchor: { nodeType: 1, nodeName: 'DIV' },
      children: { $$typeof: Symbol.for('react.transitional.element'), type: 'p', props: {} },
      apiToken: SECRET,
    };
    const { host } = makeTree(props);
    const result = inspectFiber(host, 'fiber');

    expect(() => structuredClone(result)).not.toThrow();
    expect(typeof result.props).toBe('string');
    expect(result.props).toContain('apiToken: •••');
    expect(result.props).not.toContain(SECRET);
    expect(result.instanceCount).toEqual({ count: 2, capped: false });
    expect(result.info?.name).toBe('Card');
    expect(result.info?.via).toBe('fiber');
    expect(result.info).not.toHaveProperty('props');
    expect(result.info).not.toHaveProperty('instanceCount');
    expect(JSON.stringify(result.info)).not.toContain('•••');
  });

  it('작업 트리(alternate) fiber 입력이면 커밋 쪽 fiber의 memoizedProps를 쓴다', () => {
    const { card, hostRoot } = makeTree({ title: 'committed' });
    const workCard: FiberLike = { tag: 0, type: Card, return: hostRoot, alternate: card, memoizedProps: { title: 'work' } };
    card.alternate = workCard;
    const workHost: FiberLike = { tag: 5, type: 'div', return: workCard };
    const result = inspectFiber(workHost, 'devtools');
    expect(result.props).toBe('{ title: "committed" }');
    expect(result.info?.via).toBe('devtools');
  });

  it('컴포넌트 fiber가 없으면 { info: null }', () => {
    const hostRoot: FiberLike = { tag: 3, type: null };
    const host: FiberLike = { tag: 5, type: 'div', return: hostRoot };
    expect(inspectFiber(host, 'fiber')).toEqual({ info: null });
  });
});
