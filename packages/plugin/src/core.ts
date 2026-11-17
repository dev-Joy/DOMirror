import type { InjectResult, Injector } from '@domirror/shared';
import type { DesignSystemMatcher } from './design-system.js';
import { reactInjector } from './injectors/react.js';
import { vueInjector } from './injectors/vue.js';
import { toRelativeFile } from './paths.js';

export interface DomirrorOptions {
  /** 기본 false (NFR-2). 명시적으로 true일 때만 주입한다. */
  enabled?: boolean;
  /** 기본 주입기 뒤에 추가된다 (FR-4). */
  injectors?: Injector[];
  /** 정의 파일 경로 glob 또는 import specifier. 일치하면 DS 속성을 넣는다. 기본 []. */
  designSystem?: string[];
  /** 보호 영역(수정 금지) 판정 패턴. 미설정이면 `designSystem`을 쓰고, `[]`면 패턴 보호 없음. */
  protected?: string[];
}

export const defaultInjectors: Injector[] = [reactInjector, vueInjector];

/** 보호 영역 판정에 쓸 패턴 목록. 미설정이면 `designSystem`으로 폴백한다 (FR-1). */
export function protectedPatterns(options: DomirrorOptions): string[] {
  return options.protected ?? options.designSystem ?? [];
}

/** 번들러를 모르는 코어 변환기. 처음으로 `test`를 통과한 주입기 하나만 적용한다. */
export function createTransformer(opts: {
  root: string;
  injectors: Injector[];
  isDesignSystem?: DesignSystemMatcher;
  isProtected?: (file: string) => boolean;
}): (code: string, id: string) => InjectResult | null {
  const { root, injectors, isDesignSystem, isProtected } = opts;

  return (code, id) => {
    // 루트 밖·node_modules·가상 모듈·쿼리 붙은 id에는 주입하지 않는다 (NFR-2).
    if (/[?#]/.test(id) || toRelativeFile(root, id) === null) return null;

    const injector = injectors.find((candidate) => candidate.test(id));
    if (!injector) return null;
    return injector.transform(code, id, { root, isDesignSystem, isProtected });
  };
}
