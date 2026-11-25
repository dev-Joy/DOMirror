import { describe, expect, it } from 'vitest';
import { currentTreeRoot, scanInstances } from '../src/instance-count.js';
import type { FiberLike } from '../src/react-runtime.js';

function Card(): null {
  return null;
}
function App(): null {
  return null;
}

/** 부모에 자식들을 child·sibling·return으로 연결한다. */
function link(parent: FiberLike, children: FiberLike[]): FiberLike {
  parent.child = children[0] ?? null;
  children.forEach((child, i) => {
    child.return = parent;
    child.sibling = children[i + 1] ?? null;
  });
  return parent;
}

function fiber(tag: number, type: unknown = null): FiberLike {
  return { tag, type };
}

/** HostRoot(tag 3) → App → [Card, Card, Card] 트리. HostRoot.stateNode = { current: HostRoot }. */
function makeTree() {
  const hostRoot = fiber(3);
  hostRoot.stateNode = { current: hostRoot };
  const app = fiber(0, App);
  const cards = [fiber(0, Card), fiber(0, Card), fiber(0, Card)];
  const hosts = cards.map((card) => link(card, [fiber(5, 'div')]).child as FiberLike);
  link(hostRoot, [app]);
  link(app, cards);
  return { hostRoot, app, cards, hosts };
}

describe('currentTreeRoot', () => {
  it('return 체인으로 HostRoot까지 올라가 stateNode.current를 돌려준다', () => {
    const { hostRoot, hosts } = makeTree();
    expect(currentTreeRoot(hosts[0])).toBe(hostRoot);
  });

  it('HostRoot가 없거나 stateNode·current가 객체가 아니면 null', () => {
    const orphan = fiber(0, Card);
    expect(currentTreeRoot(orphan)).toBeNull();

    const noState = fiber(3);
    expect(currentTreeRoot(link(noState, [fiber(0, Card)]).child as FiberLike)).toBeNull();

    const badCurrent = fiber(3);
    badCurrent.stateNode = { current: 'x' };
    expect(currentTreeRoot(link(badCurrent, [fiber(0, Card)]).child as FiberLike)).toBeNull();
  });

  it('상향 단계 수를 limit으로 제한한다', () => {
    const { hosts } = makeTree();
    expect(currentTreeRoot(hosts[0], 2)).toBeNull();
  });
});

describe('scanInstances (AC-3)', () => {
  it('같은 type 3개를 센다', () => {
    const { cards } = makeTree();
    const scan = scanInstances(cards[1]);
    expect(scan.instanceCount).toEqual({ count: 3, capped: false });
    expect(scan.current).toBe(cards[1]);
  });

  it('alternate(작업 트리) 입력이면 커밋 트리 기준으로 세고 current는 커밋 쪽 fiber다', () => {
    const { hostRoot, cards } = makeTree();
    const work: FiberLike = { tag: 0, type: Card, return: hostRoot, alternate: cards[0] };
    cards[0].alternate = work;
    const scan = scanInstances(work);
    expect(scan.instanceCount).toEqual({ count: 3, capped: false });
    expect(scan.current).toBe(cards[0]);
  });

  it('memo 래퍼(tag 14)는 내부 함수와 type이 달라 따로 센다', () => {
    const hostRoot = fiber(3);
    hostRoot.stateNode = { current: hostRoot };
    const memoType = { $$typeof: Symbol.for('react.memo'), type: Card };
    const memo = fiber(14, memoType);
    const inner = fiber(0, Card);
    const plain = fiber(0, Card);
    link(hostRoot, [memo, plain]);
    link(memo, [inner]);

    expect(scanInstances(memo).instanceCount).toEqual({ count: 1, capped: false });
    expect(scanInstances(inner).instanceCount).toEqual({ count: 2, capped: false });
  });

  it('방문 상한에 닿으면 capped: true, 1 ≤ count ≤ limit', () => {
    const hostRoot = fiber(3);
    hostRoot.stateNode = { current: hostRoot };
    const cards = Array.from({ length: 10 }, () => fiber(0, Card));
    link(hostRoot, cards);
    const scan = scanInstances(cards[9], 5);
    expect(scan.instanceCount?.capped).toBe(true);
    expect(scan.instanceCount?.count).toBeGreaterThanOrEqual(1);
    expect(scan.instanceCount?.count).toBeLessThanOrEqual(5);
  });

  it('HostRoot가 없거나 current가 객체가 아니면 instanceCount가 없다', () => {
    const orphan = fiber(0, Card);
    expect(scanInstances(orphan)).toEqual({ current: orphan });

    const badRoot = fiber(3);
    badRoot.stateNode = { current: 1 };
    const card = fiber(0, Card);
    link(badRoot, [card]);
    expect(scanInstances(card)).toEqual({ current: card });
  });

  it('type이 null·문자열이면 세지 않는다', () => {
    const { hostRoot } = makeTree();
    const nullType: FiberLike = { tag: 0, type: null, return: hostRoot };
    const stringType: FiberLike = { tag: 5, type: 'div', return: hostRoot };
    expect(scanInstances(nullType)).toEqual({ current: nullType });
    expect(scanInstances(stringType)).toEqual({ current: stringType });
  });
});
