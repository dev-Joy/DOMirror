import type { ContentToWorkerCommentsMessage, ContentToWorkerMessage } from '@domirror/shared';

/** content → service worker 스타일 변경 전송 메시지 판별. */
export function isSendMessage(message: unknown): message is ContentToWorkerMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'domirror:send' &&
    typeof (message as { port?: unknown }).port === 'number' &&
    Array.isArray((message as { changes?: unknown }).changes)
  );
}

/** content → service worker 화면 코멘트 전송 메시지 판별. */
export function isSendCommentsMessage(message: unknown): message is ContentToWorkerCommentsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'domirror:send-comments' &&
    typeof (message as { port?: unknown }).port === 'number' &&
    Array.isArray((message as { comments?: unknown }).comments)
  );
}
