import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { createServer, type PluginOption } from 'vite';
import { describe, expect, it } from 'vitest';
import { reactInjector } from '../src/injectors/react.js';
import { vueInjector } from '../src/injectors/vue.js';
import domirror from '../src/vite.js';
import { originalPositionFor, positionOf } from './helpers/sourcemap.js';

/** NFR-4: 주입 후에도 소스맵이 원본 라인·컬럼으로 역매핑된다. */

type RawMap = { mappings: string; sources: (string | null)[] };

/** 주입으로 밀려난 토큰들이 원본 위치로 정확히 되돌아가는지 확인한다. */
function expectRoundTrip(original: string, generated: string, map: RawMap, id: string, needles: string[]): void {
  for (const needle of needles) {
    const from = positionOf(generated, needle);
    expect(originalPositionFor(map, from.line, from.column), needle).toEqual({ source: id, ...positionOf(original, needle) });
  }
}

describe('주입기 소스맵', () => {
  it('React: 주입 뒤로 밀린 속성·자식 요소가 원본 위치로 역매핑된다', () => {
    const id = '/proj/src/App.tsx';
    const code = [
      "// 한글 주석 😀",
      'export const A = () => (',
      '  <div className="a">',
      '    <span id="b">x</span>',
      '  </div>',
      ');',
      '',
    ].join('\n');
    const out = reactInjector.transform(code, id, { root: '/proj' });
    expect(out).not.toBeNull();
    expect(out?.code).toContain('data-domirror');
    expectRoundTrip(code, out?.code ?? '', out?.map as RawMap, id, ['className="a"', '<span', 'id="b"', '</div>', ');']);
  });

  it('Vue: <script>가 앞선 SFC에서 템플릿 속성·보간이 원본 위치로 역매핑된다', () => {
    const id = '/proj/src/App.vue';
    const code = [
      '<script setup lang="ts">',
      "const msg = '안녕';",
      '</script>',
      '',
      '<template>',
      '  <main class="page">',
      '    <h1 class="title">{{ msg }}</h1>',
      '  </main>',
      '</template>',
      '',
    ].join('\n');
    const out = vueInjector.transform(code, id, { root: '/proj' });
    expect(out).not.toBeNull();
    expect(out?.code).toContain('data-domirror');
    expectRoundTrip(code, out?.code ?? '', out?.map as RawMap, id, [
      "const msg = '안녕';",
      'class="page"',
      '<h1',
      'class="title"',
      '{{ msg }}',
      '</template>',
    ]);
  });
});

describe('Vite 파이프라인 소스맵', () => {
  const cases: { name: string; root: string; entry: string; file: string; framework: () => PluginOption }[] = [
    {
      name: 'React',
      root: fileURLToPath(new URL('../../../examples/react-vite', import.meta.url)),
      entry: '/src/App.tsx',
      file: 'src/App.tsx',
      framework: () => react(),
    },
    {
      name: 'Vue',
      root: fileURLToPath(new URL('../../../examples/vue-vite', import.meta.url)),
      entry: '/src/App.vue',
      file: 'src/App.vue',
      framework: () => vue(),
    },
  ];

  it.each(cases)('$name: 프레임워크 컴파일 뒤 최종 소스맵이 주입 전 원본 위치를 가리킨다', async (c) => {
    const server = await createServer({
      root: c.root,
      configFile: false,
      plugins: [domirror({ enabled: true }), c.framework()],
      server: { middlewareMode: true },
      logLevel: 'silent',
    });
    try {
      const result = await server.transformRequest(c.entry);
      const generated = result?.code ?? '';
      const map = result?.map as RawMap | null | undefined;
      expect(generated).toContain('data-domirror');
      expect(map?.mappings).toBeTruthy();

      // `<h1 class(Name)="title">`의 문자열 리터럴은 주입 속성 뒤에 있어 주입 맵이 체인에 빠지면 컬럼이 어긋난다.
      const original = readFileSync(`${c.root}/${c.file}`, 'utf8');
      const from = positionOf(generated, '"title"');
      const back = originalPositionFor(map as RawMap, from.line, from.column);
      expect(back?.source?.split('/').at(-1)).toBe(c.file.split('/').at(-1));
      expect({ line: back?.line, column: back?.column }).toEqual(positionOf(original, '"title"'));
    } finally {
      await server.close();
    }
  });
});
