import type { FiberLike } from './react-runtime.js';

// React DevTools hook(`__REACT_DEVTOOLS_GLOBAL_HOOK__`)에서 대상 DOM 요소의 fiber를 찾는다(FR-2·R-2).
// hook은 비공개 API이므로 형태를 최소한만 가정하고, 없거나 예외가 나면 null을 돌려주어 fiber 폴백을 쓰게 한다.
// DOM·chrome에 의존하지 않아 가짜 hook으로 단위 테스트할 수 있다(NFR-6).

export interface DevtoolsFiberRoot {
  current?: FiberLike | null;
}

export interface DevtoolsHook {
  renderers?: Map<number, unknown>;
  getFiberRoots?: (rendererId: number) => Iterable<DevtoolsFiberRoot> | undefined;
}

/** 비정상 트리에서 멈추지 않도록 두는 방문 상한. */
export const FIBER_VISIT_LIMIT = 20_000;

/** 트리를 DFS로 훑어 `stateNode`가 대상 요소인 fiber를 찾는다. */
export function findFiberByStateNode(
  root: unknown,
  target: unknown,
  limit: number = FIBER_VISIT_LIMIT,
): FiberLike | null {
  if (typeof root !== 'object' || root === null) return null;

  const stack: FiberLike[] = [root as FiberLike];
  let visited = 0;
  while (stack.length > 0) {
    if (visited >= limit) return null;
    const fiber = stack.pop();
    if (!fiber) continue;
    visited += 1;
    if (fiber.stateNode === target) return fiber;
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return null;
}

/**
 * 등록된 renderer의 root들을 훑어 대상 요소의 fiber를 찾는다.
 * renderer가 없거나 roots를 얻지 못하면(미설치·주입 시점 차이) null이다(E-2).
 */
export function fiberFromDevtools(hook: DevtoolsHook | null | undefined, target: unknown): FiberLike | null {
  if (!hook || typeof hook !== 'object' || !hook.renderers) return null;

  try {
    const { renderers } = hook;
    if (typeof renderers.keys !== 'function' || typeof hook.getFiberRoots !== 'function') return null;

    const rendererIds: number[] = [];
    for (const id of renderers.keys()) rendererIds.push(id);
    if (rendererIds.length === 0) return null;

    for (const id of rendererIds) {
      const roots = hook.getFiberRoots(id);
      if (!roots) continue;
      for (const root of roots) {
        const found = findFiberByStateNode(root.current, target);
        if (found) return found;
      }
    }
  } catch {
    // 비공개 API가 바뀌어 예외가 나면 즉시 포기한다(R-2).
    return null;
  }
  return null;
}
