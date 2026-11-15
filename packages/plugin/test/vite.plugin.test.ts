import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Injector } from '@domirror/shared';
import react from '@vitejs/plugin-react';
import { build, createLogger, createServer, type Logger, type Plugin } from 'vite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InjectError } from '../src/inject-utils.js';
import domirror from '../src/vite.js';

/** 배치 B: 사용자 주입기 확장(AC-4), 프로덕션 경고(NFR-2), 주입 실패 오류 위치(NFR-4). */

const reactRoot = fileURLToPath(new URL('../../../examples/react-vite', import.meta.url));

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

/** Vite 훅은 함수 또는 `{ handler }` 형태라 둘 다 호출할 수 있게 한다. */
function callHook(hook: unknown, ctx: unknown, ...args: unknown[]): unknown {
  const fn = (typeof hook === 'function' ? hook : (hook as { handler: AnyFn }).handler) as AnyFn;
  return fn.apply(ctx, args);
}

/** `[domirror]`로 시작하는 경고만 모으는 커스텀 logger. */
function captureLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  const base = createLogger('silent');
  const logger: Logger = {
    ...base,
    warn(msg) {
      warnings.push(msg);
    },
    warnOnce(msg) {
      warnings.push(msg);
    },
  };
  return { logger, warnings };
}

function domirrorWarnings(warnings: string[]): string[] {
  return warnings.filter((msg) => msg.includes('[domirror]'));
}

/** `configResolved`까지 호출해 둔 플러그인과 그 `transform` 호출 함수. */
function setupPlugin(plugin: Plugin, isProduction = false): (code: string, id: string, ctx?: unknown) => unknown {
  callHook(plugin.configResolved, {}, { root: '/proj', isProduction, logger: captureLogger().logger });
  return (code, id, ctx = {}) => callHook(plugin.transform, ctx, code, id);
}

