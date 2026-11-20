import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CommentStore } from './comment-store.js';
import { withProtectionWarning } from './protection.js';
import { PendingChangeSchema, ScreenCommentSchema } from './schema.js';
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
export function createMcpFactory(store: ChangeStore, commentStore: CommentStore): () => McpServer {
  return () => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    server.registerTool(
      'list_pending_changes',
      {
        title: 'List pending style changes',
        description:
          'Returns style changes edited in the browser that are not yet applied to source. ' +
          'Each change has the source location (file:line:column), CSS property, before value and new value. ' +
          'Changes whose source is in a protected area (shared component or design system source) carry a warning field; confirm with the user before editing the original.',
        outputSchema: z.object({ changes: z.array(PendingChangeSchema) }),
        annotations: { readOnlyHint: true },
      },
      () => jsonResult({ changes: store.listPending().map(withProtectionWarning) }),
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

    server.registerTool(
      'list_comments',
      {
        title: 'List open screen comments',
        description:
          'Returns comments written on the page in the browser that are still open. ' +
          'Each comment has the source location (file:line:column, inherited), selector hint, page URL, body, status and id. ' +
          'Comments made on React apps without the build plugin also carry an optional component field (name, definition and call-site positions, owner chain, and location precision; line-unverified means the line is approximate). ' +
          'To apply a comment, open the source at the reported location (or the component definition when the element location is approximate), make the change the body asks for, then call mark_comments_resolved with its id.',
        outputSchema: z.object({ comments: z.array(ScreenCommentSchema) }),
        annotations: { readOnlyHint: true },
      },
      () => jsonResult({ comments: commentStore.listOpen() }),
    );

    server.registerTool(
      'mark_comments_resolved',
      {
        title: 'Mark screen comments as resolved',
        description:
          'Marks the given comment ids as resolved so they no longer appear in list_comments. ' +
          'Call it only after the requested change has been applied to the source file.',
        inputSchema: z.object({ ids: z.array(z.string()).min(1) }),
        outputSchema: z.object({ resolved: z.array(z.string()), notFound: z.array(z.string()) }),
        annotations: { idempotentHint: true },
      },
      ({ ids }) => jsonResult(commentStore.markResolved(ids)),
    );

    return server;
  };
}
