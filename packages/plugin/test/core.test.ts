import { describe, expect, it } from 'vitest';
import { createTransformer, defaultInjectors } from '../src/core.js';
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