describe('AC-4: 사용자 주입기(injectors 옵션)', () => {
  let root = '';

  beforeAll(() => {
    // macOS의 /var → /private/var 심볼릭 링크로 루트 판정이 어긋나지 않도록 실경로를 쓴다.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'domirror-plugin-')));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/entry.js'), "export const marker = 'original';\n");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('가짜 주입기 1개를 추가하면 익스텐션·서버 변경 없이 Vite 변환에 적용된다', async () => {
    const calls: { id: string; root: string }[] = [];
    const fake: Injector = {
      name: 'fake',
      test: (id) => !/[?#]/.test(id) && id.endsWith('.js'),
      transform(code, id, ctx) {
        calls.push({ id, root: ctx.root });
        return { code: code.replace("'original'", "'injected-by-fake'"), map: null };
      },
    };

    const server = await createServer({
      root,
      configFile: false,
      plugins: [domirror({ enabled: true, injectors: [fake] })],
      server: { middlewareMode: true },
      logLevel: 'silent',
    });
    try {
      const result = await server.transformRequest('/src/entry.js');
      expect(result?.code).toContain('injected-by-fake');
      expect(calls).toEqual([{ id: join(root, 'src/entry.js'), root }]);
    } finally {
      await server.close();
    }
  });

  it('사용자 주입기는 기본 주입기 뒤에 놓여, 같은 파일을 다투면 기본 주입기가 우선한다', () => {
    const fake: Injector = {
      name: 'fake',
      test: (id) => /\.(tsx|fake)$/.test(id),
      transform: (code) => ({ code: `/* fake */${code}`, map: null }),
    };
    const transform = setupPlugin(domirror({ enabled: true, injectors: [fake] }));

    const tsx = transform('export const A = () => <div />;\n', '/proj/src/App.tsx') as { code: string } | null;
    expect(tsx?.code).toContain('data-domirror="src/App.tsx:1:24"');
    expect(tsx?.code).not.toContain('/* fake */');

    const other = transform('x', '/proj/src/a.fake') as { code: string } | null;
    expect(other?.code).toBe('/* fake */x');
  });

  it('enabled가 true가 아니면 사용자 주입기도 호출되지 않는다', () => {
    const fake: Injector = { name: 'fake', test: () => true, transform: vi.fn(() => ({ code: 'x', map: null })) };
    const transform = setupPlugin(domirror({ injectors: [fake] }));
    expect(transform('x', '/proj/src/a.js')).toBeNull();
    expect(fake.transform).not.toHaveBeenCalled();
  });
});

describe('NFR-2: 프로덕션 모드 경고', () => {
  // Vite는 `config.isProduction`을 NODE_ENV로 정한다. vitest가 넣는 'test'를 지워 CLI처럼 mode 기본값을 따르게 한다.
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function buildReact(enabled: boolean): Promise<string[]> {
    const { logger, warnings } = captureLogger();
    await build({
      root: reactRoot,
      configFile: false,
      mode: 'production',
      plugins: [domirror({ enabled }), react()],
      build: { write: false },
      customLogger: logger,
    });
    return domirrorWarnings(warnings);
  }

  it('enabled:true 프로덕션 빌드에서 경고가 정확히 1회 출력된다', async () => {
    const warnings = await buildReact(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('프로덕션 모드 빌드에 소스 위치를 주입합니다');
  });

  it('enabled:false 프로덕션 빌드에서는 경고가 0회다', async () => {
    expect(await buildReact(false)).toHaveLength(0);
  });

  it('enabled:true dev 서버에서는 경고가 0회다', async () => {
    const { logger, warnings } = captureLogger();
    const server = await createServer({
      root: reactRoot,
      configFile: false,
      plugins: [domirror({ enabled: true }), react()],
      server: { middlewareMode: true },
      customLogger: logger,
    });
    try {
      await server.transformRequest('/src/App.tsx');
    } finally {
      await server.close();
    }
    expect(domirrorWarnings(warnings)).toHaveLength(0);
  });
});

describe('NFR-4: 주입 실패 시 파일:라인:컬럼', () => {
  const failing: Injector = {
    name: 'fake',
    test: (id) => id.endsWith('.js'),
    transform(_code, id) {
      throw new InjectError('fake', id.endsWith('entry.js') ? 'src/entry.js' : 'src/a.js', 2, 3, new Error('boom'));
    },
  };

  it('Vite 어댑터가 this.error로 메시지·id·0-based 컬럼 loc을 올린다', () => {
    const transform = setupPlugin(domirror({ enabled: true, injectors: [failing] }));
    const error = vi.fn((payload: unknown) => {
      throw Object.assign(new Error('plugin error'), { payload });
    });

    expect(() => transform('x', '/proj/src/a.js', { error })).toThrow('plugin error');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith({
      message: '[domirror] fake 주입 실패: src/a.js:2:3 — boom',
      id: '/proj/src/a.js',
      loc: { line: 2, column: 2 },
    });
  });

  it('InjectError가 아닌 예외는 그대로 다시 던진다', () => {
    const plain: Injector = {
      name: 'plain',
      test: () => true,
      transform() {
        throw new TypeError('plain failure');
      },
    };
    const transform = setupPlugin(domirror({ enabled: true, injectors: [plain] }));
    const error = vi.fn();
    expect(() => transform('x', '/proj/src/a.js', { error })).toThrow('plain failure');
    expect(error).not.toHaveBeenCalled();
  });

  it('실제 Vite 변환 실패 메시지에 파일:라인:컬럼이 담긴다', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'domirror-plugin-err-')));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/entry.js'), 'export const a = 1;\n');
    const server = await createServer({
      root,
      configFile: false,
      plugins: [domirror({ enabled: true, injectors: [failing] })],
      server: { middlewareMode: true },
      logLevel: 'silent',
    });
    try {
      const failure = await server.transformRequest('/src/entry.js').then(
        () => null,
        (error: unknown) => error as Error & { plugin?: string; loc?: { line: number; column: number } },
      );
      expect(failure?.message).toContain('src/entry.js:2:3');
      expect(failure?.plugin).toBe('domirror');
      expect(failure?.loc).toMatchObject({ line: 2, column: 2 });
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
