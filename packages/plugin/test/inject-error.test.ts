import { describe, expect, it, vi } from 'vitest';
import { InjectError } from '../src/inject-utils.js';
import { reactInjector } from '../src/injectors/react.js';
import { vueInjector } from '../src/injectors/vue.js';

/** NFR-4: 주입기 내부 예외는 원인 파일·위치를 담은 InjectError로 감싸진다. */

vi.mock('../src/inject-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/inject-utils.js')>();
  return {
    ...actual,
    attributeText: () => {
      throw new Error('boom');
    },
  };
});

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

describe('주입기 예외 래핑', () => {
  it('React: 첫 호스트 요소 위치를 메시지와 필드에 담는다', () => {
    const code = 'export const A = () => (\n  <div className="a" />\n);\n';
    const error = thrown(() => reactInjector.transform(code, '/proj/src/App.tsx', { root: '/proj' }));
    expect(error).toBeInstanceOf(InjectError);
    expect((error as InjectError).message).toBe('[domirror] react 주입 실패: src/App.tsx:2:3 — boom');
    expect(error).toMatchObject({ file: 'src/App.tsx', line: 2, column: 3 });
  });

  it('Vue: 첫 네이티브 요소 위치를 메시지와 필드에 담는다', () => {
    const code = '<template>\n  <main class="page"></main>\n</template>\n';
    const error = thrown(() => vueInjector.transform(code, '/proj/src/App.vue', { root: '/proj' }));
    expect(error).toBeInstanceOf(InjectError);
    expect((error as InjectError).message).toBe('[domirror] vue 주입 실패: src/App.vue:2:3 — boom');
    expect(error).toMatchObject({ file: 'src/App.vue', line: 2, column: 3 });
  });
});
