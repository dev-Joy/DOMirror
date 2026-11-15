import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { CHANGES_PATH, HEALTH_PATH, MCP_PATH, type HealthResponse, type PostChangesResponse } from '@domirror/shared';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { localhostHostValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpFactory, SERVER_NAME, SERVER_VERSION } from './mcp.js';
import { isOriginAllowed } from './origin.js';
import { PostChangesRequestSchema } from './schema.js';
import type { ChangeStore } from './store.js';

/** `POST /changes`·`/mcp` 공통 본문 상한. */
export const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// CORS 헤더는 일절 내보내지 않는다(NFR-1).
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

/**
 * 상한 초과 시 즉시 413으로 거절하고, 남은 본문은 버퍼링 없이 흘려보낸다
 * (연결을 바로 끊으면 클라이언트가 응답을 읽기 전에 EPIPE로 실패할 수 있다).
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const tooLarge = new HttpError(413, 'Request body too large');
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      req.resume();
      reject(tooLarge);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.off('data', onData);
        req.off('end', onEnd);
        req.resume();
        chunks.length = 0;
        reject(tooLarge);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => resolve(Buffer.concat(chunks).toString('utf8'));
    req.on('data', onData);
    req.on('end', onEnd);
    req.once('error', reject);
  });
}

async function handlePostChanges(req: IncomingMessage, res: ServerResponse, store: ChangeStore): Promise<void> {
  if (!isJsonContentType(req.headers['content-type'])) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const text = await readBody(req);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  const parsed = PostChangesRequestSchema.safeParse(json);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid request body', issues: parsed.error.issues });
    return;
  }

  const ids = store.upsert(parsed.data.changes);
  sendJson(res, 200, { accepted: ids.length, ids } satisfies PostChangesResponse);
}

/** 바인딩은 호출 측(`listen(port, '127.0.0.1')`) 책임이다. */
export function createHttpServer(opts: { store: ChangeStore; extensionId?: string }): Server {
  const { store, extensionId } = opts;
  const validateHost = localhostHostValidation();
  const mcpHandler = createMcpHandler(createMcpFactory(store));
  const mcpNodeHandler = toNodeHandler(mcpHandler, { maxRequestBodySize: MAX_BODY_BYTES });

  const server = createServer((req, res) => {
    // DNS rebinding 차단: 전 경로 앞단에서 Host 검증(거부 시 가드가 403 응답).
    if (!validateHost(req, res)) return;
    if (!isOriginAllowed(req.headers.origin, { extensionId })) {
      sendJson(res, 403, { error: 'Origin not allowed' });
      return;
    }

    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (pathname === MCP_PATH) {
      void mcpNodeHandler(req, res);
      return;
    }
    if (pathname === HEALTH_PATH && req.method === 'GET') {
      sendJson(res, 200, { name: SERVER_NAME, version: SERVER_VERSION, pending: store.pendingCount() } satisfies HealthResponse);
      return;
    }
    if (pathname === CHANGES_PATH && req.method === 'POST') {
      handlePostChanges(req, res, store).catch((error: unknown) => {
        if (res.headersSent) return;
        if (error instanceof HttpError) {
          sendJson(res, error.status, { error: error.message });
        } else {
          sendJson(res, 500, { error: 'Internal server error' });
        }
      });
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  });

  server.on('close', () => {
    void mcpHandler.close();
  });
  return server;
}
