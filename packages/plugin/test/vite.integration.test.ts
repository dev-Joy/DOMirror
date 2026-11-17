import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMIRROR_COMPONENT_ATTR, DOMIRROR_DS_ATTR } from '@domirror/shared';
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

async function buildChunks(c: Case, enabled: boolean, designSystem: string[] = []): Promise<string> {
  const output = await build({
    root: c.root,
    configFile: false,
    mode: 'production',
    plugins: [domirror({ enabled, designSystem }), c.framework()],
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

/** domirror(`enforce: 'pre'`) 바로 뒤에 실행되어, 프레임워크 컴파일 전 주입 결과를 모은다 (AC-5). */
function captureInjection(target: string): { plugin: PluginOption; code: () => string } {
  let captured = '';
  const plugin: PluginOption = {
    name: 'test:capture-injection',
    enforce: 'pre',
    transform(code, id) {
      if (id === target) captured = code;
      return null;
    },
  };
  return { plugin, code: () => captured };
}

/**
 * 컴포넌트 정보 값 추출용. JSX prop 표기(`data-domirror-component="..."`)와 컴파일된 객체 리터럴
 * (`"data-domirror-component": "..."`, 따옴표 종류 무관)을 모두 잡는다 (AC-5).
 */
const COMPONENT_VALUE = /data-domirror-component["']?\s*[:=]\s*["'`]([^"'`\\]*(?:\\.[^"'`\\]*)*)["'`]/g;

/** 주입된 컴포넌트 정보 속성 값 목록. 값이 0건이면 빈 배열을 돌려준다 (AC-5). */
function componentValues(code: string): string[] {
  return [...code.matchAll(COMPONENT_VALUE)].map((match) => match[1]);
}

/** `이름|경로` 값의 형태와, 빌드 루트 절대 경로가 섞이지 않았는지 단언한다 (AC-5·NFR-2). */
function expectRelativeValues(values: string[], root: string): void {
  for (const value of values) {
    // 구분자가 사라지면 이름이나 경로 중 하나만 남은 것이므로 형태부터 확인한다.
    expect(value).toContain('|');
    expect(value).not.toContain(root);
    expect(value.split('|')[1] ?? '').not.toMatch(/^\/|[A-Za-z]:[\\/]/);
  }
}

describe.each(cases)('Vite 통합: $name', (c) => {
  it('dev 변환 결과에 소스 위치 속성이 있다', async () => {
    const capture = captureInjection(`${c.root}/${c.file}`);
    const server = await createServer({
      root: c.root,
      configFile: false,
      plugins: [domirror({ enabled: true }), capture.plugin, c.framework()],
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

    // 컴포넌트 정보 값은 프레임워크 컴파일 전 원본에서 확인한다 (AC-5·NFR-2).
    const values = componentValues(capture.code());
    expect(values.length).toBeGreaterThan(0);
    expectRelativeValues(values, c.root);
  });

  it('프로덕션 빌드 산출물에 소스 위치 속성이 유지된다', async () => {
    const code = await buildChunks(c, true);
    expect(code).toContain('data-domirror');
    expect(code).toContain(expectedLocation(c));

    // 컴파일된 산출물에서도 컴포넌트 정보 값이 추출되어야 한다(정규식이 표기를 놓치면 0건으로 실패).
    const values = componentValues(code);
    expect(values.length).toBeGreaterThan(0);
    expectRelativeValues(values, c.root);
  });

  it('enabled:false 프로덕션 빌드에는 속성이 0건이다', async () => {
    // designSystem을 넘겨도 enabled:false면 컴포넌트 정보 속성도 주입되지 않는다 (NFR-1).
    const code = await buildChunks(c, false, ['src/ds/**']);
    expect(code.length).toBeGreaterThan(0);
    expect(code).not.toContain('data-domirror');
    expect(code).not.toContain(DOMIRROR_COMPONENT_ATTR);
    expect(code).not.toContain(DOMIRROR_DS_ATTR);
  });
});

describe('사용처 측 배선: designSystem 옵션 (FR-5)', () => {
  const c = cases[0];
  const usageFile = join(c.root, 'src/ds-usage.tsx');
  /** 디자인 시스템 모듈을 흉내 내는 specifier. 별칭으로 예제의 컴포넌트를 가리킨다. */
  const specifier = '@acme/ui';
  const usage = `import { Card } from '${specifier}';\n\nexport function Demo() {\n  return (<main><Card /></main>);\n}\n`;

  it('import specifier가 designSystem 패턴과 일치하면 이름·DS 속성이 주입된다', async () => {
    const capture = captureInjection(usageFile);
    const server = await createServer({
      root: c.root,
      configFile: false,
      plugins: [
        domirror({ enabled: true, designSystem: [specifier] }),
        capture.plugin,
        {
          name: 'test:ds-usage-fixture',
          resolveId(source) {
            // react 플러그인이 자기 자신을 절대 경로로 import하는 요청도 같은 파일로 돌린다.
            return source === '/src/ds-usage.tsx' || source === usageFile ? usageFile : null;
          },
          load(id) {
            return id === usageFile ? usage : null;
          },
        },
        react(),
      ],
      resolve: { alias: { [specifier]: join(c.root, 'src/components/Card.tsx') } },
      server: { middlewareMode: true },
      logLevel: 'silent',
    });
    try {
      const result = await server.transformRequest('/src/ds-usage.tsx');
      // 프레임워크 컴파일 이후에도 속성이 남는다.
      expect(result?.code).toContain(DOMIRROR_DS_ATTR);
    } finally {
      await server.close();
    }

    // 사용처 컴포넌트 이름표는 `태그이름|import specifier` 형식이다.
    const code = capture.code();
    expect(code).toContain(`data-domirror-component="Card|${specifier}"`);
    expect(code).toContain(DOMIRROR_DS_ATTR);
  });
});
