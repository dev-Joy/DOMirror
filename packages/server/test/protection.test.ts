import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CHANGES_PATH, MCP_PATH, type StyleChange, type StyleChangeInput } from '@domirror/shared';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommentStore } from '../src/comment-store.js';
import { createHttpServer } from '../src/http.js';
import { PROTECTED_AREA_MESSAGE, withProtectionWarning } from '../src/protection.js';
import { ChangeStore } from '../src/store.js';

// 기존 http.integration.test.ts와 상태를 공유하지 않도록 이 파일 전용 서버를 만든다.
let server: Server;
let port: number;

function raw(opts: { method: string; path: string; headers?: Record<string, string>; body?: string }): Promise<{
  status: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: opts.method, path: opts.path, headers: opts.headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

function postChanges(body: string): Promise<{ status: number; body: string }> {
  return raw({ method: 'POST', path: CHANGES_PATH, headers: { 'Content-Type': 'application/json' }, body });
}

function change(overrides: Partial<StyleChangeInput> = {}): StyleChangeInput {
  return {
    id: 'chg-protected',
    source: { file: 'packages/ui/src/Button.tsx', line: 3, column: 1, inherited: false },
    selectorHint: 'button.primary',
    property: 'padding',
    before: { authored: '8px', computed: '8px' },
    after: '16px',
    pageUrl: 'http://localhost:5173/',
    createdAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  };
}

async function listPendingChanges(): Promise<{ structuredContent: unknown; text: unknown }> {
  const client = new Client({ name: 'domirror-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
  try {
    const listed = await client.callTool({ name: 'list_pending_changes', arguments: {} });
    expect(listed.isError).not.toBe(true);
    const text = listed.content.find((c) => c.type === 'text');
    return { structuredContent: listed.structuredContent, text: text && JSON.parse(text.text) };
  } finally {
    await client.close();
  }
}

function findChange(structuredContent: unknown, id: string): { id: string; warning?: { code: string; reason: string; message: string } } {
  return (structuredContent as { changes: { id: string; warning?: { code: string; reason: string; message: string } }[] }).changes.find(
    (c) => c.id === id,
  )!;
}

beforeAll(async () => {
  server = createHttpServer({ store: new ChangeStore(), commentStore: new CommentStore() });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('withProtectionWarning', () => {
  it('source.protected: true → pattern 경고', () => {
    const out = withProtectionWarning({
      ...change({ source: { file: 'packages/ui/src/Button.tsx', line: 3, column: 1, inherited: false, protected: true } }),
      status: 'pending',
    });
    expect(out.warning).toEqual({ code: 'protected-area', reason: 'pattern', message: PROTECTED_AREA_MESSAGE });
  });

  it('node_modules 세그먼트가 pattern보다 우선한다', () => {
    const out = withProtectionWarning({
      ...change({ source: { file: 'node_modules/@acme/ui/src/Button.tsx', line: 3, column: 1, inherited: false, protected: true } }),
      status: 'pending',
    });
    expect(out.warning?.reason).toBe('node_modules');
  });

  it('보호 대상이 아니면 warning 필드 없이 같은 참조를 돌려준다', () => {
    const original: StyleChange = { ...change(), status: 'pending' };
    const out = withProtectionWarning(original);
    expect('warning' in out).toBe(false);
    expect(out).toBe(original);
  });

  it('node_modules는 `/` 세그먼트 기준으로만 일치한다', () => {
    const out = withProtectionWarning({
      ...change({ source: { file: 'src/node_modules_x/Foo.tsx', line: 3, column: 1, inherited: false } }),
      status: 'pending',
    });
    expect('warning' in out).toBe(false);
  });
});

describe('protected area warning (HTTP + MCP)', () => {
  it('보호 변경은 list_pending_changes에서 warning과 함께 돌아온다 (E-3)', async () => {
    const target = change({
      id: 'chg-protected-e',
      source: { file: 'packages/ui/src/Button.tsx', line: 3, column: 1, inherited: false, protected: true },
    });
    const posted = await postChanges(JSON.stringify({ changes: [target] }));
    expect(posted.status).toBe(200);
    expect(JSON.parse(posted.body)).toEqual({ accepted: 1, ids: ['chg-protected-e'] });

    const { structuredContent, text } = await listPendingChanges();
    const listed = findChange(structuredContent, 'chg-protected-e');
    expect(listed.warning).toEqual({ code: 'protected-area', reason: 'pattern', message: PROTECTED_AREA_MESSAGE });
    // 새 outputSchema 검증을 통과하고, content 텍스트 JSON과 structuredContent가 일치한다.
    expect(text).toEqual(structuredContent);
  });

  it('source.protected 없는 레거시 본문도 수용하고 warning을 만들지 않는다 (E-4)', async () => {
    const target = change({ id: 'chg-legacy-f' });
    expect('protected' in target.source).toBe(false);
    const posted = await postChanges(JSON.stringify({ changes: [target] }));
    expect(posted.status).toBe(200);
    expect(JSON.parse(posted.body)).toEqual({ accepted: 1, ids: ['chg-legacy-f'] });

    const { structuredContent } = await listPendingChanges();
    const listed = (structuredContent as { changes: { id: string }[] }).changes.find((c) => c.id === 'chg-legacy-f');
    expect(listed).toEqual({ ...target, status: 'pending' });
    expect(listed && 'warning' in listed).toBe(false);
  });

  it('같은 id를 protected: false로 재전송하면 warning이 사라진다 (E-6)', async () => {
    const id = 'chg-repost-g';
    const protectedSource = { file: 'packages/ui/src/Button.tsx', line: 3, column: 1, inherited: false, protected: true };
    expect((await postChanges(JSON.stringify({ changes: [change({ id, source: protectedSource })] }))).status).toBe(200);
    expect(findChange((await listPendingChanges()).structuredContent, id).warning).toBeDefined();

    const unprotected = change({
      id,
      source: { file: 'packages/ui/src/Button.tsx', line: 3, column: 1, inherited: false, protected: false },
    });
    expect((await postChanges(JSON.stringify({ changes: [unprotected] }))).status).toBe(200);

    const { structuredContent } = await listPendingChanges();
    const listed = (structuredContent as { changes: { id: string }[] }).changes.find((c) => c.id === id);
    expect(listed).toMatchObject({ id, source: { protected: false } });
    expect(listed && 'warning' in listed).toBe(false);
  });
});
