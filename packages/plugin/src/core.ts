import type { InjectResult, Injector } from '@domirror/shared';
import { reactInjector } from './injectors/react.js';
import { vueInjector } from './injectors/vue.js';
import { toRelativeFile } from './paths.js';

export interface DomirrorOptions {
  /** 기본 false (NFR-2). 명시적으로 true일 때만 주입한다. */
  enabled?: boolean;
  /** 기본 주입기 뒤에 추가된다 (FR-4). */
  injectors?: Injector[];
}

export const defaultInjectors: Injector[] = [reactInjector, vueInjector];

/** 번들러를 모르는 코어 변환기. 처음으로 `test`를 통과한 주입기 하나만 적용한다. */
export function createTransformer(opts: {
  root: string;
  injectors: Injector[];
}): (code: string, id: string) => InjectResult | null {
  const { root, injectors } = opts;

  return (code, id) => {
    // 루트 밖·node_modules·가상 모듈·쿼리 붙은 id에는 주입하지 않는다 (NFR-2).
    if (/[?#]/.test(id) || toRelativeFile(root, id) === null) return null;

    const injector = injectors.find((candidate) => candidate.test(id));
    if (!injector) return null;
    return injector.transform(code, id, { root });
  };
}
