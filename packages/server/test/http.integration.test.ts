import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CHANGES_PATH, COMMENTS_PATH, HEALTH_PATH, MCP_PATH, type ScreenCommentInput, type StyleChangeInput } from '@domirror/shared';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommentStore } from '../src/comment-store.js';
import { createHttpServer, MAX_BODY_BYTES } from '../src/http.js';
import { ChangeStore } from '../src/store.js';

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let server: Server;
let port: number;
let commentStore: CommentStore;

function raw(opts: { method: string; path: string; headers?: Record<string, string>; body?: string }): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: opts.method, path: opts.path, headers: opts.headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    // 413 응답 후 서버가 연결을 닫으면 쓰기 쪽 오류가 날 수 있으나 응답은 이미 받았다.
    req.on('error', reject);
    req.end(opts.body);
  });
}

function postChanges(body: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return raw({ method: 'POST', path: CHANGES_PATH, headers: { 'Content-Type': 'application/json', ...headers }, body });
}

function postComments(body: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return raw({ method: 'POST', path: COMMENTS_PATH, headers: { 'Content-Type': 'application/json', ...headers }, body });
}

/** 확장 프로그램 Origin(`origin.ts` 규칙상 허용되는 값). */
const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

const change: StyleChangeInput = {
  id: 'chg-1',
  source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
  selectorHint: 'div.card',
  property: 'padding',
  before: { authored: '8px', computed: '8px' },
  after: '16px',
  pageUrl: 'http://localhost:5173/',
  createdAt: '2026-11-16T00:00:00.000Z',
};

const comment: ScreenCommentInput = {
  id: 'cmt-1',
  source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
  selectorHint: 'div.card',
  pageUrl: 'http://localhost:5173/',
  body: '패딩이 너무 좁아 보여요',
  createdAt: '2026-11-16T00:00:00.000Z',
};

