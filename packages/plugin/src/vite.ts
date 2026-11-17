import type { InjectResult } from '@domirror/shared';
import type { Plugin } from 'vite';
import { createTransformer, defaultInjectors, protectedPatterns, type DomirrorOptions } from './core.js';
import { createDesignSystemMatcher } from './design-system.js';
import { InjectError } from './inject-utils.js';

export type { DomirrorOptions } from './core.js';

const PRODUCTION_WARNING = '[domirror] 프로덕션 모드 빌드에 소스 위치·컴포넌트 정보를 주입합니다. 운영 배포물에 사용하지 마세요.';

/** Vite 어댑터. JSX·SFC가 컴파일되기 전 원본을 받도록 `enforce: 'pre'`로 동작한다. */
export default function domirror(options: DomirrorOptions = {}): Plugin {
  const enabled = options.enabled === true;
  let transform: ((code: string, id: string) => InjectResult | null) | null = null;

  return {
    name: 'domirror',
    enforce: 'pre',

    configResolved(config) {
      if (!enabled) return;
      const protectedMatcher = createDesignSystemMatcher(protectedPatterns(options));
      transform = createTransformer({
        root: config.root,
        injectors: [...defaultInjectors, ...(options.injectors ?? [])],
        isDesignSystem: createDesignSystemMatcher(options.designSystem ?? []),
        isProtected: (file) => protectedMatcher({ file }),
      });
      if (config.isProduction) config.logger.warn(PRODUCTION_WARNING);
    },

    transform(code, id) {
      if (!transform) return null;
      try {
        const result = transform(code, id);
        if (!result) return null;
        return { code: result.code, map: result.map as { mappings: string } };
      } catch (error) {
        if (error instanceof InjectError) {
          this.error({ message: error.message, id, loc: { line: error.line, column: error.column - 1 } });
        }
        throw error;
      }
    },
  };
}
