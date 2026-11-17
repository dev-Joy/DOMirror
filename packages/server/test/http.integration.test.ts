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
      expect(tools.tools.map((t) => t.name).sort()).toEqual(['list_pending_changes', 'mark_changes_applied']);

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

    // MCP 도구는 다음 단계이므로 서버와 공유한 저장소를 직접 조회해 검증한다.
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
});
