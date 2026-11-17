#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { DEFAULT_PORT, MCP_PATH } from '@domirror/shared';
import { CommentStore } from './comment-store.js';
import { createHttpServer } from './http.js';
import { ChangeStore } from './store.js';

/** 바인딩 주소는 고정이며 옵션으로 바꿀 수 없다(NFR-1). */
const HOST = '127.0.0.1';

function fail(message: string): never {
  console.error(`[domirror] ${message}`);
  process.exit(1);
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) fail(`잘못된 포트: ${value}`);
  return port;
}

let values: { port?: string; 'extension-id'?: string };
try {
  ({ values } = parseArgs({
    options: {
      port: { type: 'string' },
      'extension-id': { type: 'string' },
    },
  }));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const portArg = values.port ?? process.env.DOMIRROR_PORT;
const port = portArg === undefined || portArg === '' ? DEFAULT_PORT : parsePort(portArg);
const extensionId = values['extension-id'] || undefined;

const server = createHttpServer({ store: new ChangeStore(), commentStore: new CommentStore(), extensionId });

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    fail(`포트 ${port} 사용 중. domirror-server가 이미 실행 중인지 확인하거나 --port로 다른 포트를 지정하세요.`);
  }
  fail(error.message);
});

server.listen(port, HOST, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`[domirror] listening on http://${HOST}:${actualPort} (MCP: http://${HOST}:${actualPort}${MCP_PATH})`);
  if (extensionId) console.log(`[domirror] allowed extension id: ${extensionId}`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
