import type { InstanceCount } from '@domirror/shared';
import { FIBER_VISIT_LIMIT } from './devtools-hook.js';
import type { FiberLike } from './react-runtime.js';

// 선택 컴포넌트와 같은 type의 fiber 수를 현재 커밋 트리에서 센다(INT-012 FR-5).
// DevTools·fiber 두 경로 모두 선택 fiber의 return 체인으로 HostRoot에 닿아 `stateNode.current`를 쓴다.
// hook의 getFiberRoots가 돌려주는 FiberRoot와 같은 객체이므로 "선택 요소가 속한 루트"만 센다(E-7).

/** Fiber tag 3 = HostRoot(react-reconciler). */
const HOST_ROOT = 3;

/** return 체인으로 HostRoot(tag 3)까지 올라가 `stateNode.current`(현재 커밋 트리)를 돌려준다. 실패 시 null. */
export function currentTreeRoot(fiber: FiberLike, limit: number = FIBER_VISIT_LIMIT): FiberLike | null {
  let current: FiberLike | null | undefined = fiber;
  for (let steps = 0; current && steps < limit; steps += 1) {
    if (current.tag === HOST_ROOT) {
      const root = current.stateNode;
      if (typeof root !== 'object' || root === null) return null;
      const tree = (root as { current?: unknown }).current;
      return typeof tree === 'object' && tree !== null ? (tree as FiberLike) : null;
    }
    current = current.return;
  }
  return null;
}

export interface InstanceScan {
  /** 1개 이상 셌을 때만 존재. */
  instanceCount?: InstanceCount;
  /** 현재 커밋 트리에서 찾은 같은 fiber(`component` 또는 `component.alternate`). 못 찾으면 `component`. */
  current: FiberLike;
}

/**
 * 현재 커밋 트리를 DFS로 훑어 `component.type`과 같은 type의 fiber 수를 센다.
 * memo·forwardRef 래퍼와 내부 함수는 type 객체가 달라 따로 센다(E-4). 방문 상한 도달 시 `capped: true`(E-5).
 */
export function scanInstances(component: FiberLike, limit: number = FIBER_VISIT_LIMIT): InstanceScan {
  const type = component.type;
  if (typeof type !== 'function' && (typeof type !== 'object' || type === null)) return { current: component };
  const root = currentTreeRoot(component, limit);
  if (!root) return { current: component };

  const alternate = component.alternate ?? null;
  let current = component;
  let count = 0;
  let capped = false;
  const stack: FiberLike[] = [root];
  let visited = 0;
  while (stack.length > 0) {
    if (visited >= limit) {
      capped = true;
      break;
    }
    const fiber = stack.pop();
    if (!fiber) continue;
    visited += 1;
    if (fiber.type === type) count += 1;
    if (fiber === component || fiber === alternate) current = fiber;
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return count > 0 ? { instanceCount: { count, capped }, current } : { current };
}
