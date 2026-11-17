import { describe, expect, it } from 'vitest';
import type { Injector } from '@domirror/shared';
import { createTransformer, defaultInjectors, protectedPatterns } from '../src/core.js';
import { createDesignSystemMatcher } from '../src/design-system.js';
import { toRelativeFile } from '../src/paths.js';

const root = '/proj';
const transform = createTransformer({ root, injectors: defaultInjectors });
const jsx = 'export const A = () => <div />;\n';

describe('toRelativeFile', () => {
  it('루트 기준 posix 상대 경로를 돌려준다', () => {
    expect(toRelativeFile('/proj', '/proj/src/App.tsx')).toBe('src/App.tsx');
    expect(toRelativeFile('/proj', '/proj/src/App.tsx?v=1')).toBe('src/App.tsx');
    expect(toRelativeFile('C:\\proj', 'C:\\proj\\src\\App.tsx')).toBe('src/App.tsx');
  });

  it('루트 밖·node_modules·가상 모듈은 null', () => {
    expect(toRelativeFile('/proj', '/other/App.tsx')).toBeNull();
    expect(toRelativeFile('/proj', '/proj/node_modules/lib/App.tsx')).toBeNull();
    expect(toRelativeFile('/proj', '\0virtual:App.tsx')).toBeNull();
    expect(toRelativeFile('/proj', '/proj')).toBeNull();
  });
});

describe('createTransformer', () => {
  it('루트 안의 파일에 상대 경로로 주입하고 절대 경로를 넣지 않는다', () => {
    const out = transform(jsx, '/proj/src/App.tsx');
    expect(out?.code).toContain('data-domirror="src/App.tsx:1:24"');
    expect(out?.code).not.toContain('/proj/');
  });

  it('루트 밖 파일은 null', () => {
    expect(transform(jsx, '/elsewhere/App.tsx')).toBeNull();
  });

  it('node_modules 파일은 null', () => {
    expect(transform(jsx, '/proj/node_modules/pkg/App.tsx')).toBeNull();
  });

  it('쿼리 붙은 id는 null', () => {
    expect(transform(jsx, '/proj/src/App.tsx?import')).toBeNull();
    expect(transform('<template><div /></template>', '/proj/src/App.vue?vue&type=template&lang.js')).toBeNull();
  });

  it('대상 확장자가 아니면 null', () => {
    expect(transform('export const a = 1;', '/proj/src/a.ts')).toBeNull();
  });
});

describe('AC-1: designSystem 판정', () => {
  const globMatcher = createDesignSystemMatcher(['src/ds/**']);
  const specifierMatcher = createDesignSystemMatcher(['@acme/ui']);

  it('정의 파일 경로는 glob으로 일치한다', () => {
    expect(globMatcher({ file: 'src/ds/Button.tsx' })).toBe(true);
    expect(globMatcher({ file: 'src/components/Card.tsx' })).toBe(false);
  });

  it('import specifier는 정확 일치·하위 경로로 일치한다', () => {
    expect(specifierMatcher({ specifier: '@acme/ui' })).toBe(true);
    expect(specifierMatcher({ specifier: '@acme/ui/button' })).toBe(true);
    expect(specifierMatcher({ specifier: '@acme/uikit' })).toBe(false);
  });

  it('빈 배열은 항상 false다', () => {
    const matcher = createDesignSystemMatcher([]);
    expect(matcher({ file: 'src/ds/Button.tsx' })).toBe(false);
    expect(matcher({ specifier: '@acme/ui' })).toBe(false);
  });

  it('createTransformer가 같은 판정 함수 참조를 ctx로 넘긴다', () => {
    const seen: (unknown)[] = [];
    const fake: Injector = {
      name: 'fake',
      test: (id) => id.endsWith('.js'),
      transform(code, _id, ctx) {
        seen.push(ctx.isDesignSystem);
        return { code, map: null };
      },
    };
    const isDesignSystem = createDesignSystemMatcher(['src/ds/**']);
    const run = createTransformer({ root, injectors: [fake], isDesignSystem });

    run('export const a = 1;\n', '/proj/src/ds/entry.js');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(isDesignSystem);
    expect(isDesignSystem({ file: 'src/ds/Button.tsx' })).toBe(true);
  });
});

describe('AC-1: protected 판정', () => {
  it('protected 미설정이면 designSystem 패턴을 그대로 쓴다', () => {
    const patterns = protectedPatterns({ designSystem: ['src/ds/**'] });
    expect(patterns).toEqual(['src/ds/**']);

    const matcher = createDesignSystemMatcher(patterns);
    expect(matcher({ file: 'src/ds/Button.tsx' })).toBe(true);
    expect(matcher({ file: 'src/components/Card.tsx' })).toBe(false);
  });

  it('protected가 빈 배열이면 패턴 보호가 없다', () => {
    const patterns = protectedPatterns({ designSystem: ['src/ds/**'], protected: [] });
    expect(patterns).toEqual([]);

    const matcher = createDesignSystemMatcher(patterns);
    expect(matcher({ file: 'src/ds/Button.tsx' })).toBe(false);
    expect(matcher({ file: 'src/components/Card.tsx' })).toBe(false);
  });

  it('protected가 designSystem보다 우선한다', () => {
    const patterns = protectedPatterns({ protected: ['src/shared/**'] });
    expect(patterns).toEqual(['src/shared/**']);

    const matcher = createDesignSystemMatcher(patterns);
    expect(matcher({ file: 'src/shared/Box.tsx' })).toBe(true);
    expect(matcher({ file: 'src/ds/Button.tsx' })).toBe(false);
  });

  it('createTransformer가 같은 isProtected 참조를 ctx로 넘긴다', () => {
    const seen: (unknown)[] = [];
    const fake: Injector = {
      name: 'fake',
      test: (id) => id.endsWith('.js'),
      transform(code, _id, ctx) {
        seen.push(ctx.isProtected);
        return { code, map: null };
      },
    };
    const matcher = createDesignSystemMatcher(protectedPatterns({ protected: ['src/shared/**'] }));
    const isProtected = (file: string) => matcher({ file });
    const run = createTransformer({ root, injectors: [fake], isProtected });

    run('export const a = 1;\n', '/proj/src/shared/entry.js');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(isProtected);
    expect(isProtected('src/shared/Box.tsx')).toBe(true);
  });
});
