import { scanInstances } from './instance-count.js';
import { summarizeProps } from './props-summary.js';
import { describeRuntime, nearestComponent, type FiberLike } from './react-runtime.js';
import type { RuntimeBridgeResult } from './runtime-bridge.js';

// 브리지(MAIN world) 응답 본문을 조립하는 순수 함수(INT-012 FR-2·FR-5). page-bridge.ts는 import 시 window·document에
// 접근하므로 단위 테스트할 수 있도록 조립만 분리했다(NFR-6). 응답에는 문자열·숫자·불리언만 담는다(NFR-3).

/**
 * 선택 fiber에서 컴포넌트 정보(`info`·`hostSource`)에 props 요약과 인스턴스 수를 더한다.
 * props는 `info`에 넣지 않는다 — `info`는 코멘트로 서버에 실려 나가기 때문이다(D-S1·NFR-4).
 */
export function inspectFiber(fiber: FiberLike, via: 'devtools' | 'fiber'): RuntimeBridgeResult {
  const result: RuntimeBridgeResult = describeRuntime(fiber, via);
  const nearest = nearestComponent(fiber);
  if (!nearest) return result;

  let current = nearest;
  try {
    const scan = scanInstances(nearest);
    current = scan.current;
    if (scan.instanceCount) result.instanceCount = scan.instanceCount;
  } catch {
    // 계수 실패는 인스턴스 줄만 생략한다(E-1).
  }

  let props: string | undefined;
  try {
    props = summarizeProps(current.memoizedProps);
  } catch {
    try {
      props = summarizeProps(nearest.memoizedProps);
    } catch {
      props = undefined;
    }
  }
  if (props !== undefined) result.props = props;
  return result;
}