beforeAll(async () => {
  commentStore = new CommentStore();
  server = createHttpServer({ store: new ChangeStore(), commentStore });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('domirror server (HTTP + MCP)', () => {
  it('127.0.0.1에만 바인딩한다 (AC-10)', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('GET /health → 200', async () => {
    const res = await raw({ method: 'GET', path: HEALTH_PATH });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ name: 'domirror', pending: 0 });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // 클라이언트 기본값은 2025 세대 initialize(legacy), 'auto'는 server/discover로 2026 세대(modern)를 협상한다.
  it.each(['legacy', 'auto'] as const)('POST /changes → MCP list_pending_changes → mark_changes_applied → 재조회 0건 (AC-7 서버 측, %s)', async (mode) => {
    const posted = await postChanges(JSON.stringify({ changes: [change] }), {
      Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    });
    expect(posted.status).toBe(200);
    expect(JSON.parse(posted.body)).toEqual({ accepted: 1, ids: ['chg-1'] });

    const client = new Client({ name: 'domirror-test', version: '0.0.0' }, { versionNegotiation: { mode } });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual([
        'list_comments',
        'list_pending_changes',
        'mark_changes_applied',
        'mark_comments_resolved',
      ]);

      const listed = await client.callTool({ name: 'list_pending_changes', arguments: {} });
      expect(listed.isError).not.toBe(true);
      const pending = (listed.structuredContent as { changes: unknown[] }).changes;
      expect(pending).toEqual([{ ...change, status: 'pending' }]);
      expect(pending[0]).toMatchObject({
        source: { file: 'src/App.tsx', line: 12, column: 5 },
        property: 'padding',
        before: { authored: '8px', computed: '8px' },
        after: '16px',
      });
      const text = listed.content.find((c) => c.type === 'text');
      expect(text && JSON.parse(text.text)).toEqual(listed.structuredContent);

      const marked = await client.callTool({ name: 'mark_changes_applied', arguments: { ids: ['chg-1', 'nope'] } });
      expect(marked.structuredContent).toEqual({ applied: ['chg-1'], notFound: ['nope'] });

      const empty = await client.callTool({ name: 'mark_changes_applied', arguments: { ids: [] } });
      expect(empty.isError).toBe(true);

      const relisted = await client.callTool({ name: 'list_pending_changes', arguments: {} });
      expect(relisted.structuredContent).toEqual({ changes: [] });
    } finally {
      await client.close();
    }
  });

  it('허용되지 않은 Origin → 403 (AC-10)', async () => {
    const res = await postChanges(JSON.stringify({ changes: [change] }), { Origin: 'http://evil.example' });
    expect(res.status).toBe(403);
    expect((await raw({ method: 'GET', path: HEALTH_PATH, headers: { Origin: 'http://localhost:5173' } })).status).toBe(403);
    expect((await raw({ method: 'POST', path: MCP_PATH, headers: { Origin: 'http://evil.example' } })).status).toBe(403);
  });

  it('허용되지 않은 Host → 403 (DNS rebinding)', async () => {
    expect((await raw({ method: 'GET', path: HEALTH_PATH, headers: { Host: 'evil.example' } })).status).toBe(403);
    expect((await raw({ method: 'POST', path: MCP_PATH, headers: { Host: 'evil.example:80' } })).status).toBe(403);
  });

  it('잘못된 본문 → 400', async () => {
    expect((await postChanges('{not json')).status).toBe(400);
    expect((await postChanges(JSON.stringify({ changes: [{ ...change, source: null }] }))).status).toBe(400);
    expect((await postChanges(JSON.stringify({}))).status).toBe(400);
  });

  // 서버는 413을 먼저 응답하고 남은 본문을 버린다. 응답을 받으면 전송을 멈추고 요청을 끊는다.
  function postOversized(declareLength: boolean, path: string = CHANGES_PATH): Promise<number> {
    return new Promise((resolve, reject) => {
      let responded = false;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (declareLength) headers['Content-Length'] = String(MAX_BODY_BYTES + 1);
      const req = request({ host: '127.0.0.1', port, method: 'POST', path, headers }, (res) => {
        responded = true;
        res.resume();
        resolve(res.statusCode ?? 0);
        req.destroy();
      });
      req.on('error', (error) => {
        if (!responded) reject(error);
      });
      if (declareLength) {
        req.flushHeaders();
        return;
      }
      const chunk = 'x'.repeat(64 * 1024);
      const pump = (): void => {
        if (responded || req.destroyed) return;
        req.write(chunk, () => setImmediate(pump));
      };
      pump();
    });
  }

  it('1MB 초과 → 413 (Content-Length 선언)', async () => {
    expect(await postOversized(true)).toBe(413);
  });

  it('1MB 초과 → 413 (chunked 스트림)', async () => {
    expect(await postOversized(false)).toBe(413);
  });

  it('비 JSON Content-Type → 415', async () => {
    const res = await raw({ method: 'POST', path: CHANGES_PATH, headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(res.status).toBe(415);
  });

  it('기타 경로 → 404', async () => {
    expect((await raw({ method: 'GET', path: '/nope' })).status).toBe(404);
  });

  it('POST /comments → 200, 저장소에 필드·status 그대로 저장 (AC-1)', async () => {
    const res = await postComments(JSON.stringify({ comments: [comment] }), { Origin: EXTENSION_ORIGIN });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ accepted: 1, ids: ['cmt-1'] });

    // 저장소 직접 조회로 저장 필드·status를 먼저 확인한다(MCP 경유 단언은 아래 AC-1 MCP 테스트에서 별도 확인).
    expect(commentStore.listOpen()).toEqual([{ ...comment, status: 'open' }]);

    // 빈 배열도 허용한다(accepted: 0).
    const empty = await postComments(JSON.stringify({ comments: [] }));
    expect(empty.status).toBe(200);
    expect(JSON.parse(empty.body)).toEqual({ accepted: 0, ids: [] });
  });

  it('POST /comments 검증: 403(Origin·Host)·400·415·413·GET 404 (AC-2)', async () => {
    const body = JSON.stringify({ comments: [comment] });
    expect((await postComments(body, { Origin: 'http://evil.example' })).status).toBe(403);
    expect(
      (await raw({ method: 'POST', path: COMMENTS_PATH, headers: { 'Content-Type': 'application/json', Host: 'evil.example:80' }, body }))
        .status,
    ).toBe(403);

    expect((await postComments('{not json')).status).toBe(400);
    expect((await postComments(JSON.stringify({}))).status).toBe(400);
    expect((await postComments(JSON.stringify({ comments: [{ ...comment, body: '' }] }))).status).toBe(400);
    expect((await postComments(JSON.stringify({ comments: [{ ...comment, body: 'x'.repeat(2001) }] }))).status).toBe(400);
    expect((await postComments(JSON.stringify({ comments: [{ ...comment, source: null }] }))).status).toBe(400);

    expect((await raw({ method: 'POST', path: COMMENTS_PATH, headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);

    expect(await postOversized(true, COMMENTS_PATH)).toBe(413);
    expect(await postOversized(false, COMMENTS_PATH)).toBe(413);

    // GET /comments는 열지 않는다.
    expect((await raw({ method: 'GET', path: COMMENTS_PATH })).status).toBe(404);
  });

  it('코멘트 POST 후에도 GET /health의 pending은 CSS 변경 수만 센다 (NFR-5)', async () => {
    expect((await postComments(JSON.stringify({ comments: [comment] }))).status).toBe(200);
    const health = await raw({ method: 'GET', path: HEALTH_PATH });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ pending: 0 });
  });

  it('POST /comments → MCP list_comments → mark_comments_resolved → 재조회 제외 (AC-1 · Q2=B)', async () => {
    const target: ScreenCommentInput = { ...comment, id: 'cmt-mcp' };
    expect((await postComments(JSON.stringify({ comments: [target] }), { Origin: EXTENSION_ORIGIN })).status).toBe(200);

    const client = new Client({ name: 'domirror-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
    try {
      const listed = await client.callTool({ name: 'list_comments', arguments: {} });
      expect(listed.isError).not.toBe(true);
      const comments = (listed.structuredContent as { comments: unknown[] }).comments;
      // 같은 id의 코멘트가 status 'open'와 함께 필드 그대로 돌아온다.
      expect(comments).toContainEqual({ ...target, status: 'open' });
      const text = listed.content.find((c) => c.type === 'text');
      expect(text && JSON.parse(text.text)).toEqual(listed.structuredContent);

      const marked = await client.callTool({ name: 'mark_comments_resolved', arguments: { ids: ['cmt-mcp'] } });
      expect(marked.structuredContent).toEqual({ resolved: ['cmt-mcp'], notFound: [] });

      // 빈 배열은 스키마(min 1) 위반으로 도구 오류 응답.
      const empty = await client.callTool({ name: 'mark_comments_resolved', arguments: { ids: [] } });
      expect(empty.isError).toBe(true);

      const missing = await client.callTool({ name: 'mark_comments_resolved', arguments: { ids: ['nope'] } });
      expect(missing.structuredContent).toEqual({ resolved: [], notFound: ['nope'] });

      const relisted = await client.callTool({ name: 'list_comments', arguments: {} });
      const remaining = (relisted.structuredContent as { comments: { id: string }[] }).comments;
      expect(remaining.map((c) => c.id)).not.toContain('cmt-mcp');
    } finally {
      await client.close();
    }
  });

  it('component 선택 필드: 있는 코멘트는 그대로, 없는 기존 코멘트도 200 (INT-011 FR-9·NFR-2·AC-6)', async () => {
    const runtime = {
      name: 'Card',
      definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const },
      callSite: { file: 'src/App.tsx', line: 20, column: 7, precision: 'line-unverified' as const },
      owners: ['Card', 'App'],
      via: 'fiber' as const,
    };
    const withComponent: ScreenCommentInput = { ...comment, id: 'cmt-runtime', component: runtime };
    const legacy: ScreenCommentInput = { ...comment, id: 'cmt-legacy' };

    const posted = await postComments(JSON.stringify({ comments: [withComponent, legacy] }), { Origin: EXTENSION_ORIGIN });
    expect(posted.status).toBe(200);

    const client = new Client({ name: 'domirror-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
    try {
      const listed = await client.callTool({ name: 'list_comments', arguments: {} });
      const comments = (listed.structuredContent as { comments: { id: string; component?: unknown }[] }).comments;
      expect(comments.find((c) => c.id === 'cmt-runtime')?.component).toEqual(runtime);
      expect(comments.find((c) => c.id === 'cmt-legacy')).not.toHaveProperty('component');
    } finally {
      await client.close();
    }

    // 형식이 틀린 component는 스키마 위반으로 400이다.
    const broken = { ...comment, id: 'cmt-broken', component: { name: '', via: 'fiber' } };
    expect((await postComments(JSON.stringify({ comments: [broken] }), { Origin: EXTENSION_ORIGIN })).status).toBe(400);
  });

  it('instanceCount 선택 필드: 있는 변경은 list_pending_changes에 남고, 없는 기존 변경도 200 (INT-012 FR-8·NFR-2·AC-7)', async () => {
    const withCount: StyleChangeInput = { ...change, id: 'chg-ic', instanceCount: { count: 4, capped: false } };
    const legacy: StyleChangeInput = { ...change, id: 'chg-legacy', property: 'margin' };

    const posted = await postChanges(JSON.stringify({ changes: [withCount, legacy] }), { Origin: EXTENSION_ORIGIN });
    expect(posted.status).toBe(200);

    // 형식이 틀린 instanceCount는 스키마 위반으로 400이다.
    const broken = { ...change, id: 'chg-broken', instanceCount: { count: 0, capped: false } };
    expect((await postChanges(JSON.stringify({ changes: [broken] }), { Origin: EXTENSION_ORIGIN })).status).toBe(400);

    const client = new Client({ name: 'domirror-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
    try {
      const listed = await client.callTool({ name: 'list_pending_changes', arguments: {} });
      expect(listed.isError).not.toBe(true);
      const pending = (listed.structuredContent as { changes: { id: string; instanceCount?: unknown }[] }).changes;
      expect(pending.find((c) => c.id === 'chg-ic')?.instanceCount).toEqual({ count: 4, capped: false });
      expect(pending.find((c) => c.id === 'chg-legacy')).not.toHaveProperty('instanceCount');
      expect(pending.some((c) => c.id === 'chg-broken')).toBe(false);

      const marked = await client.callTool({ name: 'mark_changes_applied', arguments: { ids: ['chg-ic', 'chg-legacy'] } });
      expect(marked.structuredContent).toEqual({ applied: ['chg-ic', 'chg-legacy'], notFound: [] });
    } finally {
      await client.close();
    }
  });

  it('source.precision 선택 필드: exact·line-unverified·미기재 모두 200, 그 외 값은 400 (INT-013 AC-4)', async () => {
    const exact: StyleChangeInput = {
      ...change,
      id: 'chg-exact',
      source: { file: 'src/MainMenuView.jsx', line: 42, column: 7, inherited: true, precision: 'exact' },
    };
    const unverified: StyleChangeInput = {
      ...change,
      id: 'chg-unverified',
      source: { file: 'src/Card.tsx', line: 10, column: 25, inherited: false, precision: 'line-unverified' },
    };
    const legacy: StyleChangeInput = { ...change, id: 'chg-precision-legacy', property: 'border' };

    const posted = await postChanges(JSON.stringify({ changes: [exact, unverified, legacy] }), { Origin: EXTENSION_ORIGIN });
    expect(posted.status).toBe(200);

    const broken = { ...change, id: 'chg-approx', source: { ...change.source, precision: 'approx' } };
    expect((await postChanges(JSON.stringify({ changes: [broken] }), { Origin: EXTENSION_ORIGIN })).status).toBe(400);

    const client = new Client({ name: 'domirror-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}${MCP_PATH}`)));
    try {
      const listed = await client.callTool({ name: 'list_pending_changes', arguments: {} });
      expect(listed.isError).not.toBe(true);
      const pending = (listed.structuredContent as { changes: { id: string; source: { precision?: unknown } }[] }).changes;
      expect(pending.find((c) => c.id === 'chg-exact')?.source.precision).toBe('exact');
      expect(pending.find((c) => c.id === 'chg-unverified')?.source.precision).toBe('line-unverified');
      expect(pending.find((c) => c.id === 'chg-precision-legacy')?.source).not.toHaveProperty('precision');
      expect(pending.some((c) => c.id === 'chg-approx')).toBe(false);

      await client.callTool({
        name: 'mark_changes_applied',
        arguments: { ids: ['chg-exact', 'chg-unverified', 'chg-precision-legacy'] },
      });
    } finally {
      await client.close();
    }
  });
});
