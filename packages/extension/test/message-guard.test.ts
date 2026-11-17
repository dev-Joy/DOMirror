import type { ContentToWorkerCommentsMessage, ContentToWorkerMessage, ScreenCommentInput } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import { isSendCommentsMessage, isSendMessage } from '../src/message-guard.js';

const comment: ScreenCommentInput = {
  id: 'cmt-1',
  source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
  selectorHint: 'div.card',
  pageUrl: 'http://localhost:5173/',
  body: '패딩이 너무 넓어 보입니다',
  createdAt: '2026-11-16T00:00:00.000Z',
};

const commentsMessage: ContentToWorkerCommentsMessage = {
  type: 'domirror:send-comments',
  port: 47321,
  comments: [comment],
};

describe('isSendCommentsMessage', () => {
  it('정상 코멘트 전송 메시지를 통과시킨다', () => {
    expect(isSendCommentsMessage(commentsMessage)).toBe(true);
  });

  it('port가 숫자가 아니면 거부한다', () => {
    expect(isSendCommentsMessage({ ...commentsMessage, port: '47321' })).toBe(false);
  });

  it('comments가 배열이 아니면 거부한다', () => {
    expect(isSendCommentsMessage({ ...commentsMessage, comments: { 0: comment } })).toBe(false);
  });

  it('null·문자열은 거부한다', () => {
    expect(isSendCommentsMessage(null)).toBe(false);
    expect(isSendCommentsMessage('domirror:send-comments')).toBe(false);
  });

  it('domirror:send 메시지는 거부한다(상호배타)', () => {
    const sendMessage: ContentToWorkerMessage = { type: 'domirror:send', port: 47321, changes: [] };
    expect(isSendCommentsMessage(sendMessage)).toBe(false);
  });
});

describe('isSendMessage', () => {
  it('domirror:send-comments 메시지는 거부한다(상호배타)', () => {
    expect(isSendMessage(commentsMessage)).toBe(false);
  });
});
