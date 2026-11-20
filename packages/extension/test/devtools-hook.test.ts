import { describe, expect, it } from 'vitest';
import { FIBER_VISIT_LIMIT, fiberFromDevtools, findFiberByStateNode, type DevtoolsHook } from '../src/devtools-hook.js';
import type { FiberLike } from '../src/react-runtime.js';

function fiber(init: Partial<FiberLike> & Pick<FiberLike, 'tag'>): FiberLike {
  return { type: null, ...init };
}

/** `child`/`sibling` 연결로 작은 트리를 만든다. */
function tree(root: FiberLike, ...children: FiberLike[]): FiberLike {
  root.child = children[0] ?? null;
  for (let i = 0; i < children.length - 1; i += 1) children[i].sibling = children[i + 1] ?? null;
  return root;
}

describe('findFiberByStateNode', () => {
  it('stateNode가 대상과 같은 fiber를 찾는다 (FR-2)', () => {
    const element = {};
    const card = fiber({ tag: 5, stateNode: element });
    const host = tree(fiber({ tag: 3 }), fiber({ tag: 0 }), card);

    expect(findFiberByStateNode(host, element)).toBe(card);
  });

  it('없으면 null이고, 객체가 아닌 root도 null이다', () => {
    const host = tree(fiber({ tag: 3 }), fiber({ tag: 5, stateNode: {} }));
    expect(findFiberByStateNode(host, {})).toBeNull();
    expect(findFiberByStateNode(null, {})).toBeNull();
    expect(findFiberByStateNode('fiber', {})).toBeNull();
  });

  it('방문 상한을 넘기면 포기한다 (NFR-3)', () => {
    const element = {};
    const target = fiber({ tag: 5, stateNode: element });
    const host = tree(fiber({ tag: 3 }), fiber({ tag: 0 }), target);

    expect(findFiberByStateNode(host, element, 1)).toBeNull();
    expect(FIBER_VISIT_LIMIT).toBeGreaterThan(1);
  });
});

describe('fiberFromDevtools', () => {
  const element = {};
  const hostFiber = fiber({ tag: 5, stateNode: element });

  function hook(overrides: Partial<DevtoolsHook> = {}): DevtoolsHook {
    return {
      renderers: new Map([[1, {}]]),
      getFiberRoots: () => [{ current: tree(fiber({ tag: 3 }), hostFiber) }],
      ...overrides,
    };
  }

  it('renderer root에서 fiber를 찾는다 (via: devtools 경로)', () => {
    expect(fiberFromDevtools(hook(), element)).toBe(hostFiber);
  });

  it('hook이 없거나 renderer가 등록되지 않았으면 null (E-2)', () => {
    expect(fiberFromDevtools(undefined, element)).toBeNull();
    expect(fiberFromDevtools(null, element)).toBeNull();
    expect(fiberFromDevtools(hook({ renderers: new Map() }), element)).toBeNull();
  });

  it('getFiberRoots가 없거나 예외면 null로 폴백한다 (R-2)', () => {
    expect(fiberFromDevtools(hook({ getFiberRoots: undefined }), element)).toBeNull();
    expect(
      fiberFromDevtools(
        hook({
          getFiberRoots: () => {
            throw new Error('private api changed');
          },
        }),
        element,
      ),
    ).toBeNull();
  });

  it('roots가 없거나 대상이 없으면 null', () => {
    expect(fiberFromDevtools(hook({ getFiberRoots: () => undefined }), element)).toBeNull();
    expect(fiberFromDevtools(hook(), {})).toBeNull();
  });
});
