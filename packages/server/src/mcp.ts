import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { StyleChangeSchema } from './schema.js';
import type { ChangeStore } from './store.js';

export const SERVER_NAME = 'domirror';
// src/·dist/ 어느 쪽에서 실행해도 패키지 루트의 package.json을 가리킨다.
export const SERVER_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

function jsonResult<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

/** `createMcpHandler`가 요청마다 호출하는 factory. 저장소는 바깥에서 공유한다. */
export function createMcpFactory(store: ChangeStore): () => McpServer {
  return () => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    server.registerTool(
      'list_pending_changes',
      {
        title: 'List pending style changes',
        description:
          'Returns style changes edited in the browser that are not yet applied to source. ' +
          'Each change has the source location (file:line:column), CSS property, before value and new value.',
        outputSchema: z.object({ changes: z.array(StyleChangeSchema) }),
        annotations: { readOnlyHint: true },
      },
      () => jsonResult({ changes: store.listPending() }),
    );

    server.registerTool(
      'mark_changes_applied',
      {
        title: 'Mark style changes as applied',
        description: 'Marks the given change ids as applied so they no longer appear in list_pending_changes.',
        inputSchema: z.object({ ids: z.array(z.string()).min(1) }),
        outputSchema: z.object({ applied: z.array(z.string()), notFound: z.array(z.string()) }),
        annotations: { idempotentHint: true },
      },
      ({ ids }) => jsonResult(store.markApplied(ids)),
    );

    return server;
  };
}
