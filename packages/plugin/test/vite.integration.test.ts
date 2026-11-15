import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { build, createServer, type PluginOption } from 'vite';
import { describe, expect, it } from 'vitest';
import domirror from '../src/vite.js';

/** R-1 실증: 실제 예제 프로젝트를 루트로 dev 변환과 프로덕션 빌드 양쪽에서 속성 유지 여부를 단언한다. */

interface Case {
  name: string;
  root: string;
  entry: string;
  file: string;
  framework: () => PluginOption;
}

const cases: Case[] = [
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

/** 예제 소스에서 `<h1`의 위치를 1부터 시작하는 line:column으로 계산한다. */
function expectedLocation(c: Case): string {
  const source = readFileSync(`${c.root}/${c.file}`, 'utf8');
  const offset = source.indexOf('<h1');
  const before = source.slice(0, offset).split('\n');
  return `${c.file}:${before.length}:${(before.at(-1) ?? '').length + 1}`;
}

async function buildChunks(c: Case, enabled: boolean): Promise<string> {
  const output = await build({
    root: c.root,
    configFile: false,
    mode: 'production',
    plugins: [domirror({ enabled }), c.framework()],
    build: { write: false },
    logLevel: 'silent',
  });
  const outputs = Array.isArray(output) ? output : [output];
  let code = '';
  for (const out of outputs) {
    if (!('output' in out)) throw new Error('예상하지 못한 빌드 결과(watcher)');
    for (const item of out.output) {
      if (item.type === 'chunk') code += item.code;
    }
  }
  return code;
}

describe.each(cases)('Vite 통합: $name', (c) => {
  it('dev 변환 결과에 소스 위치 속성이 있다', async () => {
    const server = await createServer({
      root: c.root,
      configFile: false,
      plugins: [domirror({ enabled: true }), c.framework()],
      server: { middlewareMode: true },
      logLevel: 'silent',
    });
    try {
      const result = await server.transformRequest(c.entry);
      expect(result?.code).toContain('data-domirror');
      expect(result?.code).toContain(expectedLocation(c));
    } finally {
      await server.close();
    }
  });

  it('프로덕션 빌드 산출물에 소스 위치 속성이 유지된다', async () => {
    const code = await buildChunks(c, true);
    expect(code).toContain('data-domirror');
    expect(code).toContain(expectedLocation(c));
  });

  it('enabled:false 프로덕션 빌드에는 속성이 0건이다', async () => {
    const code = await buildChunks(c, false);
    expect(code.length).toBeGreaterThan(0);
    expect(code).not.toContain('data-domirror');
  });
});
